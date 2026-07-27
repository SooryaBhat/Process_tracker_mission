// ============================================================
//  PYTHON LEARNING PAGE
//  - Daily lesson: concept + code example + key points
//  - 5 theory MCQs
//  - 1 coding question (solve in VS Code, paste for AI review)
//  - Progress through 30-day curriculum
//  - Daily cache, session persistence
// ============================================================
const PythonPage = (() => {
  let lesson       = null;
  let mcqIdx       = 0;
  let mcqSelected  = null;
  let mcqRevealed  = false;
  let mcqScore     = 0;
  let mcqDone      = false;
  let codeReview   = null;
  let reviewing    = false;
  let activeTab    = 'lesson'; // 'lesson' | 'mcq' | 'coding'

  // ── progress persistence ──────────────────────────────────
  function saveProgress() {
    Store.saveProgress('python', {
      mcqIdx, mcqSelected, mcqRevealed, mcqScore, mcqDone,
      codeReview, activeTab
    });
  }

  function restoreProgress() {
    var cached = Store.getCached('python');
    if (!cached || !cached.concept) return false;
    lesson = cached;
    var p = Store.getProgress('python');
    mcqIdx      = p.mcqIdx      || 0;
    mcqSelected = (p.mcqSelected !== undefined) ? p.mcqSelected : null;
    mcqRevealed = p.mcqRevealed || false;
    mcqScore    = p.mcqScore    || 0;
    mcqDone     = p.mcqDone     || false;
    codeReview  = p.codeReview  || null;
    activeTab   = p.activeTab   || 'lesson';
    return true;
  }

  // ── helpers ───────────────────────────────────────────────
  function currentDay() { return Store.state.pythonDay || 1; }

  function currentTopic() {
    var day = currentDay();
    var curriculum = DATA.pythonCurriculum;
    return curriculum[(day - 1) % curriculum.length];
  }

  function totalDone() { return Store.state.pythonHistory.length; }

  // ── render (entry point) ──────────────────────────────────
  function render() {
    var hasKey   = Gemini.hasKey();
    var day      = currentDay();
    var topic    = currentTopic();
    var history  = Store.state.pythonHistory;
    var avgMcq   = history.length
      ? Math.round(history.reduce(function(s,h){return s+(h.mcqScore||0);},0) / history.length * 20)
      : 0;

    document.getElementById('python-page-content').innerHTML =
      '<div class="page-header">' +
        '<h1 class="page-title"><i class="ti ti-brand-python"></i> Python Learning</h1>' +
        '<p class="page-sub">Daily lesson &middot; 5 MCQs &middot; 1 coding question &middot; AI code review</p>' +
      '</div>' +
      UI.levelBar() +
      '<div class="quiz-stats-row">' +
        '<div class="stat-card"><div class="stat-num indigo">Day ' + day + '</div><div class="stat-label">Current Day</div></div>' +
        '<div class="stat-card"><div class="stat-num green">' + totalDone() + '</div><div class="stat-label">Days Completed</div></div>' +
        '<div class="stat-card"><div class="stat-num amber">' + avgMcq + '%</div><div class="stat-label">MCQ Avg</div></div>' +
        '<div class="stat-card"><div class="stat-num">' + DATA.pythonCurriculum.length + '</div><div class="stat-label">Total Days</div></div>' +
      '</div>' +
      '<div class="python-topic-banner">' +
        '<i class="ti ti-brand-python"></i>' +
        '<div><strong>Today — Day ' + day + ':</strong> ' + topic + '</div>' +
      '</div>' +
      '<div id="python-content"></div>';

    if (!hasKey && !Store.getCached('python')) { UI.apiKeyBanner('python-content'); return; }

    if (restoreProgress()) {
      renderTabs();
    } else {
      showStartScreen(hasKey, day, topic);
    }
  }

  function showStartScreen(hasKey, day, topic) {
    document.getElementById('python-content').innerHTML =
      '<div class="quiz-start-card">' +
        '<div class="quiz-start-icon"><i class="ti ti-brand-python"></i></div>' +
        '<h2>Day ' + day + ': ' + topic + '</h2>' +
        '<p>Learn the concept &rarr; read code example &rarr; answer 5 MCQs &rarr; solve coding problem</p>' +
        (hasKey
          ? '<button class="btn primary btn-lg" onclick="PythonPage.generateLesson()">' +
            '<i class="ti ti-sparkles"></i> Generate Today\'s Lesson</button>'
          : '') +
      '</div>';
  }

  // ── generate lesson ───────────────────────────────────────
  async function generateLesson() {
    var day   = currentDay();
    var topic = currentTopic();
    // check cache first
    var cached = Store.getCached('python');
    if (cached && cached.concept) {
      console.log('[Python] loaded from daily cache');
      lesson = cached;
      mcqIdx=0; mcqSelected=null; mcqRevealed=false; mcqScore=0; mcqDone=false; codeReview=null; activeTab='lesson';
      saveProgress(); renderTabs(); return;
    }
    UI.loading('python-content', 'Generating Python lesson for Day ' + day + '...');
    try {
      var l = await Gemini.generatePythonLesson(topic, day);
      lesson = l;
      Store.setCached('python', l);
      mcqIdx=0; mcqSelected=null; mcqRevealed=false; mcqScore=0; mcqDone=false; codeReview=null; activeTab='lesson';
      saveProgress(); renderTabs();
    } catch(e) {
      if (e.message === 'NO_KEY') UI.apiKeyBanner('python-content');
      else UI.error('python-content', e.message, generateLesson);
    }
  }

  // ── tab bar ───────────────────────────────────────────────
  function renderTabs() {
    var area = document.getElementById('python-content');
    if (!area || !lesson) return;

    var mcqStatusLabel = mcqDone
      ? '<span class="py-tab-badge done">&#x2713; '+mcqScore+'/5</span>'
      : (mcqIdx > 0 ? '<span class="py-tab-badge progress">'+mcqIdx+'/5</span>' : '');
    var codeStatusLabel = codeReview
      ? '<span class="py-tab-badge '+(codeReview.is_correct?'done':'warn')+'">Reviewed</span>'
      : '';

    area.innerHTML =
      '<div class="tab-bar">' +
        '<button class="tab-btn '+(activeTab==='lesson'?'active':'')+'" onclick="PythonPage.switchTab(\'lesson\')">' +
          '<i class="ti ti-book"></i> Lesson</button>' +
        '<button class="tab-btn '+(activeTab==='mcq'?'active':'')+'" onclick="PythonPage.switchTab(\'mcq\')">' +
          '<i class="ti ti-bulb"></i> MCQ '+mcqStatusLabel+'</button>' +
        '<button class="tab-btn '+(activeTab==='coding'?'active':'')+'" onclick="PythonPage.switchTab(\'coding\')">' +
          '<i class="ti ti-code"></i> Coding '+codeStatusLabel+'</button>' +
      '</div>' +
      '<div id="python-tab-content"></div>';

    renderActiveTab();
  }

  function switchTab(tab) {
    activeTab = tab;
    saveProgress();
    renderTabs();
  }

  function renderActiveTab() {
    if (activeTab === 'lesson') renderLessonTab();
    else if (activeTab === 'mcq') renderMcqTab();
    else renderCodingTab();
  }

  // ── LESSON TAB ────────────────────────────────────────────
  function renderLessonTab() {
    var area = document.getElementById('python-tab-content');
    if (!area || !lesson) return;

    var keyPoints = (lesson.key_points || []).map(function(kp) {
      return '<li>' + kp + '</li>';
    }).join('');

    var mistakes = (lesson.common_mistakes || []).map(function(m) {
      return '<li>' + m + '</li>';
    }).join('');

    area.innerHTML =
      '<div class="lesson-card">' +
        '<div class="lesson-header">' +
          '<h2>' + lesson.topic + '</h2>' +
          '<span class="py-day-badge">Day ' + lesson.day + '</span>' +
        '</div>' +
        '<div class="lesson-explanation">' + lesson.concept + '</div>' +
        '<div class="py-section">' +
          '<strong><i class="ti ti-list-check"></i> Key Points</strong>' +
          '<ul class="py-key-points">' + keyPoints + '</ul>' +
        '</div>' +
        '<div class="py-section">' +
          '<strong><i class="ti ti-code"></i> Code Example</strong>' +
          '<pre class="code-block">' + escHtml(lesson.code_example || '') + '</pre>' +
        '</div>' +
        (mistakes ? '<div class="py-section red-box">' +
          '<strong><i class="ti ti-alert-circle"></i> Common Mistakes</strong>' +
          '<ul style="padding-left:16px;margin-top:6px">' + mistakes + '</ul>' +
        '</div>' : '') +
      '</div>' +
      '<div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">' +
        '<button class="btn primary" onclick="PythonPage.switchTab(\'mcq\')">' +
          '<i class="ti ti-arrow-right"></i> Start MCQ Practice</button>' +
      '</div>';
  }

  function escHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── MCQ TAB ───────────────────────────────────────────────
  function renderMcqTab() {
    var area = document.getElementById('python-tab-content');
    if (!area || !lesson) return;

    if (mcqDone) { renderMcqResult(); return; }

    var mcqs = lesson.mcq || [];
    if (mcqIdx >= mcqs.length) { finaliseMcq(); return; }
    var q = mcqs[mcqIdx];

    var optionsHTML = (q.options || []).map(function(opt, i) {
      var cls = 'option-btn';
      if (mcqRevealed) {
        if (i === q.correct)      cls += ' correct';
        else if (i === mcqSelected) cls += ' wrong';
        else                        cls += ' muted';
      } else if (i === mcqSelected) cls += ' selected';
      return '<button class="'+cls+'" '+(mcqRevealed?'disabled':'')+
        ' onclick="PythonPage.selectMcq('+i+')">'+opt+'</button>';
    }).join('');

    area.innerHTML =
      '<div class="quiz-progress-row">' +
        '<span class="quiz-progress-label">Question '+(mcqIdx+1)+' of '+mcqs.length+'</span>' +
        '<span class="quiz-score-live">Score: '+mcqScore+'/'+mcqIdx+'</span>' +
      '</div>' +
      UI.progressBar(mcqs.length ? (mcqIdx/mcqs.length)*100 : 0, 'indigo', 4) +
      '<div class="question-card">' +
        '<div class="py-topic-label"><i class="ti ti-brand-python"></i> Python MCQ</div>' +
        '<p class="question-text">'+q.question+'</p>' +
        '<div class="options-grid">'+optionsHTML+'</div>' +
        (!mcqRevealed
          ? '<button class="btn primary btn-submit" '+(mcqSelected===null?'disabled':'')+
            ' onclick="PythonPage.submitMcq()"><i class="ti ti-check"></i> Submit</button>'
          : '') +
        (mcqRevealed
          ? '<div class="explanation-card '+(mcqSelected===q.correct?'correct-bg':'wrong-bg')+'">' +
              '<strong>'+(mcqSelected===q.correct?'&#x2705; Correct!':'&#x274C; Incorrect')+'</strong>' +
              '<p>'+q.explanation+'</p>' +
              '<button class="btn primary" onclick="PythonPage.nextMcq()">' +
                (mcqIdx+1<mcqs.length ? 'Next Question' : 'See Results') +
              '</button>' +
            '</div>'
          : '') +
      '</div>';
  }

  function selectMcq(i) {
    if (mcqRevealed) return;
    mcqSelected = i;
    saveProgress(); renderMcqTab();
  }

  function submitMcq() {
    if (mcqSelected === null || mcqRevealed) return;
    mcqRevealed = true;
    if (mcqSelected === (lesson.mcq || [])[mcqIdx].correct) mcqScore++;
    saveProgress(); renderMcqTab();
  }

  function nextMcq() {
    mcqIdx++; mcqSelected = null; mcqRevealed = false;
    saveProgress(); renderMcqTab();
  }

  function finaliseMcq() {
    mcqDone = true;
    var xp = Math.round(DATA.xpRewards.python_mcq * (mcqScore / (lesson.mcq||[]).length));
    Store.addXP(xp, 'Python MCQ');
    Store.setScore('aiml', true);
    App.updateHUD();
    saveProgress();
    renderMcqResult();
  }

  function renderMcqResult() {
    var area = document.getElementById('python-tab-content');
    if (!area) return;
    var total = (lesson.mcq||[]).length;
    var pct   = total > 0 ? Math.round((mcqScore/total)*100) : 0;
    area.innerHTML =
      '<div class="result-card">' +
        '<div class="result-grade grade-'+(pct>=80?'A':'B')+'">'+(pct>=80?'&#x1F3C6;':'&#x1F4DA;')+'</div>' +
        '<h2>MCQ Complete!</h2>' +
        '<div class="result-pct">'+mcqScore+' / '+total+' &middot; '+pct+'%</div>' +
        '<div class="result-xp">+'+Math.round(DATA.xpRewards.python_mcq*(mcqScore/total))+' XP</div>' +
        '<div style="display:flex;gap:10px;justify-content:center;margin-top:16px;flex-wrap:wrap">' +
          '<button class="btn primary" onclick="PythonPage.switchTab(\'coding\')">' +
            '<i class="ti ti-code"></i> Try Coding Problem</button>' +
          '<button class="btn" onclick="App.showPage(\'dashboard\')">Dashboard</button>' +
        '</div>' +
      '</div>';
  }

  // ── CODING TAB ────────────────────────────────────────────
  function renderCodingTab() {
    var area = document.getElementById('python-tab-content');
    if (!area || !lesson) return;
    var cq = lesson.coding_question || {};

    var examplesHTML = (cq.examples || []).map(function(ex) {
      return '<div class="example-block">' +
        '<div class="ex-row"><span class="ex-label">Input:</span><code>'+ex.input+'</code></div>' +
        '<div class="ex-row"><span class="ex-label">Output:</span><code>'+ex.output+'</code></div>' +
      '</div>';
    }).join('');

    var reviewHTML = codeReview ? buildReview(codeReview) : '';

    area.innerHTML =
      '<div class="problem-card">' +
        '<div class="problem-header">' +
          '<span class="problem-title">'+(cq.title||'Coding Challenge')+'</span>' +
          UI.topicBadge('Python') +
        '</div>' +
        '<div class="problem-statement">'+(cq.description||'')+'</div>' +
        (examplesHTML ? '<div class="examples-section"><strong>Examples:</strong>'+examplesHTML+'</div>' : '') +
        (cq.hint ? '<div class="hint-box"><i class="ti ti-bulb"></i> <strong>Hint:</strong> '+cq.hint+'</div>' : '') +
        '<div class="code-review-section">' +
          '<div class="code-review-header">' +
            '<h3><i class="ti ti-code"></i> Your Solution</h3>' +
            '<p>Write your solution in VS Code, paste below for AI review</p>' +
          '</div>' +
          '<textarea class="code-area" id="python-code" placeholder="# Write your Python solution here\ndef solution():\n    pass"></textarea>' +
          '<button class="btn primary" '+(reviewing?'disabled':'')+' onclick="PythonPage.reviewCode()">' +
            (reviewing ? '<i class="ti ti-loader ti-spin"></i> Reviewing...' : '<i class="ti ti-sparkles"></i> Review My Code') +
          '</button>' +
        '</div>' +
        '<div id="python-review-result">'+reviewHTML+'</div>' +
      '</div>' +
      (codeReview
        ? '<div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">' +
            '<button class="btn primary" onclick="PythonPage.finishDay()">' +
              '<i class="ti ti-circle-check"></i> Mark Day ' + currentDay() + ' Complete</button>' +
            '<button class="btn" onclick="App.showPage(\'dashboard\')">Dashboard</button>' +
          '</div>'
        : '');
  }

  function buildReview(r) {
    var sc = r.quality_score >= 8 ? 'green' : r.quality_score >= 5 ? 'amber' : 'rose';
    return '<div class="review-card">' +
      '<div class="review-header '+(r.is_correct?'correct-bg':'wrong-bg')+'">' +
        '<span class="review-verdict">'+(r.is_correct?'&#x2705; Correct':'&#x274C; Needs Fix')+'</span>' +
        '<span class="quality-score '+sc+'">Quality: '+r.quality_score+'/10</span>' +
      '</div>' +
      '<div class="review-body">' +
        '<p>'+r.correctness_note+'</p>' +
        ((r.bugs&&r.bugs.length&&r.bugs[0]) ? '<div class="review-section bugs"><strong>&#x1F41B; Bugs:</strong><ul>'+r.bugs.map(function(b){return '<li>'+b+'</li>';}).join('')+'</ul></div>' : '') +
        '<div class="complexity-row">' +
          '<span class="complexity-badge">&#x23F1; Time: '+(r.time_complexity||'')+'</span>' +
          '<span class="complexity-badge">&#x1F4BE; Space: '+(r.space_complexity||'')+'</span>' +
        '</div>' +
        ((r.good_things&&r.good_things.length) ? '<div class="review-section good"><strong>&#x2705; Good:</strong><ul>'+r.good_things.map(function(g){return '<li>'+g+'</li>';}).join('')+'</ul></div>' : '') +
        ((r.improvements&&r.improvements.length) ? '<div class="review-section improve"><strong>&#x1F4A1; Improve:</strong><ul>'+r.improvements.map(function(i){return '<li>'+i+'</li>';}).join('')+'</ul></div>' : '') +
        (r.optimal_code ? '<div class="review-section"><strong>&#x1F4BB; Optimal:</strong><pre class="code-block">'+escHtml(r.optimal_code)+'</pre></div>' : '') +
        '<div class="interview-tip"><i class="ti ti-star"></i> '+r.interview_verdict+'</div>' +
      '</div>' +
    '</div>';
  }

  function escHtml(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  async function reviewCode() {
    var cq   = lesson.coding_question || {};
    var code = (document.getElementById('python-code') || {}).value || '';
    if (!code.trim()) { alert('Please paste your solution first!'); return; }
    reviewing = true; renderCodingTab();
    UI.loading('python-review-result', 'Reviewing your Python code...');
    try {
      var review = await Gemini.reviewCode(cq.description || cq.title || '', code, 'Python');
      codeReview = review;
      if (review.is_correct) {
        Store.addXP(DATA.xpRewards.python_coding, 'Python Coding');
        App.updateHUD();
      }
    } catch(e) {
      UI.error('python-review-result', e.message);
    }
    reviewing = false;
    saveProgress();
    renderCodingTab();
  }

  function finishDay() {
    var day   = currentDay();
    var topic = currentTopic();
    Store.state.pythonHistory.push({
      date: Store.todayKey(), day: day, topic: topic,
      mcqScore: mcqScore, codingSolved: !!(codeReview && codeReview.is_correct)
    });
    Store.state.pythonDay = day + 1;
    Store.save('pythonHistory');
    Store.save('pythonDay');
    Store.setScore('dsa', true);
    App.updateHUD();

    var area = document.getElementById('python-content');
    if (area) {
      area.innerHTML =
        '<div class="result-card">' +
          '<div class="result-grade grade-A">&#x1F40D;</div>' +
          '<h2>Day ' + day + ' Complete!</h2>' +
          '<div class="result-pct">'+topic+'</div>' +
          '<p>Tomorrow: Day '+(day+1)+' — '+DATA.pythonCurriculum[day % DATA.pythonCurriculum.length]+'</p>' +
          '<div class="result-xp">+'+DATA.xpRewards.python_coding+' XP</div>' +
          '<div style="display:flex;gap:10px;justify-content:center;margin-top:16px;flex-wrap:wrap">' +
            '<button class="btn primary" onclick="App.showPage(\'dashboard\')">Dashboard</button>' +
          '</div>' +
        '</div>';
    }
  }

  return { render, generateLesson, switchTab, selectMcq, submitMcq, nextMcq, reviewCode, finishDay };
})();
