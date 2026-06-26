// ============================================================
//  APTITUDE PAGE v2 — no nested template literals
// ============================================================
const AptPage = (() => {
  let questions = [];
  let currentIdx = 0;
  let selected = null;
  let revealed = false;
  let score = 0;

  function render() {
    const hasKey = Gemini.hasKey();
    const history = Store.state.aptHistory;
    const avgScore = history.length
      ? Math.round(history.slice(-10).reduce(function(s,h){return s+(h.score/h.total*100);},0) / Math.min(10,history.length))
      : 0;
    const diff = Store.state.aptDifficulty;
    const weakAreas = Store.state.aptWeakAreas;
    const topWeak = Object.entries(weakAreas).sort(function(a,b){return b[1]-a[1];}).slice(0,3).map(function(e){return e[0];});
    const scoreColor = avgScore >= 70 ? 'green' : avgScore >= 50 ? 'amber' : 'rose';

    const weakBar = topWeak.length
      ? '<div class="weak-topics-bar"><i class="ti ti-flame"></i> Focus areas: ' +
        topWeak.map(function(t){return '<span class="topic-badge warn">'+t+'</span>';}).join(' ') + '</div>'
      : '';

    document.getElementById('apt-page-content').innerHTML =
      '<div class="page-header">' +
        '<h1 class="page-title"><i class="ti ti-calculator"></i> Aptitude Practice</h1>' +
        '<p class="page-sub">15&ndash;20 questions daily &middot; Shortcuts &amp; explanations &middot; Campus placement style</p>' +
      '</div>' +
      UI.levelBar() +
      '<div class="quiz-stats-row">' +
        '<div class="stat-card"><div class="stat-num indigo">' + history.length + '</div><div class="stat-label">Sessions Done</div></div>' +
        '<div class="stat-card"><div class="stat-num ' + scoreColor + '">' + avgScore + '%</div><div class="stat-label">Avg Score</div></div>' +
        '<div class="stat-card"><div class="stat-num">' + UI.diffBadge(diff) + '</div><div class="stat-label">Difficulty</div></div>' +
        '<div class="stat-card"><div class="stat-num amber">' + score + '</div><div class="stat-label">Today\'s Score</div></div>' +
      '</div>' +
      weakBar +
      (hasKey ? '' : '<div id="apt-key-banner"></div>') +
      '<div id="apt-content">' +
        (questions.length ? '' :
          '<div class="quiz-start-card">' +
            '<div class="quiz-start-icon">&#x1F9EE;</div>' +
            '<h2>Ready for Aptitude Practice?</h2>' +
            '<p>17 questions: Quant, Logical Reasoning &amp; Coding Aptitude</p>' +
            (hasKey ? '<button class="btn primary btn-lg" onclick="AptPage.startSession()"><i class="ti ti-player-play"></i> Start Session</button>' : '') +
          '</div>') +
      '</div>';

    if (!hasKey) {
      var b = document.getElementById('apt-key-banner');
      if (b) UI.apiKeyBanner('apt-key-banner');
    }
    if (questions.length) renderQuestion();
  }

  async function startSession() {
    questions = []; currentIdx = 0; selected = null; revealed = false; score = 0;
    UI.loading('apt-content', 'Generating aptitude questions...');
    try {
      var q = await Gemini.generateAptitude(DATA.aptitudeTopics, Store.state.aptDifficulty, Store.state.aptWeakAreas, 17);
      if (!q || !q.length) throw new Error('No questions returned');
      questions = q;
      renderQuestion();
    } catch(e) {
      if (e.message === 'NO_KEY') UI.apiKeyBanner('apt-content');
      else UI.error('apt-content', 'Failed: ' + e.message, startSession);
    }
  }

  function renderQuestion() {
    var area = document.getElementById('apt-content');
    if (!area) return;
    if (currentIdx >= questions.length) { renderResult(); return; }
    var q = questions[currentIdx];
    var pct = Math.round((currentIdx / questions.length) * 100);

    var optionsHTML = (q.options || []).map(function(opt, i) {
      var cls = 'option-btn';
      if (revealed) {
        if (i === q.correct) cls += ' correct';
        else if (i === selected) cls += ' wrong';
        else cls += ' muted';
      } else if (i === selected) {
        cls += ' selected';
      }
      var disabled = revealed ? 'disabled' : '';
      return '<button class="' + cls + '" ' + disabled + ' onclick="AptPage.select(' + i + ')">' + opt + '</button>';
    }).join('');

    var submitHTML = !revealed
      ? '<button class="btn primary btn-submit" ' + (selected === null ? 'disabled' : '') + ' onclick="AptPage.submit()">Submit</button>'
      : '';

    var expHTML = '';
    if (revealed) {
      var shortcutHTML = q.shortcut
        ? '<div class="apt-shortcut"><i class="ti ti-bolt"></i> <strong>Shortcut:</strong> ' + q.shortcut + '</div>'
        : '';
      expHTML = '<div class="explanation-card ' + (selected === q.correct ? 'correct-bg' : 'wrong-bg') + '">' +
        '<strong>' + (selected === q.correct ? '&#x2705; Correct!' : '&#x274C; Incorrect') + '</strong>' +
        '<div class="apt-solution"><strong>&#x1F4DD; Solution:</strong> ' + q.solution + '</div>' +
        shortcutHTML +
        '<button class="btn primary" style="margin-top:10px" onclick="AptPage.next()">' +
          (currentIdx + 1 < questions.length ? 'Next Question' : 'See Results') +
        '</button>' +
      '</div>';
    }

    area.innerHTML =
      '<div class="quiz-progress-row">' +
        '<span>Question ' + (currentIdx+1) + ' of ' + questions.length + '</span>' +
        '<span>' + UI.topicBadge(q.topic) + ' ' + UI.diffBadge(q.difficulty || Store.state.aptDifficulty) + '</span>' +
        '<span class="quiz-score-live">Score: ' + score + '/' + currentIdx + '</span>' +
      '</div>' +
      UI.progressBar(pct, 'amber', 4) +
      '<div class="question-card">' +
        '<p class="question-text">' + q.question + '</p>' +
        '<div class="options-grid">' + optionsHTML + '</div>' +
        submitHTML + expHTML +
      '</div>';
  }

  function select(i) { selected = i; renderQuestion(); }

  function submit() {
    if (selected === null) return;
    revealed = true;
    var q = questions[currentIdx];
    if (selected === q.correct) {
      score++;
    } else {
      Store.state.aptWeakAreas[q.topic] = (Store.state.aptWeakAreas[q.topic] || 0) + 1;
      Store.save('aptWeakAreas');
    }
    renderQuestion();
  }

  function next() { currentIdx++; selected = null; revealed = false; renderQuestion(); }

  function renderResult() {
    var area = document.getElementById('apt-content');
    if (!area) return;
    var pct = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;
    Store.state.aptHistory.push({ date: Store.todayKey(), score: score, total: questions.length, difficulty: Store.state.aptDifficulty });
    Store.save('aptHistory');
    Store.updateDifficulty('aptHistory', 'aptDifficulty', score, questions.length);
    var xp = Math.round(DATA.xpRewards.aptitude * (pct / 100) * 2);
    Store.addXP(xp, 'Aptitude');
    Store.setScore('aiml', true);
    App.updateHUD();

    area.innerHTML =
      '<div class="result-card">' +
        '<div class="result-grade grade-' + (pct >= 80 ? 'A' : 'B') + '">' + (pct >= 80 ? '&#x1F3AF;' : '&#x1F4CA;') + '</div>' +
        '<h2>' + score + ' / ' + questions.length + '</h2>' +
        '<div class="result-pct">' + pct + '%</div>' +
        '<div class="result-xp">+' + xp + ' XP</div>' +
        '<div style="display:flex;gap:10px;justify-content:center;margin-top:16px;flex-wrap:wrap">' +
          '<button class="btn primary" onclick="AptPage.startSession()"><i class="ti ti-refresh"></i> New Session</button>' +
          '<button class="btn" onclick="App.showPage(\'dashboard\')">Dashboard</button>' +
        '</div>' +
      '</div>';
  }

  return {
    render: render,
    startSession: startSession,
    select: select,
    submit: submit,
    next: next
  };
})();
