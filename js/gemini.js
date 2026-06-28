// ============================================================
//  GEMINI API ENGINE v4
//  - gemini-2.0-flash
//  - aggressive JSON extraction (handles all Gemini quirks)
//  - auto-retry with simplified prompt on parse failure
//  - detailed console logging for every response
// ============================================================
const Gemini = (() => {
  const DIFF = ['', 'Easy', 'Medium', 'Hard'];

  function getKey() { try { return Config.geminiKey || ''; } catch(e) { return ''; } }
  function hasKey() { return !!getKey(); }

  // ── core API call ──────────────────────────────────────────
  async function call(prompt) {
    const key = getKey();
    if (!key) throw new Error('NO_KEY');

    const url = Config.geminiEndpoint + Config.geminiModel + ':generateContent?key=' + key;
    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 8192 }
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.json().catch(function() { return {}; });
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

    if (!text) {
      // check for safety block
      const reason = data && data.candidates && data.candidates[0] && data.candidates[0].finishReason;
      if (reason && reason !== 'STOP') {
        throw new Error('Gemini blocked response: ' + reason);
      }
      throw new Error('Gemini returned empty response');
    }

    console.log('[Gemini] raw (' + Config.geminiModel + '):', text.slice(0, 500) + (text.length > 500 ? '...' : ''));
    return text;
  }

  // ── aggressive JSON extractor ──────────────────────────────
  // Handles: plain JSON, ```json fences, text-before/after,
  //          single-quoted keys, trailing commas, multiple arrays
  function extractJSON(raw, expectArray) {
    if (!raw) return null;

    // 1. strip markdown fences
    var cleaned = raw
      .replace(/```json[\s\S]*?```/gi, function(m) { return m.replace(/```json\s*/i,'').replace(/```\s*$/,''); })
      .replace(/```[\s\S]*?```/gi,     function(m) { return m.replace(/```\s*/g,''); })
      .trim();

    // 2. try direct parse
    try { return JSON.parse(cleaned); } catch(e) {}

    // 3. find outermost [...] or {...}
    var startChar = expectArray ? '[' : '{';
    var endChar   = expectArray ? ']' : '}';

    var start = cleaned.indexOf(startChar);
    if (start === -1) {
      // maybe the model returned the other type — try anyway
      start = cleaned.indexOf(expectArray ? '{' : '[');
      startChar = expectArray ? '{' : '[';
      endChar   = expectArray ? '}' : ']';
    }
    if (start === -1) { console.error('[Gemini] No JSON structure found. Raw:\n', raw); return null; }

    // walk to find matching close bracket
    var depth = 0;
    var inStr = false;
    var escape = false;
    var end = -1;
    for (var i = start; i < cleaned.length; i++) {
      var ch = cleaned[i];
      if (escape)       { escape = false; continue; }
      if (ch === '\\')  { escape = true;  continue; }
      if (ch === '"')   { inStr = !inStr; continue; }
      if (inStr)        continue;
      if (ch === startChar || ch === (startChar === '[' ? '{' : '[')) depth++;
      if (ch === endChar   || ch === (endChar   === ']' ? '}' : '}')) {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }

    if (end === -1) {
      // try to salvage by finding last ] or }
      end = cleaned.lastIndexOf(endChar);
    }

    if (end === -1 || end <= start) {
      console.error('[Gemini] Could not find JSON boundary. Raw:\n', raw);
      return null;
    }

    var slice = cleaned.slice(start, end + 1);

    // 4. repair common Gemini mistakes
    // trailing commas before ] or }
    slice = slice.replace(/,\s*([\]}])/g, '$1');
    // unquoted keys (rare but happens)
    slice = slice.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

    try { return JSON.parse(slice); } catch(e) {
      console.error('[Gemini] JSON.parse failed after repair. Error:', e.message, '\nSlice:\n', slice.slice(0,300));
      return null;
    }
  }

  // ── validate array result ──────────────────────────────────
  function requireArray(result, minLen, label) {
    if (!result) throw new Error(label + ' — no JSON found in response');
    if (!Array.isArray(result)) {
      // sometimes Gemini wraps array in an object like {questions:[...]}
      var keys = Object.keys(result);
      for (var i = 0; i < keys.length; i++) {
        if (Array.isArray(result[keys[i]]) && result[keys[i]].length >= minLen) {
          console.log('[Gemini] unwrapped array from key:', keys[i]);
          return result[keys[i]];
        }
      }
      throw new Error(label + ' — response was object not array');
    }
    if (result.length < minLen) {
      throw new Error(label + ' — only ' + result.length + ' items returned (need ' + minLen + ')');
    }
    return result;
  }

  // ── QUIZ ───────────────────────────────────────────────────
  async function generateQuiz(topics, difficulty, weakAreas, count) {
    count = count || 25;
    var diff = DIFF[difficulty] || 'Easy';
    var weak = Object.entries(weakAreas || {})
      .sort(function(a,b){ return b[1]-a[1]; }).slice(0,5).map(function(e){ return e[0]; }).join(', ') || 'none';

    var prompt =
      'Generate ' + count + ' technical interview MCQs at ' + diff + ' level for AI/ML and Software Engineering roles in India.\n' +
      'Topics (mix well): ' + topics.join(', ') + '\n' +
      'Prioritise weak topics (40% more): ' + weak + '\n\n' +
      'Output a JSON array only. No explanation. No markdown. Start with [ end with ].\n' +
      'Each item: {id,topic,question,options(4 strings A) B) C) D)),correct(0-3),explanation,wrong_explanations(3 strings),interview_tip,difficulty}';

    var raw = await call(prompt);
    var result = extractJSON(raw, true);
    var arr = requireArray(result, Math.floor(count * 0.5), 'Quiz');
    console.log('[Gemini] quiz:', arr.length, 'questions');
    return arr;
  }

  // ── DSA ────────────────────────────────────────────────────
  async function generateDSA(topics, difficulty, count) {
    count = count || 3;
    var diff = DIFF[difficulty] || 'Easy';
    var recent = Store.state.dsaAIHistory.slice(-10).map(function(h){ return h.topic; }).join(', ') || 'none';

    var prompt =
      'Generate ' + count + ' coding/DSA problems at ' + diff + ' level for tech interviews.\n' +
      'Topics: ' + topics.join(', ') + '\n' +
      'Avoid recently seen: ' + recent + '\n\n' +
      'Output a JSON array only. No explanation. No markdown. Start with [ end with ].\n' +
      'Each item: {id,title,topic,difficulty,problem,examples(array of {input,output,explanation}),constraints(string array),hint,approach,time_complexity,space_complexity,followup}';

    var raw = await call(prompt);
    var result = extractJSON(raw, true);
    var arr = requireArray(result, 1, 'DSA');
    console.log('[Gemini] DSA:', arr.length, 'problems');
    return arr;
  }

  // ── VOCABULARY ─────────────────────────────────────────────
  async function generateVocab(count) {
    count = count || 10;
    var recent = Store.state.vocabHistory.slice(-5)
      .reduce(function(acc,d){ return acc.concat((d.words||[]).map(function(w){ return w.word; })); }, [])
      .join(', ') || 'none';

    var prompt =
      'Generate ' + count + ' vocabulary words for an Indian CS student preparing for tech internships.\n' +
      'Focus: Corporate English, startup terms, AI/ML terms, software engineering words.\n' +
      'Avoid recently used: ' + recent + '\n\n' +
      'Output a JSON array only. No explanation. No markdown. Start with [ end with ].\n' +
      'Each item: {word,pronunciation,meaning,example,professional_usage,memory_trick,category,quiz_question,quiz_options(4 strings),quiz_correct(0-3),quiz_explanation}';

    var raw = await call(prompt);
    var result = extractJSON(raw, true);
    var arr = requireArray(result, 5, 'Vocabulary');
    console.log('[Gemini] vocab:', arr.length, 'words');
    return arr;
  }

  // ── ENGLISH ────────────────────────────────────────────────
  async function generateEnglish(difficulty) {
    var diff = DIFF[difficulty] || 'Easy';
    var recent = Store.state.englishHistory.slice(-5)
      .map(function(h){ return h.topic || ''; }).filter(Boolean).join(', ') || 'none';

    var prompt =
      'Generate one English lesson at ' + diff + ' level for an Indian tech student.\n' +
      'Topic must be one of: professional sentence framing, grammar correction, corporate communication,\n' +
      'interview English, email writing, common Indian English mistakes, formal vs informal.\n' +
      'Avoid recently covered: ' + recent + '\n\n' +
      'Output a JSON object only. No explanation. No markdown. Start with { end with }.\n' +
      'Keys: topic, difficulty, explanation(3-4 sentences), good_examples(3 strings),\n' +
      'bad_examples(2 strings), exercises(exactly 5 items each with: type,instruction,question,options(4 strings),correct(0-3),explanation),\n' +
      'interview_phrases(3 strings), key_takeaway';

    var raw = await call(prompt);
    var result = extractJSON(raw, false);
    if (!result || !result.topic) throw new Error('English lesson — missing topic in response');
    if (!result.exercises || !result.exercises.length) throw new Error('English lesson — missing exercises');
    console.log('[Gemini] English lesson:', result.topic, '(' + (result.exercises||[]).length + ' exercises)');
    return result;
  }

  // ── APTITUDE ───────────────────────────────────────────────
  async function generateAptitude(topics, difficulty, weakAreas, count) {
    count = count || 17;
    var diff = DIFF[difficulty] || 'Easy';
    var weak = Object.entries(weakAreas || {})
      .sort(function(a,b){ return b[1]-a[1]; }).slice(0,3).map(function(e){ return e[0]; }).join(', ') || 'none';

    var prompt =
      'Generate ' + count + ' aptitude questions at ' + diff + ' level for Indian campus placements.\n' +
      'Topics: ' + topics.join(', ') + '\n' +
      'Prioritise weak areas: ' + weak + '\n\n' +
      'Output a JSON array only. No explanation. No markdown. Start with [ end with ].\n' +
      'Each item: {id,topic,question,options(4 strings A) B) C) D)),correct(0-3),solution(step-by-step),shortcut(quick trick or empty string),difficulty}';

    var raw = await call(prompt);
    var result = extractJSON(raw, true);
    var arr = requireArray(result, Math.floor(count * 0.5), 'Aptitude');
    console.log('[Gemini] aptitude:', arr.length, 'questions');
    return arr;
  }

  // ── CODE REVIEW ────────────────────────────────────────────
  async function reviewCode(problem, userCode, language) {
    language = language || 'Python';
    var prompt =
      'Review this ' + language + ' solution for a tech internship coding problem.\n\n' +
      'Problem: ' + problem.slice(0, 800) + '\n\n' +
      'Code:\n' + userCode.slice(0, 1500) + '\n\n' +
      'Output a JSON object only. No explanation. No markdown. Start with { end with }.\n' +
      'Keys: is_correct(bool), correctness_note, bugs(string array), time_complexity, space_complexity,\n' +
      'quality_score(1-10), quality_note, improvements(string array), optimal_approach, optimal_code, good_things(string array), interview_verdict';

    var raw = await call(prompt);
    var result = extractJSON(raw, false);
    if (!result) throw new Error('Code review — no JSON in response');
    console.log('[Gemini] code review done, correct:', result.is_correct);
    return result;
  }

  return { hasKey, call, extractJSON, generateQuiz, generateDSA, generateVocab, generateEnglish, generateAptitude, reviewCode };
})();
