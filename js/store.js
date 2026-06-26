// ============================================================
//  STORE — localStorage persistence (extended v2)
// ============================================================
const Store = (() => {
  const P = 'im26_';
  function get(k, d) { try { const v = localStorage.getItem(P+k); return v !== null ? JSON.parse(v) : d; } catch { return d; } }
  function set(k, v) { try { localStorage.setItem(P+k, JSON.stringify(v)); } catch {} }

  const state = {
    // ---- Existing ----
    checks:     get('checks', {}),
    dsa:        get('dsa', Object.fromEntries((DATA?.dsaTopics||[]).map(t=>[t,0]))),
    apps:       get('apps', []),
    projPhases: get('projPhases', {}),
    milestones: get('milestones', []),
    notes:      get('notes', ''),
    scores:     get('scores', {}),
    weekly:     get('weekly', {}),

    // ---- XP & Levels ----
    xp:         get('xp', 0),
    bestStreak: get('bestStreak', 0),

    // ---- Technical Quiz ----
    quizHistory:  get('quizHistory', []),   // [{date, topic, score, total, difficulty}]
    quizWeakAreas:get('quizWeakAreas', {}), // {topic: failCount}
    quizDifficulty: get('quizDifficulty', 1), // 1=easy 2=medium 3=hard

    // ---- DSA AI ----
    dsaAIHistory: get('dsaAIHistory', []),  // [{date, topic, difficulty, solved}]
    dsaDifficulty: get('dsaDifficulty', 1),

    // ---- Vocabulary ----
    vocabHistory: get('vocabHistory', []),  // [{date, words:[{word,learned}]}]
    vocabStreak:  get('vocabStreak', 0),

    // ---- English ----
    englishHistory: get('englishHistory', []), // [{date, score, total, difficulty}]
    englishDifficulty: get('englishDifficulty', 1),

    // ---- Aptitude ----
    aptHistory:   get('aptHistory', []),    // [{date, score, total}]
    aptWeakAreas: get('aptWeakAreas', {}),
    aptDifficulty:get('aptDifficulty', 1),

    // ---- Today's AI content cache (avoids regenerating same day) ----
    aiCache:      get('aiCache', {}),       // {date: {quiz, dsa, vocab, english, apt}}
  };

  function save(k) { set(k, state[k]); }

  function todayKey() { return new Date().toISOString().slice(0,10); }

  function getTodayScores() {
    const k = todayKey();
    if (!state.scores[k]) state.scores[k] = {};
    return state.scores[k];
  }

  function setScore(id, val) {
    const k = todayKey();
    if (!state.scores[k]) state.scores[k] = {};
    state.scores[k][id] = val;
    save('scores');
    snapshotWeekly();
  }

  function snapshotWeekly() {
    const k = todayKey();
    const sc = Object.values(getTodayScores()).filter(Boolean).length;
    const dsaTotal = Object.values(state.dsa).reduce((a,b)=>a+b,0);
    state.weekly[k] = { score: sc, dsa: dsaTotal };
    save('weekly');
  }

  function calcStreak() {
    let streak = 0;
    const d = new Date(); d.setHours(0,0,0,0);
    for (let i=0; i<365; i++) {
      const k = d.toISOString().slice(0,10);
      const sc = state.scores[k]||{};
      if (Object.values(sc).filter(Boolean).length > 0) { streak++; d.setDate(d.getDate()-1); }
      else break;
    }
    if (streak > state.bestStreak) { state.bestStreak = streak; save('bestStreak'); }
    return streak;
  }

  function dsaTotal() { return Object.values(state.dsa).reduce((a,b)=>a+b,0); }

  function daysSinceStart() {
    const now = new Date(); now.setHours(0,0,0,0);
    return Math.max(0, Math.floor((now - START_DATE) / 86400000));
  }

  function getWeek() {
    const days = ['Su','Mo','Tu','We','Th','Fr','Sa'];
    return Array.from({length:7}, (_,i) => {
      const d = new Date(); d.setDate(d.getDate()-(6-i)); d.setHours(0,0,0,0);
      const k = d.toISOString().slice(0,10);
      const w = state.weekly[k]||{score:0, dsa:0};
      return { label: days[d.getDay()], date: k, score: w.score, dsa: w.dsa };
    });
  }

  function addXP(amount, reason) {
    state.xp += amount;
    save('xp');
    if (typeof UI !== 'undefined') UI.showXPToast(amount, reason);
  }

  function getLevel() {
    const xp = state.xp;
    const levels = [0,100,250,500,900,1400,2100,3000,4200,5800,8000,11000,15000,20000,27000,36000];
    let lvl = 1;
    for (let i=0; i<levels.length; i++) { if (xp >= levels[i]) lvl = i+1; }
    const nextXP = levels[Math.min(lvl, levels.length-1)] || levels[levels.length-1] + 5000*(lvl-levels.length+1);
    const currXP = levels[Math.min(lvl-1, levels.length-1)];
    return { level: lvl, xp, nextXP, currXP, progress: Math.min(100, Math.round(((xp-currXP)/(nextXP-currXP))*100)) };
  }

  // Adaptive difficulty: 1=easy 2=medium 3=hard
  function updateDifficulty(historyKey, diffKey, score, total) {
    const pct = score/total;
    const hist = state[historyKey].slice(-5); // last 5 sessions
    const avg = hist.length ? hist.reduce((s,h)=>s+(h.score/h.total),0)/hist.length : pct;
    let diff = state[diffKey];
    if (avg >= 0.8 && diff < 3) diff++;
    else if (avg < 0.5 && diff > 1) diff--;
    state[diffKey] = diff;
    save(diffKey);
    return diff;
  }

  // AI cache helpers
  function getCached(type) {
    const k = todayKey();
    return state.aiCache[k] && state.aiCache[k][type] ? state.aiCache[k][type] : null;
  }

  function setCached(type, data) {
    const k = todayKey();
    if (!state.aiCache[k]) state.aiCache[k] = {};
    state.aiCache[k][type] = data;
    // Clean old cache (keep last 7 days)
    const keys = Object.keys(state.aiCache).sort();
    if (keys.length > 7) { keys.slice(0, keys.length-7).forEach(old => delete state.aiCache[old]); }
    save('aiCache');
  }

  return {
    state, save, todayKey, getTodayScores, setScore,
    snapshotWeekly, calcStreak, dsaTotal, daysSinceStart, getWeek,
    addXP, getLevel, updateDifficulty, getCached, setCached
  };
})();
