// ============================================================
//  VOCABULARY PAGE
// ============================================================
const VocabPage = (() => {
  let words = [];
  let quizMode = false;
  let quizIdx = 0;
  let quizSelected = null;
  let quizRevealed = false;
  let quizScore = 0;

  function render() {
    const hasKey = Gemini.hasKey();
    const history = Store.state.vocabHistory;
    const totalLearned = history.reduce((s,d)=>(d.words||[]).filter(w=>w.learned).length+s,0);
    const todayEntry = history.find(h=>h.date===Store.todayKey());
    words = todayEntry?.words || [];

    document.getElementById('vocab-page-content').innerHTML = `
      <div class="page-header">
        <h1 class="page-title"><i class="ti ti-book"></i> Vocabulary Builder</h1>
        <p class="page-sub">10 new words daily · Corporate, Tech & Business English</p>
      </div>
      ${UI.levelBar()}
      <div class="quiz-stats-row">
        <div class="stat-card"><div class="stat-num green">${totalLearned}</div><div class="stat-label">Words Learned</div></div>
        <div class="stat-card"><div class="stat-num indigo">${history.length}</div><div class="stat-label">Days Practiced</div></div>
        <div class="stat-card"><div class="stat-num amber">${Store.state.vocabStreak}</div><div class="stat-label">Vocab Streak</div></div>
        <div class="stat-card"><div class="stat-num">${words.length}</div><div class="stat-label">Today's Words</div></div>
      </div>
      ${!hasKey ? `<div id="vocab-key-banner"></div>` : ''}
      <div id="vocab-content">
        ${words.length ? '' : `<div class="quiz-start-card"><div class="quiz-start-icon">📚</div><h2>Today's vocabulary is ready to generate!</h2><p>10 new words focused on Corporate, AI & Tech English</p>${hasKey?`<button class="btn primary btn-lg" onclick="VocabPage.generateWords()"><i class="ti ti-sparkles"></i> Generate Today's Words</button>`:''}</div>`}
      </div>`;

    if (!hasKey) { const b=document.getElementById('vocab-key-banner'); if(b) UI.apiKeyBanner('vocab-key-banner'); }
    if (words.length) renderWords();
  }

  async function generateWords() {
    const area = document.getElementById('vocab-content');
    if (area) UI.loading('vocab-content','Generating 10 vocabulary words...');
    try {
      const w = await Gemini.generateVocab(10);
      if (!w||!w.length) throw new Error('No words returned');
      words = w.map(word=>({...word, learned:false}));
      // Save today's entry
      const history = Store.state.vocabHistory.filter(h=>h.date!==Store.todayKey());
      history.push({ date:Store.todayKey(), words });
      Store.state.vocabHistory = history;
      Store.save('vocabHistory');
      renderWords();
    } catch(e) {
      if (e.message==='NO_KEY') UI.apiKeyBanner('vocab-content');
      else UI.error('vocab-content','Failed: '+e.message, generateWords);
    }
  }

  function renderWords() {
    const area = document.getElementById('vocab-content');
    if (!area) return;
    if (quizMode) { renderQuiz(); return; }
    const learned = words.filter(w=>w.learned).length;
    area.innerHTML = `
      <div class="vocab-progress-row">
        <span>Today's progress: ${learned}/${words.length} words</span>
        ${learned>0?`<button class="btn primary" onclick="VocabPage.startQuiz()"><i class="ti ti-brain"></i> Take Mini Quiz</button>`:''}
      </div>
      ${UI.progressBar((learned/words.length)*100,'green',8)}
      <div class="words-grid">
        ${words.map((w,i)=>renderWordCard(w,i)).join('')}
      </div>`;
  }

  function renderWordCard(w, idx) {
    return `<div class="word-card ${w.learned?'learned':''}">
      <div class="word-header">
        <span class="word-text">${w.word}</span>
        <span class="word-category">${w.category||'Tech'}</span>
        ${w.learned?'<span class="learned-badge">✓ Learned</span>':''}
      </div>
      <div class="word-pronunciation">/${w.pronunciation}/</div>
      <div class="word-meaning">${w.meaning}</div>
      <div class="word-example">"${w.example}"</div>
      <div class="word-usage"><strong>Professional:</strong> ${w.professional_usage}</div>
      <div class="word-memory"><i class="ti ti-bulb"></i> <strong>Memory Trick:</strong> ${w.memory_trick}</div>
      <button class="btn ${w.learned?'':'primary'}" onclick="VocabPage.markLearned(${idx})" style="margin-top:10px">
        ${w.learned?'<i class="ti ti-check"></i> Learned':'<i class="ti ti-bookmark"></i> Mark Learned'}
      </button>
    </div>`;
  }

  function markLearned(idx) {
    words[idx].learned = !words[idx].learned;
    // Update stored entry
    const history = Store.state.vocabHistory;
    const todayIdx = history.findIndex(h=>h.date===Store.todayKey());
    if (todayIdx>=0) { history[todayIdx].words = words; Store.save('vocabHistory'); }
    const allLearned = words.every(w=>w.learned);
    if (allLearned) { Store.addXP(DATA.xpRewards.vocab,'Vocabulary'); Store.setScore('comm',true); App.updateHUD(); }
    renderWords();
  }

  function startQuiz() {
    quizMode = true; quizIdx = 0; quizSelected = null; quizRevealed = false; quizScore = 0;
    renderQuiz();
  }

  function renderQuiz() {
    const area = document.getElementById('vocab-content');
    if (!area) return;
    const quizWords = words.filter(w=>w.quiz_question);
    if (quizIdx >= quizWords.length) { endQuiz(quizWords.length); return; }
    const w = quizWords[quizIdx];
    area.innerHTML = `
      <div class="quiz-progress-row">
        <span>Vocab Quiz: ${quizIdx+1}/${quizWords.length}</span>
        <button class="btn" onclick="VocabPage.exitQuiz()">Exit Quiz</button>
      </div>
      ${UI.progressBar((quizIdx/quizWords.length)*100,'green',4)}
      <div class="question-card">
        <div class="vocab-quiz-word"><span class="word-text">${w.word}</span></div>
        <p class="question-text">${w.quiz_question}</p>
        <div class="options-grid">
          ${(w.quiz_options||[]).map((opt,i)=>{
            let cls='option-btn';
            if(quizRevealed){if(i===w.quiz_correct)cls+=' correct';else if(i===quizSelected)cls+=' wrong';else cls+=' muted';}
            else if(i===quizSelected)cls+=' selected';
            return `<button class="${cls}" ${quizRevealed?'disabled':''} onclick="VocabPage.selectQuizOpt(${i})">${opt}</button>`;
          }).join('')}
        </div>
        ${!quizRevealed?`<button class="btn primary btn-submit" ${quizSelected===null?'disabled':''} onclick="VocabPage.submitQuiz()">Submit</button>`:''}
        ${quizRevealed?`<div class="explanation-card ${quizSelected===w.quiz_correct?'correct-bg':'wrong-bg'}">
          <p>${quizSelected===w.quiz_correct?'✅ Correct!':'❌ Incorrect'}</p>
          <p>${w.quiz_explanation}</p>
          <button class="btn primary" onclick="VocabPage.nextQuiz()">${quizIdx+1<quizWords.length?'Next':'Finish'}</button>
        </div>`:''}
      </div>`;
  }

  function selectQuizOpt(i) { quizSelected = i; renderQuiz(); }
  function submitQuiz() { if(quizSelected===null)return; quizRevealed=true; if(quizSelected===words.filter(w=>w.quiz_question)[quizIdx].quiz_correct)quizScore++; renderQuiz(); }
  function nextQuiz() { quizIdx++; quizSelected=null; quizRevealed=false; renderQuiz(); }
  function exitQuiz() { quizMode=false; renderWords(); }

  function endQuiz(total) {
    quizMode = false;
    const pct = Math.round((quizScore/total)*100);
    Store.addXP(DATA.xpRewards.vocab, 'Vocab Quiz');
    const area = document.getElementById('vocab-content');
    if (area) area.innerHTML = `<div class="result-card">
      <div class="result-grade grade-${pct>=80?'A':'B'}">${pct>=80?'🎉':'📚'}</div>
      <h2>Quiz Complete!</h2>
      <div class="result-pct">${quizScore}/${total} · ${pct}%</div>
      <div class="result-xp">+${DATA.xpRewards.vocab} XP</div>
      <button class="btn primary" onclick="VocabPage.render()">Back to Words</button>
    </div>`;
  }

  return { render, generateWords, markLearned, startQuiz, selectQuizOpt, submitQuiz, nextQuiz, exitQuiz };
})();
