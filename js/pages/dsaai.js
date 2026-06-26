// ============================================================
//  DSA AI PAGE
// ============================================================
const DSAPage = (() => {
  let problems = [];
  let activeProblemIdx = 0;
  let showHint = false;
  let showApproach = false;
  let codeReview = null;
  let reviewing = false;

  function render() {
    const hasKey = Gemini.hasKey();
    const history = Store.state.dsaAIHistory;
    const solved = history.filter(h=>h.solved).length;
    const diff = Store.state.dsaDifficulty;

    document.getElementById('dsa-page-content').innerHTML = `
      <div class="page-header">
        <h1 class="page-title"><i class="ti ti-code"></i> DSA Practice</h1>
        <p class="page-sub">AI-generated problems · Paste your code for review · Adaptive difficulty</p>
      </div>
      ${UI.levelBar()}
      <div class="quiz-stats-row">
        <div class="stat-card"><div class="stat-num amber">${Store.dsaTotal()}</div><div class="stat-label">Total Solved</div></div>
        <div class="stat-card"><div class="stat-num green">${solved}</div><div class="stat-label">AI Sessions</div></div>
        <div class="stat-card"><div class="stat-num">${UI.diffBadge(diff)}</div><div class="stat-label">Difficulty</div></div>
        <div class="stat-card"><div class="stat-num indigo">${history.length}</div><div class="stat-label">Problems Attempted</div></div>
      </div>
      <div class="dsa-controls">
        <select class="input-sm" id="dsa-count-select" style="width:auto">
          <option value="2">2 Problems</option>
          <option value="3" selected>3 Problems</option>
          <option value="5">5 Problems</option>
        </select>
        ${hasKey ? `<button class="btn primary" onclick="DSAPage.generateProblems()"><i class="ti ti-sparkles"></i> Generate Today's Problems</button>` : ''}
      </div>
      ${!hasKey ? `<div id="dsa-key-banner"></div>` : ''}
      <div id="dsa-problems-area">
        ${problems.length ? '' : `<div class="quiz-start-card"><div class="quiz-start-icon"><i class="ti ti-code"></i></div><h2>Ready to practice DSA?</h2><p>Get ${['','Easy','Medium','Hard'][diff]}-level problems on topics you need to master</p>${hasKey?`<button class="btn primary btn-lg" onclick="DSAPage.generateProblems()"><i class="ti ti-player-play"></i> Generate Problems</button>`:''}</div>`}
      </div>`;

    if (!hasKey) { const b = document.getElementById('dsa-key-banner'); if(b) UI.apiKeyBanner('dsa-key-banner'); }
    if (problems.length) renderProblems();
  }

  async function generateProblems() {
    problems = []; activeProblemIdx = 0; showHint = false; showApproach = false; codeReview = null;
    const area = document.getElementById('dsa-problems-area');
    if (area) UI.loading('dsa-problems-area', 'Generating DSA problems with AI...');
    const count = parseInt(document.getElementById('dsa-count-select')?.value||3);
    try {
      const p = await Gemini.generateDSA(DATA.dsaAITopics, Store.state.dsaDifficulty, count);
      if (!p||!p.length) throw new Error('No problems returned');
      problems = p;
      renderProblems();
    } catch(e) {
      if (e.message==='NO_KEY') UI.apiKeyBanner('dsa-problems-area');
      else UI.error('dsa-problems-area','Failed to generate problems: '+e.message, generateProblems);
    }
  }

  function renderProblems() {
    const area = document.getElementById('dsa-problems-area');
    if (!area) return;

    // Problem tabs
    const tabs = problems.map((p,i)=>`<button class="tab-btn ${i===activeProblemIdx?'active':''}" onclick="DSAPage.setActive(${i})"><i class="ti ti-hash"></i>${i+1} ${p.topic}</button>`).join('');

    const p = problems[activeProblemIdx];
    const examples = (p.examples||[]).map(ex=>`<div class="example-block"><div class="ex-row"><span class="ex-label">Input:</span><code>${ex.input}</code></div><div class="ex-row"><span class="ex-label">Output:</span><code>${ex.output}</code></div>${ex.explanation?`<div class="ex-row"><span class="ex-label">Note:</span><span style="font-size:12px;color:var(--text2)">${ex.explanation}</span></div>`:''}</div>`).join('');
    const constraints = (p.constraints||[]).map(c=>`<li>${c}</li>`).join('');

    area.innerHTML = `
      <div class="tab-bar">${tabs}</div>
      <div class="problem-card">
        <div class="problem-header">
          <span class="problem-title">${p.title}</span>
          <div>${UI.topicBadge(p.topic)} ${UI.diffBadge(p.difficulty||Store.state.dsaDifficulty)}</div>
        </div>
        <div class="problem-statement">${p.problem}</div>
        <div class="examples-section"><strong>Examples:</strong>${examples}</div>
        ${constraints ? `<div class="constraints-section"><strong>Constraints:</strong><ul>${constraints}</ul></div>` : ''}
        <div class="dsa-action-row">
          <button class="btn ${showHint?'active':''}" onclick="DSAPage.toggleHint()"><i class="ti ti-bulb"></i> ${showHint?'Hide Hint':'Show Hint'}</button>
          <button class="btn ${showApproach?'active':''}" onclick="DSAPage.toggleApproach()"><i class="ti ti-eye"></i> ${showApproach?'Hide':'Reveal'} Approach</button>
        </div>
        ${showHint ? `<div class="hint-box"><i class="ti ti-bulb"></i> <strong>Hint:</strong> ${p.hint}</div>` : ''}
        ${showApproach ? `<div class="approach-box">
          <p><strong>Optimal Approach:</strong> ${p.approach}</p>
          <div class="complexity-row">
            <span class="complexity-badge">⏱ Time: <strong>${p.time_complexity}</strong></span>
            <span class="complexity-badge">💾 Space: <strong>${p.space_complexity}</strong></span>
          </div>
          ${p.followup?`<p class="followup"><i class="ti ti-question-mark"></i> <strong>Follow-up:</strong> ${p.followup}</p>`:''}
        </div>` : ''}

        <div class="code-review-section">
          <div class="code-review-header">
            <h3><i class="ti ti-code"></i> Submit Your Solution</h3>
            <p>Solve in VS Code, then paste your code below for AI review</p>
          </div>
          <div class="lang-select-row">
            <select class="input-sm" id="lang-select" style="width:auto">
              <option value="Python">Python</option>
              <option value="Java">Java</option>
              <option value="C++">C++</option>
              <option value="JavaScript">JavaScript</option>
            </select>
          </div>
          <textarea class="code-area" id="user-code-${activeProblemIdx}" placeholder="# Paste your solution here...
def solution():
    pass"></textarea>
          <button class="btn primary" ${reviewing?'disabled':''} onclick="DSAPage.reviewCode()">
            ${reviewing?'<i class="ti ti-loader ti-spin"></i> Reviewing...':'<i class="ti ti-sparkles"></i> Review My Code'}
          </button>
        </div>
        <div id="code-review-result">${codeReview ? renderCodeReview(codeReview) : ''}</div>
      </div>`;
  }

  function setActive(idx) {
    activeProblemIdx = idx;
    showHint = false; showApproach = false; codeReview = null;
    renderProblems();
  }

  function toggleHint() { showHint = !showHint; renderProblems(); }
  function toggleApproach() { showApproach = !showApproach; renderProblems(); }

  async function reviewCode() {
    const p = problems[activeProblemIdx];
    const lang = document.getElementById('lang-select')?.value || 'Python';
    const code = document.getElementById(`user-code-${activeProblemIdx}`)?.value?.trim();
    if (!code) { alert('Please paste your code first!'); return; }
    reviewing = true;
    const resultEl = document.getElementById('code-review-result');
    if (resultEl) UI.loading('code-review-result','Reviewing your code with AI...');
    try {
      const review = await Gemini.reviewCode(p.problem, code, lang);
      if (!review) throw new Error('No review returned');
      codeReview = review;
      // Track in history
      Store.state.dsaAIHistory.push({ date: Store.todayKey(), topic: p.topic, difficulty: Store.state.dsaDifficulty, solved: review.is_correct });
      Store.save('dsaAIHistory');
      if (review.is_correct) { Store.updateDifficulty('dsaAIHistory','dsaDifficulty', 1, 1); Store.addXP(DATA.xpRewards.dsa_ai, 'DSA Solved'); Store.setScore('dsa',true); App.updateHUD(); }
      if (resultEl) resultEl.innerHTML = renderCodeReview(review);
    } catch(e) {
      if (resultEl) UI.error('code-review-result','Review failed: '+e.message);
    }
    reviewing = false;
  }

  function renderCodeReview(r) {
    const scoreColor = r.quality_score>=8?'green':r.quality_score>=6?'amber':'rose';
    return `<div class="review-card">
      <div class="review-header ${r.is_correct?'correct-bg':'wrong-bg'}">
        <span class="review-verdict">${r.is_correct?'✅ Correct Solution':'❌ Needs Fixes'}</span>
        <span class="quality-score ${scoreColor}">Quality: ${r.quality_score}/10</span>
      </div>
      <div class="review-body">
        <p>${r.correctness_note}</p>
        ${r.bugs?.length ? `<div class="review-section bugs"><strong>🐛 Bugs Found:</strong><ul>${r.bugs.map(b=>`<li>${b}</li>`).join('')}</ul></div>` : ''}
        <div class="review-section"><strong>📊 Complexity:</strong>
          <div class="complexity-row">
            <span class="complexity-badge">⏱ Time: ${r.time_complexity}</span>
            <span class="complexity-badge">💾 Space: ${r.space_complexity}</span>
          </div>
        </div>
        ${r.good_things?.length ? `<div class="review-section good"><strong>✅ Good:</strong><ul>${r.good_things.map(g=>`<li>${g}</li>`).join('')}</ul></div>` : ''}
        ${r.improvements?.length ? `<div class="review-section improve"><strong>💡 Improvements:</strong><ul>${r.improvements.map(imp=>`<li>${imp}</li>`).join('')}</ul></div>` : ''}
        ${r.optimal_approach ? `<div class="review-section"><strong>🎯 Optimal Approach:</strong><p>${r.optimal_approach}</p></div>` : ''}
        ${r.optimal_code ? `<div class="review-section"><strong>💻 Optimal Code:</strong><pre class="code-block">${r.optimal_code}</pre></div>` : ''}
        <div class="interview-tip"><i class="ti ti-star"></i> <strong>Interview Verdict:</strong> ${r.interview_verdict}</div>
      </div>
    </div>`;
  }

  return { render, generateProblems, setActive, toggleHint, toggleApproach, reviewCode };
})();
