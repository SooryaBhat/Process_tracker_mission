// ============================================================
//  ENGLISH PAGE v3 — daily cache, progress persistence
// ============================================================
const EnglishPage = (() => {
  let lesson      = null;
  let exerciseIdx = 0;
  let selected    = null;
  let revealed    = false;
  let score       = 0;
  let completed   = false;

  function saveProgress() {
    Store.saveProgress('english', { exerciseIdx, score, revealed, selected, completed });
    // lesson stored in aiCache separately
  }

  function restoreProgress() {
    var cached = Store.getCached('english');
    if (!cached || !cached.exercises) return false;
    lesson = cached;
    var p = Store.getProgress('english');
    exerciseIdx = p.exerciseIdx || 0;
    score       = p.score       || 0;
    revealed    = p.revealed    || false;
    selected    = (p.selected !== undefined) ? p.selected : null;
    completed   = p.completed   || false;
    return true;
  }

  function render() {
    var hasKey  = Gemini.hasKey();
    var history = Store.state.englishHistory;
    var avgScore = history.length
      ? Math.round(history.slice(-10).reduce(function(s,h){ return s+(h.score/h.total*100); },0) / Math.min(10,history.length))
      : 0;
    var diff = Store.state.englishDifficulty;
    var scoreColor = avgScore >= 70 ? 'green' : avgScore >= 50 ? 'amber' : 'rose';

    document.getElementById('english-page-content').innerHTML =
      '<div class="page-header">' +
        '<h1 class="page-title"><i class="ti ti-language"></i> English Improvement</h1>' +
        '<p class="page-sub">Daily lessons &middot; Grammar &middot; Corporate communication &middot; Interview English</p>' +
      '</div>' +
      UI.levelBar() +
      '<div class="quiz-stats-row">' +
        '<div class="stat-card"><div class="stat-num indigo">'+history.length+'</div><div class="stat-label">Lessons Done</div></div>' +
        '<div class="stat-card"><div class="stat-num '+scoreColor+'">'+avgScore+'%</div><div class="stat-label">Avg Score</div></div>' +
        '<div class="stat-card"><div class="stat-num">'+UI.diffBadge(diff)+'</div><div class="stat-label">Difficulty</div></div>' +
      '</div>' +
      '<div id="english-content"></div>';

    if (!hasKey && !Store.getCached('english')) { UI.apiKeyBanner('english-content'); return; }

    if (restoreProgress()) {
      if (completed) renderCompletedToday();
      else renderLesson();
    } else {
      document.getElementById('english-content').innerHTML =
        '<div class="quiz-start-card">' +
          '<div class="quiz-start-icon">&#x1F5E3;&#xFE0F;</div>' +
          '<h2>Today\'s English Lesson</h2>' +
          '<p>Grammar, corporate communication, interview English</p>' +
          (hasKey ? '<button class="btn primary btn-lg" onclick="EnglishPage.generateLesson()">' +
            '<i class="ti ti-sparkles"></i> Generate Today\'s Lesson</button>' : '') +
        '</div>';
    }
  }

  async function generateLesson() {
    var cached = Store.getCached('english');
    if (cached && cached.exercises) {
      console.log('[English] loading from daily cache');
      lesson = cached; exerciseIdx = 0; selected = null; revealed = false; score = 0; completed = false;
      saveProgress(); renderLesson(); return;
    }
    lesson = null; exerciseIdx = 0; selected = null; revealed = false; score = 0; completed = false;
    UI.loading('english-content', 'Generating English lesson...');
    try {
      var l = await Gemini.generateEnglish(Store.state.englishDifficulty);
      if (!l || !l.exercises) throw new Error('Invalid lesson structure');
      lesson = l;
      Store.setCached('english', l);
      saveProgress();
      renderLesson();
    } catch(e) {
      if (e.message === 'NO_KEY') UI.apiKeyBanner('english-content');
      else UI.error('english-content', e.message, generateLesson);
    }
  }

  function renderLesson() {
    var area = document.getElementById('english-content');
    if (!area || !lesson) return;
    var exercises = lesson.exercises || [];
    if (exerciseIdx >= exercises.length) { finaliseLesson(); return; }
    var ex = exercises[exerciseIdx];

    var goodHTML = (lesson.good_examples&&lesson.good_examples.length)
      ? '<div class="examples-box green-box"><strong>&#x2705; Good Examples:</strong><ul>'+lesson.good_examples.map(function(e){ return '<li>'+e+'</li>'; }).join('')+'</ul></div>' : '';
    var badHTML  = (lesson.bad_examples&&lesson.bad_examples.length)
      ? '<div class="examples-box red-box"><strong>&#x274C; Common Mistakes:</strong><ul>'+lesson.bad_examples.map(function(e){ return '<li>'+e+'</li>'; }).join('')+'</ul></div>' : '';
    var phraseHTML = (lesson.interview_phrases&&lesson.interview_phrases.length)
      ? '<div class="interview-phrases"><strong>&#x1F4BC; Interview Phrases:</strong><ul>'+lesson.interview_phrases.map(function(p){ return '<li>'+p+'</li>'; }).join('')+'</ul></div>' : '';

    var optionsHTML = (ex.options||[]).map(function(opt, i) {
      var cls = 'option-btn';
      if (revealed) {
        if (i === ex.correct)   cls += ' correct';
        else if (i === selected) cls += ' wrong';
        else                     cls += ' muted';
      } else if (i === selected) cls += ' selected';
      return '<button class="'+cls+'" '+(revealed?'disabled':'')+' onclick="EnglishPage.select('+i+')">'+opt+'</button>';
    }).join('');

    area.innerHTML =
      '<div class="lesson-card">' +
        '<div class="lesson-header"><h2>'+lesson.topic+'</h2>'+UI.diffBadge(lesson.difficulty||Store.state.englishDifficulty)+'</div>' +
        '<div class="lesson-explanation">'+lesson.explanation+'</div>' +
        goodHTML + badHTML + phraseHTML +
      '</div>' +
      '<div class="exercise-section">' +
        '<div class="quiz-progress-row">' +
          '<span>Exercise '+(exerciseIdx+1)+' of '+exercises.length+'</span>' +
          '<span class="quiz-score-live">Score: '+score+'/'+exerciseIdx+'</span>' +
        '</div>' +
        UI.progressBar(exercises.length ? (exerciseIdx/exercises.length)*100 : 0, 'indigo', 4) +
        '<div class="question-card">' +
          '<div class="exercise-type-badge">'+(ex.type||'').replace(/_/g,' ').toUpperCase()+'</div>' +
          '<p class="question-text">'+ex.instruction+'</p>' +
          '<div class="english-question">'+ex.question+'</div>' +
          '<div class="options-grid">'+optionsHTML+'</div>' +
          (!revealed ? '<button class="btn primary btn-submit" '+(selected===null?'disabled':'')+' onclick="EnglishPage.submit()">Check Answer</button>' : '') +
          (revealed ? '<div class="explanation-card '+(selected===ex.correct?'correct-bg':'wrong-bg')+'">' +
            '<strong>'+(selected===ex.correct?'&#x2705; Correct!':'&#x274C; Incorrect')+'</strong>' +
            '<p>'+ex.explanation+'</p>' +
            '<button class="btn primary" onclick="EnglishPage.next()">' +
              (exerciseIdx+1<exercises.length ? 'Next Exercise' : 'See Results') +
            '</button>' +
          '</div>' : '') +
        '</div>' +
      '</div>';
  }

  function select(i) { selected = i; saveProgress(); renderLesson(); }

  function submit() {
    if (selected === null) return;
    revealed = true;
    if (selected === (lesson.exercises||[])[exerciseIdx].correct) score++;
    saveProgress(); renderLesson();
  }

  function next() { exerciseIdx++; selected = null; revealed = false; saveProgress(); renderLesson(); }

  function finaliseLesson() {
    var total = (lesson.exercises||[]).length;
    var pct   = total > 0 ? Math.round((score/total)*100) : 0;
    Store.state.englishHistory.push({ date: Store.todayKey(), score, total, difficulty: Store.state.englishDifficulty, topic: lesson.topic });
    Store.save('englishHistory');
    Store.updateDifficulty('englishHistory','englishDifficulty', score, total);
    Store.addXP(DATA.xpRewards.english, 'English Lesson');
    Store.setScore('comm', true);
    App.updateHUD();
    completed = true; saveProgress();
    renderResult(pct, total);
  }

  function renderResult(pct, total) {
    var area = document.getElementById('english-content');
    if (!area) return;
    var tkHTML = lesson.key_takeaway ? '<div class="interview-tip">&#x1F4A1; <strong>Key Takeaway:</strong> '+lesson.key_takeaway+'</div>' : '';
    area.innerHTML =
      '<div class="lesson-card" style="margin-bottom:16px"><h2>'+lesson.topic+'</h2>'+tkHTML+'</div>' +
      '<div class="result-card">' +
        '<div class="result-grade grade-'+(pct>=80?'A':'B')+'">'+(pct>=80?'&#x1F389;':'&#x1F4D6;')+'</div>' +
        '<h2>'+score+' / '+total+' Correct</h2>' +
        '<div class="result-pct">'+pct+'%</div>' +
        '<div class="result-xp">+'+DATA.xpRewards.english+' XP</div>' +
        '<div style="display:flex;gap:10px;justify-content:center;margin-top:16px;flex-wrap:wrap">' +
          '<button class="btn" onclick="App.showPage(\'dashboard\')">Dashboard</button>' +
        '</div>' +
      '</div>';
  }

  function renderCompletedToday() {
    var p = Store.getProgress('english');
    var lesson_cached = Store.getCached('english');
    var total = lesson_cached && lesson_cached.exercises ? lesson_cached.exercises.length : 0;
    var pct   = total > 0 ? Math.round(((p.score||0)/total)*100) : 0;
    var area  = document.getElementById('english-content');
    if (!area) return;
    area.innerHTML =
      '<div class="result-card">' +
        '<div class="result-grade grade-A">&#x2705;</div>' +
        '<h2>Completed for Today!</h2>' +
        '<div class="result-pct">Score: '+(p.score||0)+'/'+total+' &middot; '+pct+'%</div>' +
        '<p>Come back tomorrow for a new lesson.</p>' +
        '<div style="display:flex;gap:10px;justify-content:center;margin-top:16px;flex-wrap:wrap">' +
          '<button class="btn" onclick="App.showPage(\'dashboard\')">Dashboard</button>' +
        '</div>' +
      '</div>';
  }

  return { render, generateLesson, select, submit, next };
})();
