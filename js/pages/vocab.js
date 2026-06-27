// ============================================================
//  VOCABULARY PAGE v3 — daily cache, progress persistence
// ============================================================
const VocabPage = (() => {
  let words        = [];
  let quizMode     = false;
  let quizIdx      = 0;
  let quizSelected = null;
  let quizRevealed = false;
  let quizScore    = 0;

  function saveWords() {
    var history = Store.state.vocabHistory.filter(function(h){ return h.date !== Store.todayKey(); });
    history.push({ date: Store.todayKey(), words: words });
    Store.state.vocabHistory = history;
    Store.save('vocabHistory');
  }

  function render() {
    var hasKey  = Gemini.hasKey();
    var history = Store.state.vocabHistory;
    var totalLearned = history.reduce(function(s,d){ return s + (d.words||[]).filter(function(w){ return w.learned; }).length; }, 0);
    var todayEntry = history.find(function(h){ return h.date === Store.todayKey(); });
    words = todayEntry ? (todayEntry.words || []) : [];

    document.getElementById('vocab-page-content').innerHTML =
      '<div class="page-header">' +
        '<h1 class="page-title"><i class="ti ti-book"></i> Vocabulary Builder</h1>' +
        '<p class="page-sub">10 new words daily &middot; Corporate, Tech &amp; Business English</p>' +
      '</div>' +
      UI.levelBar() +
      '<div class="quiz-stats-row">' +
        '<div class="stat-card"><div class="stat-num green">'+totalLearned+'</div><div class="stat-label">Words Learned</div></div>' +
        '<div class="stat-card"><div class="stat-num indigo">'+history.length+'</div><div class="stat-label">Days Practiced</div></div>' +
        '<div class="stat-card"><div class="stat-num amber">'+Store.state.vocabStreak+'</div><div class="stat-label">Vocab Streak</div></div>' +
        '<div class="stat-card"><div class="stat-num">'+words.length+'</div><div class="stat-label">Today\'s Words</div></div>' +
      '</div>' +
      '<div id="vocab-content"></div>';

    if (!hasKey && !words.length) { UI.apiKeyBanner('vocab-content'); return; }

    if (words.length) {
      renderWords();
    } else {
      document.getElementById('vocab-content').innerHTML =
        '<div class="quiz-start-card">' +
          '<div class="quiz-start-icon">&#x1F4DA;</div>' +
          '<h2>Generate today\'s vocabulary!</h2>' +
          '<p>10 new words: Corporate, AI &amp; Tech English</p>' +
          '<button class="btn primary btn-lg" onclick="VocabPage.generateWords()">' +
            '<i class="ti ti-sparkles"></i> Generate Today\'s Words</button>' +
        '</div>';
    }
  }

  async function generateWords() {
    // check cache first
    var cached = Store.getCached('vocab');
    if (cached && Array.isArray(cached) && cached.length) {
      console.log('[Vocab] loading from daily cache');
      words = cached;
      saveWords(); renderWords(); return;
    }
    UI.loading('vocab-content', 'Generating 10 vocabulary words...');
    try {
      var w = await Gemini.generateVocab(10);
      if (!w || !w.length) throw new Error('No words returned');
      words = w.map(function(word){ return Object.assign({}, word, { learned: false }); });
      Store.setCached('vocab', words);
      saveWords();
      renderWords();
    } catch(e) {
      if (e.message === 'NO_KEY') UI.apiKeyBanner('vocab-content');
      else UI.error('vocab-content', e.message, generateWords);
    }
  }

  function renderWords() {
    var area = document.getElementById('vocab-content');
    if (!area) return;
    if (quizMode) { renderQuiz(); return; }

    var learned = words.filter(function(w){ return w.learned; }).length;
    var allDone = learned === words.length && words.length > 0;

    if (allDone) {
      area.innerHTML =
        '<div class="result-card">' +
          '<div class="result-grade grade-A">&#x2705;</div>' +
          '<h2>Completed for Today!</h2>' +
          '<div class="result-pct">All '+words.length+' words learned</div>' +
          '<p>Come back tomorrow for 10 new words.</p>' +
          '<div style="display:flex;gap:10px;justify-content:center;margin-top:16px;flex-wrap:wrap">' +
            '<button class="btn primary" onclick="VocabPage.startQuiz()"><i class="ti ti-brain"></i> Review Quiz</button>' +
            '<button class="btn" onclick="App.showPage(\'dashboard\')">Dashboard</button>' +
          '</div>' +
        '</div>';
      return;
    }

    var quizBtn = learned > 0
      ? '<button class="btn primary" onclick="VocabPage.startQuiz()"><i class="ti ti-brain"></i> Take Mini Quiz</button>'
      : '';

    area.innerHTML =
      '<div class="vocab-progress-row">' +
        '<span>Today\'s progress: '+learned+'/'+words.length+' words</span>' + quizBtn +
      '</div>' +
      UI.progressBar(words.length ? (learned/words.length)*100 : 0, 'green', 8) +
      '<div class="words-grid">' +
        words.map(function(w, i){ return buildWordCard(w, i); }).join('') +
      '</div>';
  }

  function buildWordCard(w, idx) {
    return '<div class="word-card'+(w.learned?' learned':'')+'">' +
      '<div class="word-header">' +
        '<span class="word-text">'+w.word+'</span>' +
        '<span class="word-category">'+(w.category||'Tech')+'</span>' +
        (w.learned ? '<span class="learned-badge">&#x2713; Learned</span>' : '') +
      '</div>' +
      '<div class="word-pronunciation">/'+w.pronunciation+'/</div>' +
      '<div class="word-meaning">'+w.meaning+'</div>' +
      '<div class="word-example">&ldquo;'+w.example+'&rdquo;</div>' +
      '<div class="word-usage"><strong>Professional:</strong> '+w.professional_usage+'</div>' +
      '<div class="word-memory"><i class="ti ti-bulb"></i> <strong>Memory Trick:</strong> '+w.memory_trick+'</div>' +
      '<button class="'+(w.learned?'btn':'btn primary')+'" onclick="VocabPage.markLearned('+idx+')" style="margin-top:10px">' +
        (w.learned ? '<i class="ti ti-check"></i> Learned' : '<i class="ti ti-bookmark"></i> Mark Learned') +
      '</button>' +
    '</div>';
  }

  function markLearned(idx) {
    words[idx].learned = !words[idx].learned;
    saveWords();
    if (words.every(function(w){ return w.learned; })) {
      Store.addXP(DATA.xpRewards.vocab, 'Vocabulary');
      Store.setScore('comm', true);
      App.updateHUD();
    }
    renderWords();
  }

  function startQuiz() {
    quizMode = true; quizIdx = 0; quizSelected = null; quizRevealed = false; quizScore = 0;
    renderQuiz();
  }

  function renderQuiz() {
    var area = document.getElementById('vocab-content');
    if (!area) return;
    var quizWords = words.filter(function(w){ return w.quiz_question; });
    if (quizIdx >= quizWords.length) { endQuiz(quizWords.length); return; }
    var w = quizWords[quizIdx];

    var optionsHTML = (w.quiz_options||[]).map(function(opt, i) {
      var cls = 'option-btn';
      if (quizRevealed) {
        if (i === w.quiz_correct)   cls += ' correct';
        else if (i === quizSelected) cls += ' wrong';
        else                         cls += ' muted';
      } else if (i === quizSelected) cls += ' selected';
      return '<button class="'+cls+'" '+(quizRevealed?'disabled':'')+' onclick="VocabPage.selectQuizOpt('+i+')">'+opt+'</button>';
    }).join('');

    area.innerHTML =
      '<div class="quiz-progress-row">' +
        '<span>Vocab Quiz: '+(quizIdx+1)+'/'+quizWords.length+'</span>' +
        '<button class="btn" onclick="VocabPage.exitQuiz()">Exit Quiz</button>' +
      '</div>' +
      UI.progressBar(quizWords.length ? (quizIdx/quizWords.length)*100 : 0, 'green', 4) +
      '<div class="question-card">' +
        '<div class="vocab-quiz-word"><span class="word-text">'+w.word+'</span></div>' +
        '<p class="question-text">'+w.quiz_question+'</p>' +
        '<div class="options-grid">'+optionsHTML+'</div>' +
        (!quizRevealed ? '<button class="btn primary btn-submit" '+(quizSelected===null?'disabled':'')+' onclick="VocabPage.submitQuiz()">Submit</button>' : '') +
        (quizRevealed ? '<div class="explanation-card '+(quizSelected===w.quiz_correct?'correct-bg':'wrong-bg')+'">' +
          '<p>'+(quizSelected===w.quiz_correct?'&#x2705; Correct!':'&#x274C; Incorrect')+'</p>' +
          '<p>'+w.quiz_explanation+'</p>' +
          '<button class="btn primary" onclick="VocabPage.nextQuiz()">'+(quizIdx+1<quizWords.length?'Next':'Finish')+'</button>' +
        '</div>' : '') +
      '</div>';
  }

  function selectQuizOpt(i) { quizSelected = i; renderQuiz(); }
  function submitQuiz() {
    if (quizSelected === null) return;
    quizRevealed = true;
    var qw = words.filter(function(w){ return w.quiz_question; });
    if (quizSelected === qw[quizIdx].quiz_correct) quizScore++;
    renderQuiz();
  }
  function nextQuiz() { quizIdx++; quizSelected = null; quizRevealed = false; renderQuiz(); }
  function exitQuiz() { quizMode = false; renderWords(); }

  function endQuiz(total) {
    quizMode = false;
    var pct = total > 0 ? Math.round((quizScore/total)*100) : 0;
    Store.addXP(DATA.xpRewards.vocab, 'Vocab Quiz');
    var area = document.getElementById('vocab-content');
    if (area) area.innerHTML =
      '<div class="result-card">' +
        '<div class="result-grade grade-'+(pct>=80?'A':'B')+'">'+(pct>=80?'&#x1F389;':'&#x1F4DA;')+'</div>' +
        '<h2>Quiz Complete!</h2>' +
        '<div class="result-pct">'+quizScore+'/'+total+' &middot; '+pct+'%</div>' +
        '<div class="result-xp">+'+DATA.xpRewards.vocab+' XP</div>' +
        '<div style="display:flex;gap:10px;justify-content:center;margin-top:16px;flex-wrap:wrap">' +
          '<button class="btn primary" onclick="VocabPage.render()">Back to Words</button>' +
          '<button class="btn" onclick="App.showPage(\'dashboard\')">Dashboard</button>' +
        '</div>' +
      '</div>';
  }

  return { render, generateWords, markLearned, startQuiz, selectQuizOpt, submitQuiz, nextQuiz, exitQuiz };
})();
