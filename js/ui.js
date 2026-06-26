// ============================================================
//  UI HELPERS — shared across all pages
// ============================================================
const UI = (() => {

  function showXPToast(amount, reason) {
    const toast = document.createElement('div');
    toast.className = 'xp-toast';
    toast.innerHTML = `+${amount} XP <span>${reason}</span>`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 400); }, 2500);
  }

  function loading(containerId, msg = 'Generating with AI...') {
    const el = document.getElementById(containerId);
    if (el) el.innerHTML = `<div class="ai-loading"><div class="ai-spinner"></div><p>${msg}</p></div>`;
  }

  function error(containerId, msg, retryFn = null) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const retryBtn = retryFn ? `<button class="btn primary" onclick="(${retryFn.toString()})()"><i class="ti ti-refresh"></i> Retry</button>` : '';
    el.innerHTML = `<div class="ai-error"><i class="ti ti-alert-circle"></i><p>${msg}</p>${retryBtn}</div>`;
  }

  function apiKeyBanner(containerId) {
    const el = document.getElementById(containerId);
    if (el) el.innerHTML = `<div class="api-key-banner">
      <i class="ti ti-key"></i>
      <h3>Gemini API Key Required</h3>
      <p>Add your API key to <code>env-config.js</code> to unlock AI-powered features.</p>
      <ol>
        <li>Get a free key at <a href="https://aistudio.google.com" target="_blank">aistudio.google.com</a></li>
        <li>Open <code>env-config.js</code> in the project root</li>
        <li>Set: <code>window.GEMINI_API_KEY = 'your-key-here';</code></li>
        <li>Reload the page</li>
      </ol>
      <p class="api-note">For Vercel: Add <code>VITE_GEMINI_API_KEY</code> in Environment Variables and set the build command to inject it.</p>
    </div>`;
  }

  function diffBadge(d) {
    const labels = {1:'Easy',2:'Medium',3:'Hard','Easy':'Easy','Medium':'Medium','Hard':'Hard'};
    const cls = {1:'diff-easy',2:'diff-medium',3:'diff-hard','Easy':'diff-easy','Medium':'diff-medium','Hard':'diff-hard'};
    return `<span class="diff-badge ${cls[d]||'diff-easy'}">${labels[d]||d}</span>`;
  }

  function topicBadge(t) {
    return `<span class="topic-badge">${t}</span>`;
  }

  function progressBar(pct, color='indigo', height=5) {
    return `<div class="progress-bar" style="height:${height}px"><div class="progress-fill ${color}" style="width:${Math.min(100,pct)}%"></div></div>`;
  }

  function levelBar() {
    const lvl = Store.getLevel();
    const name = DATA.levelNames[lvl.level] || 'Legend';
    return `<div class="level-display">
      <div class="level-info">
        <span class="level-num">Lv.${lvl.level}</span>
        <span class="level-name">${name}</span>
        <span class="xp-num">${lvl.xp.toLocaleString()} XP</span>
      </div>
      <div class="level-bar-wrap">
        <div class="level-bar-fill" style="width:${lvl.progress}%"></div>
      </div>
      <div class="level-bar-label">${lvl.xp - lvl.currXP} / ${lvl.nextXP - lvl.currXP} XP to next level</div>
    </div>`;
  }

  function renderOptionButton(opt, idx, selectedIdx, correctIdx, revealed) {
    let cls = 'option-btn';
    if (revealed) {
      if (idx === correctIdx) cls += ' correct';
      else if (idx === selectedIdx) cls += ' wrong';
      else cls += ' muted';
    } else if (idx === selectedIdx) cls += ' selected';
    return `<button class="${cls}" ${revealed ? 'disabled' : ''}
      onclick="QuizPage && QuizPage.selectOption && QuizPage.selectOption(${idx})">${opt}</button>`;
  }

  return { showXPToast, loading, error, apiKeyBanner, diffBadge, topicBadge, progressBar, levelBar, renderOptionButton };
})();
