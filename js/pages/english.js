// ============================================================
//  ENGLISH IMPROVEMENT PAGE
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
    const avgScore = history.length ? Math.round(history.slice(-10).reduce((s,h)=>s+(h.score/h.total*100),0)/Math.min(10,history.length)) : 0;
    const diff = Store.state.englishDifficulty;
    const cached = Store.getCached('english');
    if (cached && !lesson) { lesson = cached; exerciseIdx = 0; selected = null; revealed = false; score = 0; }

    document.getElementById('english-page-content').innerHTML = `
      <div class="page-header">
        <h1 class="page-title"><i class="ti ti-language"></i> English Improvement</h1>
        <p class="page-sub">Daily lessons · Grammar · Corporate communication · Interview English</p>
      </div>
      ${UI.levelBar()}
      <div class="quiz-stats-row">
        <div class="stat-card"><div class="stat-num indigo">${history.length}</div><div class="stat-label">Lessons Done</div></div>
        <div class="stat-card"><div class="stat-num ${avgScore>=70?'green':avgScore>=50?'amber':'rose'}">${avgScore}%</div><div class="stat-label">Avg Score</div></div>
        <div class="stat-card"><div class="stat-num">${UI.diffBadge(diff)}</div><div class="stat-label">Difficulty</div></div>
      </div>
      ${!hasKey?`<div id="eng-key-banner"></div>`:''}
      <div id="english-content">
        ${lesson ? '' : `<div class="quiz-start-card"><div class="quiz-start-icon">🗣️</div><h2>Today's English Lesson</h2><p>Daily lesson: Professional framing, Grammar, Corporate communication, Interview English</p>${hasKey?`<button class="btn primary btn-lg" onclick="EnglishPage.generateLesson()"><i class="ti ti-sparkles"></i> Generate Today's Lesson</button>`:''}</div>`}
      </div>`;

    if (!hasKey) { const b=document.getElementById('eng-key-banner'); if(b) UI.apiKeyBanner('eng-key-banner'); }
    if (lesson) renderLesson();
  }

  async function generateLesson() {
    lesson = null; exerciseIdx = 0; selected = null; revealed = false; score = 0;
    const area = document.getElementById('english-content');
    if (area) UI.loading('english-content','Generating English lesson...');
    try {
      const l = await Gemini.generateEnglish(Store.state.englishDifficulty);
      if (!l) throw new Error('No lesson returned');
      lesson = l;
      Store.setCached('english', l);
      renderLesson();
    } catch(e) {
      if (e.message==='NO_KEY') UI.apiKeyBanner('english-content');
      else UI.error('english-content','Failed: '+e.message, generateLesson);
    }
  }

  function renderLesson() {
    const area = document.getElementById('english-content');
    if (!area||!lesson) return;
    const exercises = lesson.exercises||[];
    const done = exerciseIdx >= exercises.length;

    if (done) { renderLessonResult(); return; }

    const ex = exercises[exerciseIdx];
    area.innerHTML = `
      <div class="lesson-card">
        <div class="lesson-header">
          <h2>${lesson.topic}</h2>
          <div>${UI.diffBadge(lesson.difficulty||Store.state.englishDifficulty)}</div>
        </div>
        <div class="lesson-explanation">${lesson.explanation}</div>
        ${lesson.good_examples?.length?`<div class="examples-box green-box"><strong>✅ Good Examples:</strong><ul>${lesson.good_examples.map(e=>`<li>${e}</li>`).join('')}</ul></div>`:''}
        ${lesson.bad_examples?.length?`<div class="examples-box red-box"><strong>❌ Common Mistakes:</strong><ul>${lesson.bad_examples.map(e=>`<li>${e}</li>`).join('')}</ul></div>`:''}
        ${lesson.interview_phrases?.length?`<div class="interview-phrases"><strong>💼 Interview Phrases:</strong><ul>${lesson.interview_phrases.map(p=>`<li>${p}</li>`).join('')}</ul></div>`:''}
      </div>
      <div class="exercise-section">
        <div class="quiz-progress-row">
          <span>Exercise ${exerciseIdx+1} of ${exercises.length}</span>
          <span class="quiz-score-live">Score: ${score}/${exerciseIdx}</span>
        </div>
        ${UI.progressBar((exerciseIdx/exercises.length)*100,'indigo',4)}
        <div class="question-card">
          <div class="exercise-type-badge">${ex.type?.replace(/_/g,' ').toUpperCase()}</div>
          <p class="question-text">${ex.instruction}</p>
          <div class="english-question">${ex.question}</div>
          <div class="options-grid">
            ${(ex.options||[]).map((opt,i)=>{
              let cls='option-btn';
              if(revealed){if(i===ex.correct)cls+=' correct';else if(i===selected)cls+=' wrong';else cls+=' muted';}
              else if(i===selected)cls+=' selected';
              return `<button class="${cls}" ${revealed?'disabled':''} onclick="EnglishPage.select(${i})">${opt}</button>`;
            }).join('')}
          </div>
          ${!revealed?`<button class="btn primary btn-submit" ${selected===null?'disabled':''} onclick="EnglishPage.submit()">Check Answer</button>`:''}
          ${revealed?`<div class="explanation-card ${selected===ex.correct?'correct-bg':'wrong-bg'}">
            <strong>${selected===ex.correct?'✅ Correct!':'❌ Incorrect'}</strong>
            <p>${ex.explanation}</p>
            <button class="btn primary" onclick="EnglishPage.next()">${exerciseIdx+1<exercises.length?'Next Exercise':'See Results'}</button>
          </div>`:''}
        </div>
      </div>`;
  }

  function select(i) { selected = i; renderLesson(); }

  function submit() {
    if (selected===null) return;
    revealed = true;
    if (selected === (lesson.exercises||[])[exerciseIdx].correct) score++;
    renderLesson();
  }

  function next() {
    exerciseIdx++;
    selected = null; revealed = false;
    renderLesson();
  }

  function renderLessonResult() {
    const area = document.getElementById('english-content');
    if (!area) return;
    const total = (lesson.exercises||[]).length;
    const pct = Math.round((score/total)*100);
    Store.state.englishHistory.push({ date:Store.todayKey(), score, total, difficulty:Store.state.englishDifficulty, topic:lesson.topic });
    Store.save('englishHistory');
    Store.updateDifficulty('englishHistory','englishDifficulty', score, total);
    Store.addXP(DATA.xpRewards.english, 'English Lesson');
    Store.setScore('comm', true);
    App.updateHUD();
    area.innerHTML = `
      <div class="lesson-card" style="margin-bottom:16px">
        <h2>${lesson.topic}</h2>
        ${lesson.key_takeaway?`<div class="interview-tip">💡 <strong>Key Takeaway:</strong> ${lesson.key_takeaway}</div>`:''}
        ${lesson.interview_phrases?.length?`<div class="interview-phrases"><strong>💼 Remember these phrases:</strong><ul>${lesson.interview_phrases.map(p=>`<li>${p}</li>`).join('')}</ul></div>`:''}
      </div>
      <div class="result-card">
        <div class="result-grade grade-${pct>=80?'A':'B'}">${pct>=80?'🎉':'📖'}</div>
        <h2>${score} / ${total} Correct</h2>
        <div class="result-pct">${pct}%</div>
        <div class="result-xp">+${DATA.xpRewards.english} XP</div>
        <div style="display:flex;gap:10px;justify-content:center;margin-top:16px;flex-wrap:wrap">
          <button class="btn primary" onclick="EnglishPage.generateLesson()"><i class="ti ti-refresh"></i> New Lesson</button>
          <button class="btn" onclick="App.showPage('dashboard')">Dashboard</button>
        </div>
      </div>`;
  }

  return { render, generateLesson, select, submit, next };
})();
