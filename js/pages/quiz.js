// ============================================================
//  QUIZ PAGE — Technical Interview Practice
// ============================================================
const QuizPage = (() => {
  let questions = [];
  let currentIdx = 0;
  let selectedOption = null;
  let revealed = false;
  let sessionScore = 0;
  let sessionAnswered = 0;

  function render() {
    const hasKey = Gemini.hasKey();
    const cached = Store.getCached('quiz');
    const diff = Store.state.quizDifficulty;
    const weakAreas = Store.state.quizWeakAreas;

    // Stats bar
    const history = Store.state.quizHistory;
    const avgScore = history.length ? Math.round(history.slice(-10).reduce((s,h)=>s+(h.score/h.total*100),0)/Math.min(10,history.length)) : 0;
    const topWeak = Object.entries(weakAreas).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([t])=>t);

    document.getElementById('quiz-page-content').innerHTML = `
      <div class="page-header">
        <h1 class="page-title"><i class="ti ti-bulb"></i> Technical Interview Practice</h1>
        <p class="page-sub">AI-generated MCQs · Adaptive difficulty · Spaced repetition</p>
      </div>
      ${UI.levelBar()}
      <div class="quiz-stats-row">
        <div class="stat-card"><div class="stat-num indigo">${history.length}</div><div class="stat-label">Sessions Done</div></div>
        <div class="stat-card"><div class="stat-num ${avgScore>=70?'green':avgScore>=50?'amber':'rose'}">${avgScore}%</div><div class="stat-label">Avg Score</div></div>
        <div class="stat-card"><div class="stat-num">${UI.diffBadge(diff)}</div><div class="stat-label">Difficulty</div></div>
        <div class="stat-card"><div class="stat-num indigo">${sessionScore}</div><div class="stat-label">Today's Score</div></div>
      </div>
      ${topWeak.length ? `<div class="weak-topics-bar"><i class="ti ti-flame"></i> Weak areas getting extra focus: ${topWeak.map(t=>`<span class="topic-badge warn">${t}</span>`).join(' ')}</div>` : ''}
      <div id="quiz-arena">
        ${cached && questions.length ? '' : `
          <div class="quiz-start-card">
            <div class="quiz-start-icon"><i class="ti ti-brain"></i></div>
            <h2>Ready for today's quiz?</h2>
            <p>25 questions · ${['','Easy','Medium','Hard'][diff]} difficulty · Topics rotate based on your weak areas</p>
            ${hasKey ? `<button class="btn primary btn-lg" onclick="QuizPage.startSession()"><i class="ti ti-player-play"></i> Start Quiz</button>` : ''}
            ${!hasKey ? `<div id="quiz-key-msg"></div>` : ''}
          </div>`}
        <div id="quiz-question-area"></div>
      </div>`;

    if (!hasKey) {
      const msg = document.getElementById('quiz-key-msg');
      if (msg) UI.apiKeyBanner('quiz-key-msg');
    }

    if (questions.length > 0) renderCurrentQuestion();
  }

  async function startSession() {
    questions = []; currentIdx = 0; selectedOption = null; revealed = false; sessionScore = 0; sessionAnswered = 0;
    const area = document.getElementById('quiz-question-area');
    const startCard = document.querySelector('.quiz-start-card');
    if (startCard) startCard.style.display = 'none';
    if (area) UI.loading('quiz-question-area', 'Generating 25 questions with Gemini AI...');
    try {
      const q = await Gemini.generateQuiz(DATA.quizTopics, Store.state.quizDifficulty, Store.state.quizWeakAreas, 25);
      if (!q || !q.length) throw new Error('No questions returned');
      questions = q;
      Store.setCached('quiz', q);
      renderCurrentQuestion();
    } catch(e) {
      if (e.message === 'NO_KEY') UI.apiKeyBanner('quiz-question-area');
      else UI.error('quiz-question-area', 'Failed to generate quiz: ' + e.message, startSession);
    }
  }

  function renderCurrentQuestion() {
    const area = document.getElementById('quiz-question-area');
    if (!area || !questions.length) return;
    if (currentIdx >= questions.length) { renderSessionResult(); return; }
    const q = questions[currentIdx];
    area.innerHTML = `
      <div class="quiz-progress-row">
        <span class="quiz-progress-label">Question ${currentIdx+1} of ${questions.length}</span>
        <span>${UI.topicBadge(q.topic)} ${UI.diffBadge(q.difficulty||Store.state.quizDifficulty)}</span>
        <span class="quiz-score-live">Score: ${sessionScore}/${sessionAnswered}</span>
      </div>
      ${UI.progressBar(((currentIdx)/questions.length)*100,'indigo',4)}
      <div class="question-card">
        <p class="question-text">${q.question}</p>
        <div class="options-grid" id="options-grid">
          ${(q.options||[]).map((opt,i) => UI.renderOptionButton(opt, i, selectedOption, q.correct, revealed)).join('')}
        </div>
        ${!revealed ? `<button class="btn primary btn-submit" id="submit-btn" ${selectedOption===null?'disabled':''} onclick="QuizPage.submitAnswer()"><i class="ti ti-check"></i> Submit Answer</button>` : ''}
        ${revealed ? renderExplanation(q) : ''}
      </div>`;
  }

  function renderExplanation(q) {
    const isCorrect = selectedOption === q.correct;
    const wrongExp = (q.wrong_explanations||[]).filter((_,i)=>i!==q.correct);
    return `<div class="explanation-card ${isCorrect?'correct-bg':'wrong-bg'}">
      <div class="explanation-header">${isCorrect ? '✅ Correct!' : '❌ Incorrect'}</div>
      <div class="explanation-body">
        <p><strong>Correct Answer:</strong> ${q.options[q.correct]}</p>
        <p class="explanation-text"><strong>Why correct:</strong> ${q.explanation}</p>
        ${wrongExp.length ? `<details class="wrong-details"><summary>Why other options are wrong</summary>${wrongExp.map((w,i)=>`<p>• ${w}</p>`).join('')}</details>` : ''}
        ${q.interview_tip ? `<div class="interview-tip"><i class="ti ti-star"></i> <strong>Interview Tip:</strong> ${q.interview_tip}</div>` : ''}
      </div>
      <button class="btn primary" onclick="QuizPage.nextQuestion()">${currentIdx+1 < questions.length ? 'Next Question <i class="ti ti-arrow-right"></i>' : 'See Results <i class="ti ti-trophy"></i>'}</button>
    </div>`;
  }

  function selectOption(idx) {
    if (revealed) return;
    selectedOption = idx;
    // Re-render options with selection highlighted
    const grid = document.getElementById('options-grid');
    if (grid) {
      const q = questions[currentIdx];
      grid.innerHTML = (q.options||[]).map((opt,i) => UI.renderOptionButton(opt, i, selectedOption, q.correct, false)).join('');
    }
    const btn = document.getElementById('submit-btn');
    if (btn) btn.disabled = false;
  }

  function submitAnswer() {
    if (selectedOption === null || revealed) return;
    revealed = true;
    const q = questions[currentIdx];
    const isCorrect = selectedOption === q.correct;
    sessionAnswered++;
    if (isCorrect) sessionScore++;
    else {
      // Track weak area
      Store.state.quizWeakAreas[q.topic] = (Store.state.quizWeakAreas[q.topic]||0) + 1;
      Store.save('quizWeakAreas');
    }
    renderCurrentQuestion();
  }

  function nextQuestion() {
    currentIdx++;
    selectedOption = null;
    revealed = false;
    renderCurrentQuestion();
  }

  function renderSessionResult() {
    const area = document.getElementById('quiz-question-area');
    if (!area) return;
    const pct = Math.round((sessionScore/questions.length)*100);
    const grade = pct>=90?'A+':pct>=80?'A':pct>=70?'B':pct>=60?'C':pct>=50?'D':'F';
    // Save to history
    Store.state.quizHistory.push({ date: Store.todayKey(), score: sessionScore, total: questions.length, difficulty: Store.state.quizDifficulty });
    Store.save('quizHistory');
    // Update difficulty
    Store.updateDifficulty('quizHistory','quizDifficulty', sessionScore, questions.length);
    // Give XP
    const xp = Math.round(DATA.xpRewards.quiz * (pct/100) * 2);
    Store.addXP(xp, 'Technical Quiz');
    Store.setScore('interview', true);
    area.innerHTML = `
      <div class="result-card">
        <div class="result-grade grade-${grade.replace('+','plus')}">${grade}</div>
        <h2>${sessionScore} / ${questions.length} Correct</h2>
        <div class="result-pct">${pct}% Accuracy</div>
        <p>${pct>=80?'Excellent! Difficulty will increase next session.':pct>=60?'Good job! Keep practicing.':'Keep going — focus on weak areas. Difficulty may decrease to help you build foundations.'}</p>
        <div class="result-xp">+${xp} XP earned!</div>
        <div style="display:flex;gap:10px;justify-content:center;margin-top:16px;flex-wrap:wrap">
          <button class="btn primary" onclick="QuizPage.startSession()"><i class="ti ti-refresh"></i> New Quiz</button>
          <button class="btn" onclick="App.showPage('dashboard')"><i class="ti ti-home"></i> Dashboard</button>
        </div>
      </div>`;
    App.updateHUD();
  }

  return { render, startSession, selectOption, submitAnswer, nextQuestion };
})();
