// ============================================================
//  APTITUDE PAGE
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
    const avgScore = history.length ? Math.round(history.slice(-10).reduce((s,h)=>s+(h.score/h.total*100),0)/Math.min(10,history.length)) : 0;
    const diff = Store.state.aptDifficulty;
    const weakAreas = Store.state.aptWeakAreas;
    const topWeak = Object.entries(weakAreas).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([t])=>t);

    document.getElementById('apt-page-content').innerHTML = `
      <div class="page-header">
        <h1 class="page-title"><i class="ti ti-calculator"></i> Aptitude Practice</h1>
        <p class="page-sub">15–20 questions daily · Shortcuts & explanations · Campus placement style</p>
      </div>
      ${UI.levelBar()}
      <div class="quiz-stats-row">
        <div class="stat-card"><div class="stat-num indigo">${history.length}</div><div class="stat-label">Sessions Done</div></div>
        <div class="stat-card"><div class="stat-num ${avgScore>=70?'green':avgScore>=50?'amber':'rose'}">${avgScore}%</div><div class="stat-label">Avg Score</div></div>
        <div class="stat-card"><div class="stat-num">${UI.diffBadge(diff)}</div><div class="stat-label">Difficulty</div></div>
        <div class="stat-card"><div class="stat-num amber">${score}</div><div class="stat-label">Today's Score</div></div>
      </div>
      ${topWeak.length?`<div class="weak-topics-bar"><i class="ti ti-flame"></i> Focus areas: ${topWeak.map(t=>`<span class="topic-badge warn">${t}</span>`).join(' ')}</div>`:''}
      ${!hasKey?`<div id="apt-key-banner"></div>`:''}
      <div id="apt-content">
        ${questions.length?'':
        `<div class="quiz-start-card"><div class="quiz-start-icon">🧮</div><h2>Ready for Aptitude Practice?</h2><p>17 questions covering Quant, Logical Reasoning & Coding Aptitude</p>${hasKey?`<button class="btn primary btn-lg" onclick="AptPage.startSession()"><i class="ti ti-player-play"></i> Start Session</button>`:''}</div>`}
      </div>`;

    if (!hasKey) { const b=document.getElementById('apt-key-banner'); if(b) UI.apiKeyBanner('apt-key-banner'); }
    if (questions.length) renderQuestion();
  }

  async function startSession() {
    questions=[]; currentIdx=0; selected=null; revealed=false; score=0;
    const area = document.getElementById('apt-content');
    if (area) UI.loading('apt-content','Generating aptitude questions...');
    try {
      const q = await Gemini.generateAptitude(DATA.aptitudeTopics, Store.state.aptDifficulty, Store.state.aptWeakAreas, 17);
      if (!q||!q.length) throw new Error('No questions returned');
      questions = q;
      renderQuestion();
    } catch(e) {
      if (e.message==='NO_KEY') UI.apiKeyBanner('apt-content');
      else UI.error('apt-content','Failed: '+e.message, startSession);
    }
  }

  function renderQuestion() {
    const area = document.getElementById('apt-content');
    if (!area) return;
    if (currentIdx >= questions.length) { renderResult(); return; }
    const q = questions[currentIdx];
    area.innerHTML = `
      <div class="quiz-progress-row">
        <span>Question ${currentIdx+1} of ${questions.length}</span>
        <span>${UI.topicBadge(q.topic)} ${UI.diffBadge(q.difficulty||Store.state.aptDifficulty)}</span>
        <span class="quiz-score-live">Score: ${score}/${currentIdx}</span>
      </div>
      ${UI.progressBar((currentIdx/questions.length)*100,'amber',4)}
      <div class="question-card">
        <p class="question-text">${q.question}</p>
        <div class="options-grid">
          ${(q.options||[]).map((opt,i)=>{
            let cls='option-btn';
            if(revealed){if(i===q.correct)cls+=' correct';else if(i===selected)cls+=' wrong';else cls+=' muted';}
            else if(i===selected)cls+=' selected';
            return `<button class="${cls}" ${revealed?'disabled':''} onclick="AptPage.select(${i})">${opt}</button>`;
          }).join('')}
        </div>
        ${!revealed?`<button class="btn primary btn-submit" ${selected===null?'disabled':''} onclick="AptPage.submit()">Submit</button>`:''}
        ${revealed?`<div class="explanation-card ${selected===q.correct?'correct-bg':'wrong-bg'}">
          <strong>${selected===q.correct?'✅ Correct!':'❌ Incorrect'}</strong>
          <div class="apt-solution"><strong>📝 Solution:</strong> ${q.solution}</div>
          ${q.shortcut?`<div class="apt-shortcut"><i class="ti ti-bolt"></i> <strong>Shortcut:</strong> ${q.shortcut}</div>`:''}
          <button class="btn primary" style="margin-top:10px" onclick="AptPage.next()">${currentIdx+1<questions.length?'Next Question':'See Results'}</button>
        </div>`:''}
      </div>`;
  }

  function select(i) { selected=i; renderQuestion(); }

  function submit() {
    if (selected===null) return;
    revealed = true;
    const q = questions[currentIdx];
    if (selected === q.correct) score++;
    else { Store.state.aptWeakAreas[q.topic] = (Store.state.aptWeakAreas[q.topic]||0)+1; Store.save('aptWeakAreas'); }
    renderQuestion();
  }

  function next() { currentIdx++; selected=null; revealed=false; renderQuestion(); }

  function renderResult() {
    const area = document.getElementById('apt-content');
    if (!area) return;
    const pct = Math.round((score/questions.length)*100);
    Store.state.aptHistory.push({date:Store.todayKey(), score, total:questions.length, difficulty:Store.state.aptDifficulty});
    Store.save('aptHistory');
    Store.updateDifficulty('aptHistory','aptDifficulty',score,questions.length);
    Store.addXP(Math.round(DATA.xpRewards.aptitude*(pct/100)*2),'Aptitude');
    Store.setScore('aiml',true);
    App.updateHUD();
    area.innerHTML = `<div class="result-card">
      <div class="result-grade grade-${pct>=80?'A':'B'}">${pct>=80?'🎯':'📊'}</div>
      <h2>${score} / ${questions.length}</h2>
      <div class="result-pct">${pct}%</div>
      <div class="result-xp">+${Math.round(DATA.xpRewards.aptitude*(pct/100)*2)} XP</div>
      <div style="display:flex;gap:10px;justify-content:center;margin-top:16px;flex-wrap:wrap">
        <button class="btn primary" onclick="AptPage.startSession()"><i class="ti ti-refresh"></i> New Session</button>
        <button class="btn" onclick="App.showPage('dashboard')">Dashboard</button>
      </div>
    </div>`;
  }

  return { render, startSession, select, submit, next };
})();
