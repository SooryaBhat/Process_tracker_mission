// ============================================================
//  ENGLISH PAGE v2 — no nested template literals
// ============================================================
const EnglishPage = (() => {
  let lesson = null;
  let exerciseIdx = 0;
  let selected = null;
  let revealed = false;
  let score = 0;

  function render() {
    const hasKey = Gemini.hasKey();
    const history = Store.state.englishHistory;
    const avgScore = history.length
      ? Math.round(history.slice(-10).reduce(function(s,h){return s+(h.score/h.total*100);},0) / Math.min(10,history.length))
      : 0;
    const diff = Store.state.englishDifficulty;
    const cached = Store.getCached('english');
    if (cached && !lesson) { lesson = cached; exerciseIdx = 0; selected = null; revealed = false; score = 0; }

    const scoreColor = avgScore >= 70 ? 'green' : avgScore >= 50 ? 'amber' : 'rose';

    document.getElementById('english-page-content').innerHTML =
      '<div class="page-header">' +
        '<h1 class="page-title"><i class="ti ti-language"></i> English Improvement</h1>' +
        '<p class="page-sub">Daily lessons &middot; Grammar &middot; Corporate communication &middot; Interview English</p>' +
      '</div>' +
      UI.levelBar() +
      '<div class="quiz-stats-row">' +
        '<div class="stat-card"><div class="stat-num indigo">' + history.length + '</div><div class="stat-label">Lessons Done</div></div>' +
        '<div class="stat-card"><div class="stat-num ' + scoreColor + '">' + avgScore + '%</div><div class="stat-label">Avg Score</div></div>' +
        '<div class="stat-card"><div class="stat-num">' + UI.diffBadge(diff) + '</div><div class="stat-label">Difficulty</div></div>' +
      '</div>' +
      (hasKey ? '' : '<div id="eng-key-banner"></div>') +
      '<div id="english-content">' +
        (lesson ? '' :
          '<div class="quiz-start-card">' +
            '<div class="quiz-start-icon">&#x1F5E3;&#xFE0F;</div>' +
            '<h2>Today\'s English Lesson</h2>' +
            '<p>Professional framing, Grammar, Corporate communication, Interview English</p>' +
            (hasKey ? '<button class="btn primary btn-lg" onclick="EnglishPage.generateLesson()"><i class="ti ti-sparkles"></i> Generate Today\'s Lesson</button>' : '') +
          '</div>') +
      '</div>';

    if (!hasKey) {
      var b = document.getElementById('eng-key-banner');
      if (b) UI.apiKeyBanner('eng-key-banner');
    }
    if (lesson) renderLesson();
  }

  async function generateLesson() {
    lesson = null; exerciseIdx = 0; selected = null; revealed = false; score = 0;
    UI.loading('english-content', 'Generating English lesson...');
    try {
      var l = await Gemini.generateEnglish(Store.state.englishDifficulty);
      if (!l) throw new Error('No lesson returned');
      lesson = l;
      Store.setCached('english', l);
      renderLesson();
    } catch(e) {
      if (e.message === 'NO_KEY') UI.apiKeyBanner('english-content');
      else UI.error('english-content', 'Failed: ' + e.message, generateLesson);
    }
  }

  function renderLesson() {
    var area = document.getElementById('english-content');
    if (!area || !lesson) return;
    var exercises = lesson.exercises || [];
    if (exerciseIdx >= exercises.length) { renderLessonResult(); return; }
    var ex = exercises[exerciseIdx];

    var goodExHTML = (lesson.good_examples && lesson.good_examples.length)
      ? '<div class="examples-box green-box"><strong>&#x2705; Good Examples:</strong><ul>' +
        lesson.good_examples.map(function(e){return '<li>' + e + '</li>';}).join('') + '</ul></div>'
      : '';
    var badExHTML = (lesson.bad_examples && lesson.bad_examples.length)
      ? '<div class="examples-box red-box"><strong>&#x274C; Common Mistakes:</strong><ul>' +
        lesson.bad_examples.map(function(e){return '<li>' + e + '</li>';}).join('') + '</ul></div>'
      : '';
    var phrasesHTML = (lesson.interview_phrases && lesson.interview_phrases.length)
      ? '<div class="interview-phrases"><strong>&#x1F4BC; Interview Phrases:</strong><ul>' +
        lesson.interview_phrases.map(function(p){return '<li>' + p + '</li>';}).join('') + '</ul></div>'
      : '';

    var optionsHTML = (ex.options || []).map(function(opt, i) {
      var cls = 'option-btn';
      if (revealed) {
        if (i === ex.correct) cls += ' correct';
        else if (i === selected) cls += ' wrong';
        else cls += ' muted';
      } else if (i === selected) {
        cls += ' selected';
      }
      var disabled = revealed ? 'disabled' : '';
      return '<button class="' + cls + '" ' + disabled + ' onclick="EnglishPage.select(' + i + ')">' + opt + '</button>';
    }).join('');

    var submitHTML = !revealed
      ? '<button class="btn primary btn-submit" ' + (selected === null ? 'disabled' : '') + ' onclick="EnglishPage.submit()">Check Answer</button>'
      : '';
    var expHTML = revealed
      ? '<div class="explanation-card ' + (selected === ex.correct ? 'correct-bg' : 'wrong-bg') + '">' +
          '<strong>' + (selected === ex.correct ? '&#x2705; Correct!' : '&#x274C; Incorrect') + '</strong>' +
          '<p>' + ex.explanation + '</p>' +
          '<button class="btn primary" onclick="EnglishPage.next()">' +
            (exerciseIdx + 1 < exercises.length ? 'Next Exercise' : 'See Results') +
          '</button>' +
        '</div>'
      : '';

    area.innerHTML =
      '<div class="lesson-card">' +
        '<div class="lesson-header">' +
          '<h2>' + lesson.topic + '</h2>' +
          UI.diffBadge(lesson.difficulty || Store.state.englishDifficulty) +
        '</div>' +
        '<div class="lesson-explanation">' + lesson.explanation + '</div>' +
        goodExHTML + badExHTML + phrasesHTML +
      '</div>' +
      '<div class="exercise-section">' +
        '<div class="quiz-progress-row">' +
          '<span>Exercise ' + (exerciseIdx+1) + ' of ' + exercises.length + '</span>' +
          '<span class="quiz-score-live">Score: ' + score + '/' + exerciseIdx + '</span>' +
        '</div>' +
        UI.progressBar(exercises.length ? (exerciseIdx / exercises.length) * 100 : 0, 'indigo', 4) +
        '<div class="question-card">' +
          '<div class="exercise-type-badge">' + (ex.type || '').replace(/_/g,' ').toUpperCase() + '</div>' +
          '<p class="question-text">' + ex.instruction + '</p>' +
          '<div class="english-question">' + ex.question + '</div>' +
          '<div class="options-grid">' + optionsHTML + '</div>' +
          submitHTML + expHTML +
        '</div>' +
      '</div>';
  }

  function select(i) { selected = i; renderLesson(); }

  function submit() {
    if (selected === null) return;
    revealed = true;
    var exercises = lesson.exercises || [];
    if (selected === exercises[exerciseIdx].correct) score++;
    renderLesson();
  }

  function next() { exerciseIdx++; selected = null; revealed = false; renderLesson(); }

  function renderLessonResult() {
    var area = document.getElementById('english-content');
    if (!area) return;
    var exercises = lesson.exercises || [];
    var total = exercises.length;
    var pct = total > 0 ? Math.round((score / total) * 100) : 0;
    Store.state.englishHistory.push({ date: Store.todayKey(), score: score, total: total, difficulty: Store.state.englishDifficulty, topic: lesson.topic });
    Store.save('englishHistory');
    Store.updateDifficulty('englishHistory', 'englishDifficulty', score, total);
    Store.addXP(DATA.xpRewards.english, 'English Lesson');
    Store.setScore('comm', true);
    App.updateHUD();

    var takeawayHTML = lesson.key_takeaway
      ? '<div class="interview-tip">&#x1F4A1; <strong>Key Takeaway:</strong> ' + lesson.key_takeaway + '</div>'
      : '';
    var phrasesHTML = (lesson.interview_phrases && lesson.interview_phrases.length)
      ? '<div class="interview-phrases" style="margin-top:10px"><strong>&#x1F4BC; Remember:</strong><ul>' +
        lesson.interview_phrases.map(function(p){return '<li>' + p + '</li>';}).join('') + '</ul></div>'
      : '';

    area.innerHTML =
      '<div class="lesson-card" style="margin-bottom:16px">' +
        '<h2>' + lesson.topic + '</h2>' + takeawayHTML + phrasesHTML +
      '</div>' +
      '<div class="result-card">' +
        '<div class="result-grade grade-' + (pct >= 80 ? 'A' : 'B') + '">' + (pct >= 80 ? '&#x1F389;' : '&#x1F4D6;') + '</div>' +
        '<h2>' + score + ' / ' + total + ' Correct</h2>' +
        '<div class="result-pct">' + pct + '%</div>' +
        '<div class="result-xp">+' + DATA.xpRewards.english + ' XP</div>' +
        '<div style="display:flex;gap:10px;justify-content:center;margin-top:16px;flex-wrap:wrap">' +
          '<button class="btn primary" onclick="EnglishPage.generateLesson()"><i class="ti ti-refresh"></i> New Lesson</button>' +
          '<button class="btn" onclick="App.showPage(\'dashboard\')">Dashboard</button>' +
        '</div>' +
      '</div>';
  }

  return {
    render: render,
    generateLesson: generateLesson,
    select: select,
    submit: submit,
    next: next
  };
})();
