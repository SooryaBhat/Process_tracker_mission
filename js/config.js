// ============================================================
//  CONFIG — reads Gemini API key from environment
//  For plain HTML deploy: set window.GEMINI_API_KEY in .env
//  For Vercel: set VITE_GEMINI_API_KEY in project settings
// ============================================================
const Config = {
  // Vercel injects VITE_ prefixed env vars at build time via vite,
  // but since this is a plain HTML app we read from a meta tag
  // or a global set by env-config.js (generated at deploy time).
  // Fallback: empty string → UI shows "Add API key" prompt.
  get geminiKey() {
    return (
      (typeof window !== 'undefined' && window.GEMINI_API_KEY) ||
      ''
    );
  },
  geminiModel: 'gemini-2.0-flash',
  geminiEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models/',
};
