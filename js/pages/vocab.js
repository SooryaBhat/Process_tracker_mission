// ============================================================
//  VOCABULARY PAGE v2 — no nested template literals
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
    const totalLearned = history.reduce(function(s,d){ return s + (d.words||[]).filter(function(w){return w.learned;}).length; }, 0);
    const todayEntry = history.find(function(h){return h.date === Store.todayKey();});
    words = todayEntry ? (todayEntry.words || []) : [];

    document.getElementById('vocab-page-content').innerHTML =
      '<div class="page-header">' +
        '<h1 class="page-title"><i class="ti ti-book"></i> Vocabulary Builder</h1>' +
        '<p class="page-sub">10 new words daily &middot; Corporate, Tech &amp; Business English</p>' +
      '</div>' +
      UI.levelBar() +
      '<div class="quiz-stats-row">' +
        '<div class="stat-card"><div class="stat-num green">' + totalLearned + '</div><div class="stat-label">Words Learned</div></div>' +
        '<div class="stat-card"><div class="stat-num indigo">' + history.length + '</div><div class="stat-label">Days Practiced</div></div>' +
        '<div class="stat-card"><div class="stat-num amber">' + Store.state.vocabStreak + '</div><div class="stat-label">Vocab Streak</div></div>' +
        '<div class="stat-card"><div class="stat-num">' + words.length + '</div><div class="stat-label">Today\'s Words</div></div>' +
      '</div>' +
      (hasKey ? '' : '<div id="vocab-key-banner"></div>') +
      '<div id="vocab-content">' +
        (words.length ? '' :
          '<div class="quiz-start-card">' +
            '<div class="quiz-start-icon">&#x1F4DA;</div>' +
            '<h2>Generate today\'s vocabulary!</h2>' +
            '<p>10 new words focused on Corporate, AI &amp; Tech English</p>' +
            (hasKey ? '<button class="btn primary btn-lg" onclick="VocabPage.generateWords()"><i class="ti ti-sparkles"></i> Generate Today\'s Words</button>' : '') +
          '</div>') +
      '</div>';

    if (!hasKey) {
      var b = document.getElementById('vocab-key-banner');
      if (b) UI.apiKeyBanner('vocab-key-banner');
    }
    if (words.length) renderWords();
  }

  async function generateWords() {
    UI.loading('vocab-content', 'Generating 10 vocabulary words...');
    try {
      var w = await Gemini.generateVocab(10);
      if (!w || !w.length) throw new Error('No words returned');
      words = w.map(function(word){ return Object.assign({}, word, {learned: false}); });
      var history = Store.state.vocabHistory.filter(function(h){return h.date !== Store.todayKey();});
      history.push({ date: Store.todayKey(), words: words });
      Store.state.vocabHistory = history;
      Store.save('vocabHistory');
      renderWords();
    } catch(e) {
      if (e.message === 'NO_KEY') UI.apiKeyBanner('vocab-content');
      else UI.error('vocab-content', 'Failed: ' + e.message, generateWords);
    }
  }

  function renderWords() {
    var area = document.getElementById('vocab-content');
    if (!area) return;
    if (quizMode) { renderQuiz(); return; }
    var learned = words.filter(function(w){return w.learned;}).length;
    var quizBtn = learned > 0
      ? '<button class="btn primary" onclick="VocabPage.startQuiz()"><i class="ti ti-brain"></i> Take Mini Quiz</button>'
      : '';
    area.innerHTML =
      '<div class="vocab-progress-row">' +
        '<span>Today\'s progress: ' + learned + '/' + words.length + ' words</span>' +
        quizBtn +
      '</div>' +
      UI.progressBar((words.length ? learned / words.length : 0) * 100, 'green', 8) +
      '<div class="words-grid">' +
        words.map(function(w, i){ return buildWordCard(w, i); }).join('') +
      '</div>';
  }

  function buildWordCard(w, idx) {
    var learnedClass = w.learned ? ' learned' : '';
    var learnedBadge = w.learned ? '<span class="learned-badge">&#x2713; Learned</span>' : '';
    var btnClass = w.learned ? 'btn' : 'btn primary';
    var btnText = w.learned ? '<i class="ti ti-check"></i> Learned' : '<i class="ti ti-bookmark"></i> Mark Learned';
    return '<div class="word-card' + learnedClass + '">' +
      '<div class="word-header">' +
        '<span class="word-text">' + w.word + '</span>' +
        '<span class="word-category">' + (w.category || 'Tech') + '</span>' +
        learnedBadge +
      '</div>' +
      '<div class="word-pronunciation">/' + w.pronunciation + '/</div>' +
      '<div class="word-meaning">' + w.meaning + '</div>' +
      '<div class="word-example">&ldquo;' + w.example + '&rdquo;</div>' +
      '<div class="word-usage"><strong>Professional:</strong> ' + w.professional_usage + '</div>' +
      '<div class="word-memory"><i class="ti ti-bulb"></i> <strong>Memory Trick:</strong> ' + w.memory_trick + '</div>' +
      '<button class="' + btnClass + '" onclick="VocabPage.markLearned(' + idx + ')" style="margin-top:10px">' + btnText + '</button>' +
    '</div>';
  }

  function markLearned(idx) {
    words[idx].learned = !words[idx].learned;
    var history = Store.state.vocabHistory;
    var todayIdx = history.findIndex(function(h){return h.date === Store.todayKey();});
    if (todayIdx >= 0) { history[todayIdx].words = words; Store.save('vocabHistory'); }
    if (words.every(function(w){return w.learned;})) {
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
    var quizWords = words.filter(function(w){return w.quiz_question;});
    if (quizIdx >= quizWords.length) { endQuiz(quizWords.length); return; }
    var w = quizWords[quizIdx];
    var optionsHTML = (w.quiz_options || []).map(function(opt, i) {
      var cls = 'option-btn';
      if (quizRevealed) {
        if (i === w.quiz_correct) cls += ' correct';
        else if (i === quizSelected) cls += ' wrong';
        else cls += ' muted';
      } else if (i === quizSelected) {
        cls += ' selected';
      }
      var disabled = quizRevealed ? 'disabled' : '';
      return '<button class="' + cls + '" ' + disabled + ' onclick="VocabPage.selectQuizOpt(' + i + ')">' + opt + '</button>';
    }).join('');

    var submitHTML = !quizRevealed
      ? '<button class="btn primary btn-submit" ' + (quizSelected === null ? 'disabled' : '') + ' onclick="VocabPage.submitQuiz()">Submit</button>'
      : '';
    var explanationHTML = quizRevealed
      ? '<div class="explanation-card ' + (quizSelected === w.quiz_correct ? 'correct-bg' : 'wrong-bg') + '">' +
          '<p>' + (quizSelected === w.quiz_correct ? '&#x2705; Correct!' : '&#x274C; Incorrect') + '</p>' +
          '<p>' + w.quiz_explanation + '</p>' +
          '<button class="btn primary" onclick="VocabPage.nextQuiz()">' + (quizIdx + 1 < quizWords.length ? 'Next' : 'Finish') + '</button>' +
        '</div>'
      : '';

    area.innerHTML =
      '<div class="quiz-progress-row">' +
        '<span>Vocab Quiz: ' + (quizIdx+1) + '/' + quizWords.length + '</span>' +
        '<button class="btn" onclick="VocabPage.exitQuiz()">Exit Quiz</button>' +
      '</div>' +
      UI.progressBar(quizWords.length ? (quizIdx / quizWords.length) * 100 : 0, 'green', 4) +
      '<div class="question-card">' +
        '<div class="vocab-quiz-word"><span class="word-text">' + w.word + '</span></div>' +
        '<p class="question-text">' + w.quiz_question + '</p>' +
        '<div class="options-grid">' + optionsHTML + '</div>' +
        submitHTML + explanationHTML +
      '</div>';
  }

  function selectQuizOpt(i) { quizSelected = i; renderQuiz(); }
  function submitQuiz() {
    if (quizSelected === null) return;
    quizRevealed = true;
    var quizWords = words.filter(function(w){return w.quiz_question;});
    if (quizSelected === quizWords[quizIdx].quiz_correct) quizScore++;
    renderQuiz();
  }
  function nextQuiz() { quizIdx++; quizSelected = null; quizRevealed = false; renderQuiz(); }
  function exitQuiz() { quizMode = false; renderWords(); }

  function endQuiz(total) {
    quizMode = false;
    var pct = total > 0 ? Math.round((quizScore / total) * 100) : 0;
    Store.addXP(DATA.xpRewards.vocab, 'Vocab Quiz');
    var area = document.getElementById('vocab-content');
    if (area) {
      area.innerHTML =
        '<div class="result-card">' +
          '<div class="result-grade grade-' + (pct >= 80 ? 'A' : 'B') + '">' + (pct >= 80 ? '&#x1F389;' : '&#x1F4DA;') + '</div>' +
          '<h2>Quiz Complete!</h2>' +
          '<div class="result-pct">' + quizScore + '/' + total + ' &middot; ' + pct + '%</div>' +
          '<div class="result-xp">+' + DATA.xpRewards.vocab + ' XP</div>' +
          '<button class="btn primary" onclick="VocabPage.render()">Back to Words</button>' +
        '</div>';
    }
  }

  return {
    render: render,
    generateWords: generateWords,
    markLearned: markLearned,
    startQuiz: startQuiz,
    selectQuizOpt: selectQuizOpt,
    submitQuiz: submitQuiz,
    nextQuiz: nextQuiz,
    exitQuiz: exitQuiz
  };
})();
