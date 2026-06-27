// ============================================================
//  GEMINI API ENGINE v3
//  - gemini-2.0-flash compatible
//  - robust JSON extraction
//  - clean prompts (no embedded example JSON)
//  - detailed console logging
// ============================================================
const Gemini = (() => {
  const DIFF = ['', 'Easy', 'Medium', 'Hard'];

  function getKey() { try { return Config.geminiKey || ''; } catch(e) { return ''; } }
  function hasKey() { return !!getKey(); }

  // ── core call ──────────────────────────────────────────────
  async function call(prompt) {
    const key = getKey();
    if (!key) throw new Error('NO_KEY');

    const url = Config.geminiEndpoint + Config.geminiModel + ':generateContent?key=' + key;
    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 8192
        // NOTE: responseMimeType omitted — gemini-2.0-flash handles plain JSON
        // instructions better without it forcing mime constraints
      }
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = (err.error && err.error.message) ? err.error.message : 'HTTP ' + res.status;
      console.error('[Gemini] API error:', msg);
      throw new Error(msg);
    }

    const data = await res.json();
    const text = data &&
      data.candidates && data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text;

    console.log('[Gemini] raw response (' + Config.geminiModel + '):', text ? text.slice(0, 300) + '...' : '(empty)');
    return text || '';
  }

  // ── JSON extraction ────────────────────────────────────────
  function parseJSON(raw) {
    if (!raw) { console.warn('[Gemini] empty response'); return null; }

    // 1. direct parse
    try { return JSON.parse(raw); } catch(e) {}

    // 2. strip markdown fences
    let cleaned = raw
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/gi, '')
      .trim();
    try { return JSON.parse(cleaned); } catch(e) {}

    // 3. extract first [...] array
    const ai = cleaned.indexOf('[');
    const zi = cleaned.lastIndexOf(']');
    if (ai !== -1 && zi !== -1 && zi > ai) {
      try { return JSON.parse(cleaned.slice(ai, zi + 1)); } catch(e) {}
    }

    // 4. extract first {...} object
    const oi = cleaned.indexOf('{');
    const ci = cleaned.lastIndexOf('}');
    if (oi !== -1 && ci !== -1 && ci > oi) {
      try { return JSON.parse(cleaned.slice(oi, ci + 1)); } catch(e) {}
    }

    console.error('[Gemini] parseJSON failed. Raw:\n', raw);
    return null;
  }

  // ── QUIZ ───────────────────────────────────────────────────
  async function generateQuiz(topics, difficulty, weakAreas, count) {
    count = count || 25;
    const diff = DIFF[difficulty] || 'Easy';
    const weak = Object.entries(weakAreas || {})
      .sort((a,b) => b[1]-a[1]).slice(0,5).map(e => e[0]).join(', ') || 'none';

    const prompt =
      'You are a technical interview coach for AI/ML and Software Engineering roles in India.\n' +
      'Task: Generate ' + count + ' multiple-choice questions at ' + diff + ' difficulty.\n' +
      'Topics (choose a good mix): ' + topics.join(', ') + '\n' +
      'Prioritise these weak topics 40% more: ' + weak + '\n\n' +
      'RULES:\n' +
      '- Return ONLY raw JSON. No markdown. No explanation. No code fences.\n' +
      '- The JSON must be a valid array of ' + count + ' objects.\n' +
      '- Each object must have exactly these keys:\n' +
      '  id (number), topic (string), question (string),\n' +
      '  options (array of 4 strings starting with "A) " "B) " "C) " "D) "),\n' +
      '  correct (0-3 index), explanation (string), wrong_explanations (array of 3 strings),\n' +
      '  interview_tip (string), difficulty ("' + diff + '")\n' +
      '- Do NOT include example data in your output. Generate real unique questions.\n' +
      '- Start your response with [ and end with ]';

    const raw = await call(prompt);
    const result = parseJSON(raw);
    if (!result || !Array.isArray(result) || result.length === 0) {
      console.error('[Gemini] quiz parse failed. Raw:', raw);
      throw new Error('Quiz generation failed — invalid response format');
    }
    console.log('[Gemini] quiz parsed:', result.length, 'questions');
    return result;
  }

  // ── DSA ────────────────────────────────────────────────────
  async function generateDSA(topics, difficulty, count) {
    count = count || 3;
    const diff = DIFF[difficulty] || 'Easy';
    const recent = Store.state.dsaAIHistory.slice(-10).map(h => h.topic).join(', ') || 'none';

    const prompt =
      'You are a DSA interview coach.\n' +
      'Task: Generate ' + count + ' coding problems at ' + diff + ' difficulty.\n' +
      'Topics to choose from: ' + topics.join(', ') + '\n' +
      'Avoid recently seen topics: ' + recent + '\n\n' +
      'RULES:\n' +
      '- Return ONLY raw JSON. No markdown. No code fences. No explanation.\n' +
      '- The JSON must be a valid array of ' + count + ' objects.\n' +
      '- Each object must have exactly these keys:\n' +
      '  id (number), title (string), topic (string), difficulty ("' + diff + '"),\n' +
      '  problem (string — full problem description),\n' +
      '  examples (array of objects with keys: input, output, explanation),\n' +
      '  constraints (array of strings),\n' +
      '  hint (string), approach (string),\n' +
      '  time_complexity (string), space_complexity (string), followup (string)\n' +
      '- Start your response with [ and end with ]';

    const raw = await call(prompt);
    const result = parseJSON(raw);
    if (!result || !Array.isArray(result) || result.length === 0) {
      console.error('[Gemini] DSA parse failed. Raw:', raw);
      throw new Error('DSA generation failed — invalid response format');
    }
    console.log('[Gemini] DSA parsed:', result.length, 'problems');
    return result;
  }

  // ── VOCABULARY ─────────────────────────────────────────────
  async function generateVocab(count) {
    count = count || 10;
    const recent = Store.state.vocabHistory.slice(-5)
      .reduce((acc, d) => acc.concat((d.words||[]).map(w => w.word)), [])
      .join(', ') || 'none';

    const prompt =
      'You are a vocabulary coach for Indian CS students preparing for tech internship interviews.\n' +
      'Task: Generate ' + count + ' vocabulary words.\n' +
      'Focus: Corporate English, startup terminology, AI/ML terminology, software engineering words.\n' +
      'Avoid recently used words: ' + recent + '\n\n' +
      'RULES:\n' +
      '- Return ONLY raw JSON. No markdown. No code fences. No explanation.\n' +
      '- The JSON must be a valid array of ' + count + ' objects.\n' +
      '- Each object must have exactly these keys:\n' +
      '  word (string), pronunciation (string), meaning (string),\n' +
      '  example (string — a sentence using the word professionally),\n' +
      '  professional_usage (string — how it is used in meetings or emails),\n' +
      '  memory_trick (string), category (string),\n' +
      '  quiz_question (string), quiz_options (array of 4 strings),\n' +
      '  quiz_correct (0-3 index), quiz_explanation (string)\n' +
      '- Start your response with [ and end with ]';

    const raw = await call(prompt);
    const result = parseJSON(raw);
    if (!result || !Array.isArray(result) || result.length === 0) {
      console.error('[Gemini] vocab parse failed. Raw:', raw);
      throw new Error('Vocabulary generation failed — invalid response format');
    }
    console.log('[Gemini] vocab parsed:', result.length, 'words');
    return result;
  }

  // ── ENGLISH ────────────────────────────────────────────────
  async function generateEnglish(difficulty) {
    const diff = DIFF[difficulty] || 'Easy';
    const recent = Store.state.englishHistory.slice(-5)
      .map(h => h.topic || '').filter(Boolean).join(', ') || 'none';

    const prompt =
      'You are an English communication coach for Indian tech students.\n' +
      'Task: Generate one complete English lesson at ' + diff + ' difficulty.\n' +
      'Avoid recently covered topics: ' + recent + '\n' +
      'Choose ONE topic from: professional sentence framing, grammar correction,\n' +
      'corporate communication, interview English, email wording,\n' +
      'common Indian English mistakes, formal vs informal language.\n\n' +
      'RULES:\n' +
      '- Return ONLY raw JSON. No markdown. No code fences. No explanation.\n' +
      '- The JSON must be a single valid object with exactly these keys:\n' +
      '  topic (string), difficulty ("' + diff + '"),\n' +
      '  explanation (string — 3 to 4 clear sentences),\n' +
      '  good_examples (array of 3 strings),\n' +
      '  bad_examples (array of 2 strings),\n' +
      '  exercises (array of exactly 5 objects, each with keys:\n' +
      '    type (string), instruction (string), question (string),\n' +
      '    options (array of 4 strings), correct (0-3), explanation (string)),\n' +
      '  interview_phrases (array of 3 strings),\n' +
      '  key_takeaway (string)\n' +
      '- Start your response with { and end with }';

    const raw = await call(prompt);
    const result = parseJSON(raw);
    if (!result || !result.topic || !result.exercises) {
      console.error('[Gemini] English parse failed. Raw:', raw);
      throw new Error('English lesson generation failed — invalid response format');
    }
    console.log('[Gemini] English lesson parsed:', result.topic);
    return result;
  }

  // ── APTITUDE ───────────────────────────────────────────────
  async function generateAptitude(topics, difficulty, weakAreas, count) {
    count = count || 17;
    const diff = DIFF[difficulty] || 'Easy';
    const weak = Object.entries(weakAreas || {})
      .sort((a,b) => b[1]-a[1]).slice(0,3).map(e => e[0]).join(', ') || 'none';

    const prompt =
      'You are an aptitude coach for Indian tech campus placements (TCS, Infosys, Wipro, Paytm, Swiggy style tests).\n' +
      'Task: Generate ' + count + ' aptitude questions at ' + diff + ' difficulty.\n' +
      'Topics to choose from: ' + topics.join(', ') + '\n' +
      'Prioritise weak areas: ' + weak + '\n\n' +
      'RULES:\n' +
      '- Return ONLY raw JSON. No markdown. No code fences. No explanation.\n' +
      '- The JSON must be a valid array of ' + count + ' objects.\n' +
      '- Each object must have exactly these keys:\n' +
      '  id (number), topic (string), question (string),\n' +
      '  options (array of 4 strings starting with "A) " "B) " "C) " "D) "),\n' +
      '  correct (0-3 index), solution (string — step-by-step explanation),\n' +
      '  shortcut (string — quick trick if applicable, else empty string),\n' +
      '  difficulty ("' + diff + '")\n' +
      '- Start your response with [ and end with ]';

    const raw = await call(prompt);
    const result = parseJSON(raw);
    if (!result || !Array.isArray(result) || result.length === 0) {
      console.error('[Gemini] aptitude parse failed. Raw:', raw);
      throw new Error('Aptitude generation failed — invalid response format');
    }
    console.log('[Gemini] aptitude parsed:', result.length, 'questions');
    return result;
  }

  // ── CODE REVIEW ────────────────────────────────────────────
  async function reviewCode(problem, userCode, language) {
    language = language || 'Python';

    const prompt =
      'You are a senior software engineer reviewing a student\'s code for a tech internship preparation app.\n' +
      'Problem Statement:\n' + problem + '\n\n' +
      'Student\'s ' + language + ' Code:\n' + userCode + '\n\n' +
      'RULES:\n' +
      '- Return ONLY raw JSON. No markdown. No code fences. No explanation.\n' +
      '- The JSON must be a single valid object with exactly these keys:\n' +
      '  is_correct (boolean), correctness_note (string),\n' +
      '  bugs (array of strings — empty array if none),\n' +
      '  time_complexity (string), space_complexity (string),\n' +
      '  quality_score (number 1-10), quality_note (string),\n' +
      '  improvements (array of strings),\n' +
      '  optimal_approach (string),\n' +
      '  optimal_code (string — actual code),\n' +
      '  good_things (array of strings),\n' +
      '  interview_verdict (string)\n' +
      '- Start your response with { and end with }';

    const raw = await call(prompt);
    const result = parseJSON(raw);
    if (!result) {
      console.error('[Gemini] code review parse failed. Raw:', raw);
      throw new Error('Code review failed — invalid response format');
    }
    console.log('[Gemini] code review parsed, correct:', result.is_correct);
    return result;
  }

  return { hasKey, call, parseJSON, generateQuiz, generateDSA, generateVocab, generateEnglish, generateAptitude, reviewCode };
})();
