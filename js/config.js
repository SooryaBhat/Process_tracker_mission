// ============================================================
//  CONFIG v2 — multiple key sources, never crashes
// ============================================================
const Config = (() => {
  function findKey() {
    // 1. In-app saved key (user entered manually)
    try {
      const saved = localStorage.getItem('im26_apikey');
      if (saved && saved.length > 10) return saved;
    } catch(e) {}
    // 2. Injected by Vercel build command via env-config.js
    try {
      if (typeof window !== 'undefined' && window.GEMINI_API_KEY && window.GEMINI_API_KEY.length > 10)
        return window.GEMINI_API_KEY;
    } catch(e) {}
    return '';
  }
  return {
    get geminiKey() { return findKey(); },
    geminiModel: 'gemini-2.0-flash',
    geminiEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models/',
    saveKey(key) { try { localStorage.setItem('im26_apikey', key.trim()); } catch(e) {} },
    clearKey() { try { localStorage.removeItem('im26_apikey'); } catch(e) {} }
  };
})();
