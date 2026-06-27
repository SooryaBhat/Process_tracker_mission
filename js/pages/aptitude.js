// ============================================================
//  APTITUDE PAGE v3 — daily cache, progress persistence
// ============================================================
const AptPage = (() => {
  let questions = [];
  let currentIdx = 0;
  let selected   = null;
  let revealed   = false;
  let score      = 0;
  let completed  = false;

  function saveProgress() {
    Store.saveProgress('apt', { idx: currentIdx, score, revealed, selected, completed, questions });
  }

  function restoreProgress() {
    var p = Store.getProgress('apt');
    if (p.questions && p.questions.length) {
      questions  = p.questions;
      currentIdx = p.idx       || 0;
      score      = p.score     || 0;
      revealed   = p.revealed  || false;
      selected   = (p.selected !== undefined) ? p.selected : null;
      completed  = p.completed || false;
      return true;
    }
    return false;
  }

  function render() {
    var hasKey   = Gemini.hasKey();
    var history  = Store.state.aptHistory;
    var weakAreas = Store.state.aptWeakAreas;
    var avgScore = history.length
      ? Math.round(history.slice(-10).reduce(function(s,h){ return s+(h.score/h.total*100); },0) / Math.min(10,history.length))
      : 0;
    var diff = Store.state.aptDifficulty;
    var topWeak = Object.entries(weakAreas).sort(function(a,b){ return b[1]-a[1]; }).slice(0,3).map(function(e){ return e[0]; });
    var scoreColor = avgScore >= 70 ? 'green' : avgScore >= 50 ? 'amber' : 'rose';

    document.getElementById('apt-page-content').innerHTML =
      '<div class="page-header">' +
        '<h1 class="page-title"><i class="ti ti-calculator"></i> Aptitude Practice</h1>' +
        '<p class="page-sub">15&ndash;20 questions daily &middot; Shortcuts &amp; explanations &middot; Campus placement style</p>' +
      '</div>' +
      UI.levelBar() +
      '<div class="quiz-stats-row">' +
        '<div class="stat-card"><div class="stat-num indigo">'+history.length+'</div><div class="stat-label">Sessions Done</div></div>' +
        '<div class="stat-card"><div class="stat-num '+scoreColor+'">'+avgScore+'%</div><div class="stat-label">Avg Score</div></div>' +
        '<div class="stat-card"><div class="stat-num">'+UI.diffBadge(diff)+'</div><div class="stat-label">Difficulty</div></div>' +
        '<div class="stat-card"><div class="stat-num amber">'+score+'</div><div class="stat-label">Today\'s Score</div></div>' +
      '</div>' +
      (topWeak.length ? '<div class="weak-topics-bar"><i class="ti ti-flame"></i> Focus areas: '+
        topWeak.map(function(t){ return '<span class="topic-badge warn">'+t+'</span>'; }).join(' ')+'</div>' : '') +
      '<div id="apt-content"></div>';

    if (!hasKey && !Store.getCached('apt')) { UI.apiKeyBanner('apt-content'); return; }

    if (restoreProgress()) {
      if (completed) renderCompletedToday();
      else renderQuestion();
    } else {
      document.getElementById('apt-content').innerHTML =
        '<div class="quiz-start-card">' +
          '<div class="quiz-start-icon">&#x1F9EE;</div>' +
          '<h2>Ready for Aptitude Practice?</h2>' +
          '<p>17 questions: Quant, Logical Reasoning &amp; Coding Aptitude</p>' +
          (hasKey ? '<button class="btn primary btn-lg" onclick="AptPage.startSession()">' +
            '<i class="ti ti-player-play"></i> Start Session</button>' : '') +
        '</div>';
    }
  }

  async function startSession() {
    var cached = Store.getCached('apt');
    if (cached && Array.isArray(cached) && cached.length) {
      console.log('[Apt] loading from daily cache');
      questions = cached; currentIdx = 0; selected = null; revealed = false; score = 0; completed = false;
      saveProgress(); renderQuestion(); return;
    }
    questions = []; currentIdx = 0; selected = null; revealed = false; score = 0; completed = false;
    UI.loading('apt-content', 'Generating aptitude questions...');
    try {
      var q = await Gemini.generateAptitude(DATA.aptitudeTopics, Store.state.aptDifficulty, Store.state.aptWeakAreas, 17);
      if (!q || !q.length) throw new Error('No questions returned');
      questions = q;
      Store.setCached('apt', q);
      saveProgress();
      renderQuestion();
    } catch(e) {
      if (e.message === 'NO_KEY') UI.apiKeyBanner('apt-content');
      else UI.error('apt-content', e.message, startSession);
    }
  }

  function renderQuestion() {
    var area = document.getElementById('apt-content');
    if (!area) return;
    if (currentIdx >= questions.length) { finaliseSession(); return; }
    var q = questions[currentIdx];
    var pct = Math.round((currentIdx / questions.length) * 100);

    var optionsHTML = (q.options||[]).map(function(opt, i) {
      var cls = 'option-btn';
      if (revealed) {
        if (i === q.correct)   cls += ' correct';
        else if (i === selected) cls += ' wrong';
        else                     cls += ' muted';
      } else if (i === selected) cls += ' selected';
      return '<button class="'+cls+'" '+(revealed?'disabled':'')+' onclick="AptPage.select('+i+')">'+opt+'</button>';
    }).join('');

    area.innerHTML =
      '<div class="quiz-progress-row">' +
        '<span>Question '+(currentIdx+1)+' of '+questions.length+'</span>' +
        '<span>'+UI.topicBadge(q.topic)+' '+UI.diffBadge(q.difficulty||Store.state.aptDifficulty)+'</span>' +
        '<span class="quiz-score-live">Score: '+score+'/'+currentIdx+'</span>' +
      '</div>' +
      UI.progressBar(pct, 'amber', 4) +
      '<div class="question-card">' +
        '<p class="question-text">'+q.question+'</p>' +
        '<div class="options-grid">'+optionsHTML+'</div>' +
        (!revealed ? '<button class="btn primary btn-submit" '+(selected===null?'disabled':'')+' onclick="AptPage.submit()">Submit</button>' : '') +
        (revealed ? '<div class="explanation-card '+(selected===q.correct?'correct-bg':'wrong-bg')+'">' +
          '<strong>'+(selected===q.correct?'&#x2705; Correct!':'&#x274C; Incorrect')+'</strong>' +
          '<div class="apt-solution"><strong>&#x1F4DD; Solution:</strong> '+q.solution+'</div>' +
          (q.shortcut ? '<div class="apt-shortcut"><i class="ti ti-bolt"></i> <strong>Shortcut:</strong> '+q.shortcut+'</div>' : '') +
          '<button class="btn primary" style="margin-top:10px" onclick="AptPage.next()">' +
            (currentIdx+1<questions.length ? 'Next Question' : 'See Results') +
          '</button>' +
        '</div>' : '') +
      '</div>';
  }

  function select(i) { selected = i; saveProgress(); renderQuestion(); }

  function submit() {
    if (selected === null) return;
    revealed = true;
    if (selected === questions[currentIdx].correct) {
      score++;
    } else {
      Store.state.aptWeakAreas[questions[currentIdx].topic] = (Store.state.aptWeakAreas[questions[currentIdx].topic]||0)+1;
      Store.save('aptWeakAreas');
    }
    saveProgress(); renderQuestion();
  }

  function next() { currentIdx++; selected = null; revealed = false; saveProgress(); renderQuestion(); }

  function finaliseSession() {
    var pct = questions.length > 0 ? Math.round((score/questions.length)*100) : 0;
    Store.state.aptHistory.push({ date: Store.todayKey(), score, total: questions.length, difficulty: Store.state.aptDifficulty });
    Store.save('aptHistory');
    Store.updateDifficulty('aptHistory','aptDifficulty', score, questions.length);
    var xp = Math.round(DATA.xpRewards.aptitude * (pct/100) * 2);
    Store.addXP(xp, 'Aptitude');
    Store.setScore('aiml', true);
    App.updateHUD();
    completed = true; saveProgress();
    renderResult(pct, xp);
  }

  function renderResult(pct, xp) {
    var area = document.getElementById('apt-content');
    if (!area) return;
    area.innerHTML =
      '<div class="result-card">' +
        '<div class="result-grade grade-'+(pct>=80?'A':'B')+'">'+(pct>=80?'&#x1F3AF;':'&#x1F4CA;')+'</div>' +
        '<h2>'+score+' / '+questions.length+'</h2>' +
        '<div class="result-pct">'+pct+'%</div>' +
        '<div class="result-xp">+'+xp+' XP</div>' +
        '<div style="display:flex;gap:10px;justify-content:center;margin-top:16px;flex-wrap:wrap">' +
          '<button class="btn" onclick="App.showPage(\'dashboard\')">Dashboard</button>' +
        '</div>' +
      '</div>';
  }

  function renderCompletedToday() {
    var p = Store.getProgress('apt');
    var total = p.questions ? p.questions.length : 0;
    var pct   = total > 0 ? Math.round(((p.score||0)/total)*100) : 0;
    var area  = document.getElementById('apt-content');
    if (!area) return;
    area.innerHTML =
      '<div class="result-card">' +
        '<div class="result-grade grade-A">&#x2705;</div>' +
        '<h2>Completed for Today!</h2>' +
        '<div class="result-pct">Score: '+(p.score||0)+'/'+total+' &middot; '+pct+'%</div>' +
        '<p>Come back tomorrow for a fresh set.</p>' +
        '<div style="display:flex;gap:10px;justify-content:center;margin-top:16px;flex-wrap:wrap">' +
          '<button class="btn" onclick="App.showPage(\'dashboard\')">Dashboard</button>' +
        '</div>' +
      '</div>';
  }

  return { render, startSession, select, submit, next };
})();
