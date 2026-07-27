// ============================================================
//  STORE v3 — adds Python learning state + session progress
// ============================================================
const Store = (() => {
  const P = 'im26_';
  function get(k, d) {
    try { const v = localStorage.getItem(P+k); return v !== null ? JSON.parse(v) : d; } catch { return d; }
  }
  function set(k, v) { try { localStorage.setItem(P+k, JSON.stringify(v)); } catch {} }

  const state = {
    checks:     get('checks', {}),
    dsa:        get('dsa', Object.fromEntries((typeof DATA !== 'undefined' ? DATA.dsaTopics : []).map(t=>[t,0]))),
    apps:       get('apps', []),
    projPhases: get('projPhases', {}),
    milestones: get('milestones', []),
    notes:      get('notes', ''),
    scores:     get('scores', {}),
    weekly:     get('weekly', {}),

    xp:         get('xp', 0),
    bestStreak: get('bestStreak', 0),

    quizHistory:    get('quizHistory', []),
    quizWeakAreas:  get('quizWeakAreas', {}),
    quizDifficulty: get('quizDifficulty', 1),

    dsaAIHistory:  get('dsaAIHistory', []),
    dsaDifficulty: get('dsaDifficulty', 1),

    vocabHistory: get('vocabHistory', []),
    vocabStreak:  get('vocabStreak', 0),

    englishHistory:    get('englishHistory', []),
    englishDifficulty: get('englishDifficulty', 1),

    aptHistory:    get('aptHistory', []),
    aptWeakAreas:  get('aptWeakAreas', {}),
    aptDifficulty: get('aptDifficulty', 1),

    // Python learning
    pythonDay:         get('pythonDay', 1),            // current day in curriculum
    pythonHistory:     get('pythonHistory', []),        // [{date, day, topic, mcqScore, codingSolved}]
    pythonCodeReviews: get('pythonCodeReviews', {}),    // {date: reviewObj}

    // Daily AI content cache — {date: {quiz,dsa,vocab,english,apt,python}}
    aiCache: get('aiCache', {}),

    // Session progress — survives refresh — {date: {quiz:{...}, apt:{...}, english:{...}}}
    sessionProgress: get('sessionProgress', {})
  };

  function save(k) { set(k, state[k]); }
  function todayKey() { return new Date().toISOString().slice(0, 10); }

  // ── session progress ──────────────────────────────────────
  function getProgress(type) {
    var k = todayKey();
    if (!state.sessionProgress[k]) state.sessionProgress[k] = {};
    if (!state.sessionProgress[k][type]) state.sessionProgress[k][type] = {};
    return state.sessionProgress[k][type];
  }

  function saveProgress(type, data) {
    var k = todayKey();
    if (!state.sessionProgress[k]) state.sessionProgress[k] = {};
    var cur = state.sessionProgress[k][type] || {};
    state.sessionProgress[k][type] = Object.assign(cur, data);
    var keys = Object.keys(state.sessionProgress).sort();
    if (keys.length > 3) keys.slice(0, keys.length - 3).forEach(function(old) { delete state.sessionProgress[old]; });
    save('sessionProgress');
  }

  // ── AI cache ──────────────────────────────────────────────
  function getCached(type) {
    var k = todayKey();
    return (state.aiCache[k] && state.aiCache[k][type]) ? state.aiCache[k][type] : null;
  }

  function setCached(type, data) {
    var k = todayKey();
    if (!state.aiCache[k]) state.aiCache[k] = {};
    state.aiCache[k][type] = data;
    var keys = Object.keys(state.aiCache).sort();
    if (keys.length > 7) keys.slice(0, keys.length - 7).forEach(function(old) { delete state.aiCache[old]; });
    save('aiCache');
  }

  // ── scores ────────────────────────────────────────────────
  function getTodayScores() {
    var k = todayKey();
    if (!state.scores[k]) state.scores[k] = {};
    return state.scores[k];
  }

  function setScore(id, val) {
    var k = todayKey();
    if (!state.scores[k]) state.scores[k] = {};
    state.scores[k][id] = val;
    save('scores');
    snapshotWeekly();
  }

  function snapshotWeekly() {
    var k = todayKey();
    var sc = Object.values(getTodayScores()).filter(Boolean).length;
    var dsaT = Object.values(state.dsa).reduce(function(a,b){return a+b;}, 0);
    state.weekly[k] = { score: sc, dsa: dsaT };
    save('weekly');
  }

  // ── streaks / levels ──────────────────────────────────────
  function calcStreak() {
    var streak = 0;
    var d = new Date(); d.setHours(0,0,0,0);
    for (var i = 0; i < 365; i++) {
      var k = d.toISOString().slice(0,10);
      var sc = state.scores[k] || {};
      if (Object.values(sc).filter(Boolean).length > 0) { streak++; d.setDate(d.getDate()-1); }
      else break;
    }
    if (streak > state.bestStreak) { state.bestStreak = streak; save('bestStreak'); }
    return streak;
  }

  function dsaTotal() { return Object.values(state.dsa).reduce(function(a,b){return a+b;}, 0); }

  function daysSinceStart() {
    var now = new Date(); now.setHours(0,0,0,0);
    return Math.max(0, Math.floor((now - START_DATE) / 86400000));
  }

  function getWeek() {
    var days = ['Su','Mo','Tu','We','Th','Fr','Sa'];
    return Array.from({length:7}, function(_,i) {
      var d = new Date(); d.setDate(d.getDate()-(6-i)); d.setHours(0,0,0,0);
      var k = d.toISOString().slice(0,10);
      var w = state.weekly[k] || {score:0, dsa:0};
      return { label: days[d.getDay()], date: k, score: w.score, dsa: w.dsa };
    });
  }

  function addXP(amount, reason) {
    state.xp += amount;
    save('xp');
    if (typeof UI !== 'undefined') UI.showXPToast(amount, reason);
  }

  function getLevel() {
    var xp = state.xp;
    var levels = [0,100,250,500,900,1400,2100,3000,4200,5800,8000,11000,15000,20000,27000,36000];
    var lvl = 1;
    for (var i = 0; i < levels.length; i++) { if (xp >= levels[i]) lvl = i+1; }
    var nextXP = levels[Math.min(lvl, levels.length-1)] || levels[levels.length-1] + 5000*(lvl-levels.length+1);
    var currXP = levels[Math.min(lvl-1, levels.length-1)];
    return { level: lvl, xp: xp, nextXP: nextXP, currXP: currXP,
             progress: Math.min(100, Math.round(((xp-currXP)/(nextXP-currXP))*100)) };
  }

  function updateDifficulty(historyKey, diffKey, score, total) {
    var hist = state[historyKey].slice(-5);
    var avg = hist.length ? hist.reduce(function(s,h){return s+(h.score/h.total);},0)/hist.length : score/total;
    var diff = state[diffKey];
    if (avg >= 0.8 && diff < 3) diff++;
    else if (avg < 0.5 && diff > 1) diff--;
    state[diffKey] = diff;
    save(diffKey);
    return diff;
  }

  return {
    state, save, todayKey,
    getProgress, saveProgress,
    getCached, setCached,
    getTodayScores, setScore, snapshotWeekly,
    calcStreak, dsaTotal, daysSinceStart, getWeek,
    addXP, getLevel, updateDifficulty
  };
})();
