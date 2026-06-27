// ============================================================
//  QUIZ PAGE v3 — daily cache, progress persistence, completed state
// ============================================================
const QuizPage = (() => {
  // runtime state (restored from Store on render)
  let questions    = [];
  let currentIdx   = 0;
  let selectedOption = null;
  let revealed     = false;
  let sessionScore = 0;
  let sessionAnswered = 0;
  let completed    = false;

  // ── helpers ───────────────────────────────────────────────
  function saveProgress() {
    Store.saveProgress('quiz', {
      idx: currentIdx,
      score: sessionScore,
      answered: sessionAnswered,
      revealed: revealed,
      selected: selectedOption,
      completed: completed,
      questions: questions   // persist the full set
    });
  }

  function restoreProgress() {
    const p = Store.getProgress('quiz');
    if (p.questions && p.questions.length) {
      questions       = p.questions;
      currentIdx      = p.idx      || 0;
      sessionScore    = p.score    || 0;
      sessionAnswered = p.answered || 0;
      revealed        = p.revealed || false;
      selectedOption  = (p.selected !== undefined) ? p.selected : null;
      completed       = p.completed || false;
      return true;
    }
    return false;
  }

  // ── render (entry point) ──────────────────────────────────
  function render() {
    const hasKey   = Gemini.hasKey();
    const diff     = Store.state.quizDifficulty;
    const history  = Store.state.quizHistory;
    const weakAreas = Store.state.quizWeakAreas;

    const avgScore = history.length
      ? Math.round(history.slice(-10).reduce(function(s,h){ return s+(h.score/h.total*100); }, 0) / Math.min(10, history.length))
      : 0;
    const topWeak = Object.entries(weakAreas)
      .sort(function(a,b){ return b[1]-a[1]; }).slice(0,3).map(function(e){ return e[0]; });
    const scoreColor = avgScore >= 70 ? 'green' : avgScore >= 50 ? 'amber' : 'rose';

    const weakBar = topWeak.length
      ? '<div class="weak-topics-bar"><i class="ti ti-flame"></i> Weak areas: ' +
        topWeak.map(function(t){ return '<span class="topic-badge warn">'+t+'</span>'; }).join(' ') + '</div>'
      : '';

    document.getElementById('quiz-page-content').innerHTML =
      '<div class="page-header">' +
        '<h1 class="page-title"><i class="ti ti-bulb"></i> Technical Interview Practice</h1>' +
        '<p class="page-sub">AI-generated MCQs &middot; Adaptive difficulty &middot; Spaced repetition</p>' +
      '</div>' +
      UI.levelBar() +
      '<div class="quiz-stats-row">' +
        '<div class="stat-card"><div class="stat-num indigo">'+history.length+'</div><div class="stat-label">Sessions Done</div></div>' +
        '<div class="stat-card"><div class="stat-num '+scoreColor+'">'+avgScore+'%</div><div class="stat-label">Avg Score</div></div>' +
        '<div class="stat-card"><div class="stat-num">'+UI.diffBadge(diff)+'</div><div class="stat-label">Difficulty</div></div>' +
        '<div class="stat-card"><div class="stat-num indigo">'+sessionScore+'</div><div class="stat-label">Today\'s Score</div></div>' +
      '</div>' +
      weakBar +
      '<div id="quiz-arena"><div id="quiz-question-area"></div></div>';

    if (!hasKey) { UI.apiKeyBanner('quiz-question-area'); return; }

    // restore progress or show start screen
    if (restoreProgress()) {
      if (completed) { renderCompletedToday(); }
      else           { renderCurrentQuestion(); }
    } else {
      showStartScreen(diff, hasKey);
    }
  }

  function showStartScreen(diff, hasKey) {
    document.getElementById('quiz-question-area').innerHTML =
      '<div class="quiz-start-card">' +
        '<div class="quiz-start-icon"><i class="ti ti-brain"></i></div>' +
        '<h2>Ready for today\'s quiz?</h2>' +
        '<p>25 questions &middot; ' + (['','Easy','Medium','Hard'][diff]) + ' difficulty &middot; Adapts to your weak areas</p>' +
        '<button class="btn primary btn-lg" onclick="QuizPage.startSession()">' +
          '<i class="ti ti-player-play"></i> Start Quiz</button>' +
      '</div>';
  }

  // ── start / load session ──────────────────────────────────
  async function startSession() {
    // check daily cache first
    const cached = Store.getCached('quiz');
    if (cached && Array.isArray(cached) && cached.length) {
      console.log('[Quiz] loading from daily cache');
      questions = cached;
      currentIdx = 0; selectedOption = null; revealed = false;
      sessionScore = 0; sessionAnswered = 0; completed = false;
      saveProgress();
      renderCurrentQuestion();
      return;
    }
    // generate fresh
    questions = []; currentIdx = 0; selectedOption = null;
    revealed = false; sessionScore = 0; sessionAnswered = 0; completed = false;
    UI.loading('quiz-question-area', 'Generating 25 questions with Gemini AI...');
    try {
      var q = await Gemini.generateQuiz(DATA.quizTopics, Store.state.quizDifficulty, Store.state.quizWeakAreas, 25);
      if (!q || !q.length) throw new Error('No questions returned');
      questions = q;
      Store.setCached('quiz', q);
      saveProgress();
      renderCurrentQuestion();
    } catch(e) {
      if (e.message === 'NO_KEY') UI.apiKeyBanner('quiz-question-area');
      else UI.error('quiz-question-area', e.message, startSession);
    }
  }

  // ── render question ───────────────────────────────────────
  function renderCurrentQuestion() {
    var area = document.getElementById('quiz-question-area');
    if (!area || !questions.length) return;
    if (currentIdx >= questions.length) { finaliseSession(); return; }

    var q = questions[currentIdx];
    var pct = Math.round((currentIdx / questions.length) * 100);

    var optionsHTML = (q.options || []).map(function(opt, i) {
      var cls = 'option-btn';
      if (revealed) {
        if (i === q.correct)        cls += ' correct';
        else if (i === selectedOption) cls += ' wrong';
        else                           cls += ' muted';
      } else if (i === selectedOption) cls += ' selected';
      return '<button class="'+cls+'" '+(revealed?'disabled':'')+' onclick="QuizPage.selectOption('+i+')">'+opt+'</button>';
    }).join('');

    var submitBtn = !revealed
      ? '<button class="btn primary btn-submit" id="submit-btn" '+(selectedOption===null?'disabled':'')+
        ' onclick="QuizPage.submitAnswer()"><i class="ti ti-check"></i> Submit Answer</button>'
      : '';

    area.innerHTML =
      '<div class="quiz-progress-row">' +
        '<span class="quiz-progress-label">Question '+(currentIdx+1)+' of '+questions.length+'</span>' +
        '<span>'+UI.topicBadge(q.topic)+' '+UI.diffBadge(q.difficulty||Store.state.quizDifficulty)+'</span>' +
        '<span class="quiz-score-live">Score: '+sessionScore+'/'+sessionAnswered+'</span>' +
      '</div>' +
      UI.progressBar(pct,'indigo',4) +
      '<div class="question-card">' +
        '<p class="question-text">'+q.question+'</p>' +
        '<div class="options-grid" id="options-grid">'+optionsHTML+'</div>' +
        submitBtn +
        (revealed ? buildExplanation(q) : '') +
      '</div>';
  }

  function buildExplanation(q) {
    var isCorrect = selectedOption === q.correct;
    var wrongHTML = (q.wrong_explanations && q.wrong_explanations.length)
      ? '<details class="wrong-details"><summary>Why other options are wrong</summary>' +
        q.wrong_explanations.map(function(w){ return '<p>&bull; '+w+'</p>'; }).join('') + '</details>'
      : '';
    var tipHTML = q.interview_tip
      ? '<div class="interview-tip"><i class="ti ti-star"></i> <strong>Interview Tip:</strong> '+q.interview_tip+'</div>'
      : '';
    var nextLabel = currentIdx + 1 < questions.length
      ? 'Next Question <i class="ti ti-arrow-right"></i>'
      : 'See Results <i class="ti ti-trophy"></i>';
    return '<div class="explanation-card '+(isCorrect?'correct-bg':'wrong-bg')+'">' +
      '<div class="explanation-header">'+(isCorrect?'&#x2705; Correct!':'&#x274C; Incorrect')+'</div>' +
      '<div class="explanation-body">' +
        '<p><strong>Correct Answer:</strong> '+(q.options[q.correct]||'')+'</p>' +
        '<p class="explanation-text"><strong>Why correct:</strong> '+q.explanation+'</p>' +
        wrongHTML + tipHTML +
      '</div>' +
      '<button class="btn primary" style="margin-top:12px" onclick="QuizPage.nextQuestion()">'+nextLabel+'</button>' +
    '</div>';
  }

  // ── interactions ──────────────────────────────────────────
  function selectOption(idx) {
    if (revealed) return;
    selectedOption = idx;
    var grid = document.getElementById('options-grid');
    if (grid && questions.length) {
      var q = questions[currentIdx];
      grid.innerHTML = (q.options||[]).map(function(opt,i){
        return '<button class="option-btn'+(i===selectedOption?' selected':'')+'" onclick="QuizPage.selectOption('+i+')">'+opt+'</button>';
      }).join('');
    }
    var btn = document.getElementById('submit-btn');
    if (btn) btn.disabled = false;
  }

  function submitAnswer() {
    if (selectedOption === null || revealed) return;
    revealed = true;
    var q = questions[currentIdx];
    sessionAnswered++;
    if (selectedOption === q.correct) {
      sessionScore++;
    } else {
      Store.state.quizWeakAreas[q.topic] = (Store.state.quizWeakAreas[q.topic]||0) + 1;
      Store.save('quizWeakAreas');
    }
    saveProgress();
    renderCurrentQuestion();
  }

  function nextQuestion() {
    currentIdx++; selectedOption = null; revealed = false;
    saveProgress();
    renderCurrentQuestion();
  }

  // ── finalise + completed state ────────────────────────────
  function finaliseSession() {
    var pct = Math.round((sessionScore / questions.length) * 100);
    var grade = pct>=90?'A+':pct>=80?'A':pct>=70?'B':pct>=60?'C':pct>=50?'D':'F';
    Store.state.quizHistory.push({ date: Store.todayKey(), score: sessionScore, total: questions.length, difficulty: Store.state.quizDifficulty });
    Store.save('quizHistory');
    Store.updateDifficulty('quizHistory','quizDifficulty', sessionScore, questions.length);
    var xp = Math.round(DATA.xpRewards.quiz * (pct/100) * 2);
    Store.addXP(xp, 'Technical Quiz');
    Store.setScore('interview', true);
    App.updateHUD();
    completed = true;
    saveProgress();
    renderResult(pct, grade, xp);
  }

  function renderResult(pct, grade, xp) {
    var area = document.getElementById('quiz-question-area');
    if (!area) return;
    var gradeCls = grade === 'A+' ? 'Aplus' : grade;
    var msg = pct>=80 ? 'Excellent! Difficulty increases next session.'
              : pct>=60 ? 'Good job! Keep practicing.'
              : 'Keep going &mdash; focus on weak areas.';
    area.innerHTML =
      '<div class="result-card">' +
        '<div class="result-grade grade-'+gradeCls+'">'+grade+'</div>' +
        '<h2>'+sessionScore+' / '+questions.length+' Correct</h2>' +
        '<div class="result-pct">'+pct+'% Accuracy</div>' +
        '<p>'+msg+'</p>' +
        '<div class="result-xp">+'+xp+' XP earned!</div>' +
        '<div style="display:flex;gap:10px;justify-content:center;margin-top:16px;flex-wrap:wrap">' +
          '<button class="btn" onclick="App.showPage(\'dashboard\')"><i class="ti ti-home"></i> Dashboard</button>' +
        '</div>' +
      '</div>';
  }

  function renderCompletedToday() {
    var p = Store.getProgress('quiz');
    var pct = p.questions && p.questions.length ? Math.round((p.score/p.questions.length)*100) : 0;
    var area = document.getElementById('quiz-question-area');
    if (!area) return;
    area.innerHTML =
      '<div class="result-card">' +
        '<div class="result-grade grade-A">&#x2705;</div>' +
        '<h2>Completed for Today!</h2>' +
        '<div class="result-pct">Score: '+(p.score||0)+' / '+(p.questions?p.questions.length:0)+' &middot; '+pct+'%</div>' +
        '<p>Come back tomorrow for a fresh set of questions.</p>' +
        '<div style="display:flex;gap:10px;justify-content:center;margin-top:16px;flex-wrap:wrap">' +
          '<button class="btn" onclick="App.showPage(\'dashboard\')"><i class="ti ti-home"></i> Dashboard</button>' +
        '</div>' +
      '</div>';
  }

  return { render, startSession, selectOption, submitAnswer, nextQuestion };
})();
