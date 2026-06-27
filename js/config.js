// ============================================================
//  CONFIG v4
// ============================================================
const Config = (() => {
  function findKey() {
    try { const s = localStorage.getItem('im26_apikey'); if (s && s.length > 10) return s; } catch(e) {}
    try { if (window.GEMINI_API_KEY && window.GEMINI_API_KEY.length > 10) return window.GEMINI_API_KEY; } catch(e) {}
    return '';
  }
  return {
    get geminiKey() { return findKey(); },
    geminiModel:    'gemini-2.0-flash',
    geminiEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models/',
    saveKey(k) { try { localStorage.setItem('im26_apikey', k.trim()); } catch(e) {} },
    clearKey()  { try { localStorage.removeItem('im26_apikey'); } catch(e) {} }
  };
})();
