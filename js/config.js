// ============================================================
//  CONFIG v3 — gemini-1.5-flash (generous free tier)
// ============================================================
const Config = (() => {
  function findKey() {
    try {
      const saved = localStorage.getItem('im26_apikey');
      if (saved && saved.length > 10) return saved;
    } catch(e) {}
    try {
      if (typeof window !== 'undefined' && window.GEMINI_API_KEY && window.GEMINI_API_KEY.length > 10)
        return window.GEMINI_API_KEY;
    } catch(e) {}
    return '';
  }
  return {
    get geminiKey() { return findKey(); },
    geminiModel: 'gemini-2.5-flash',   // ← changed from gemini-2.0-flash
    geminiEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models/',
    saveKey(key) { try { localStorage.setItem('im26_apikey', key.trim()); } catch(e) {} },
    clearKey() { try { localStorage.removeItem('im26_apikey'); } catch(e) {} }
  };
})();
