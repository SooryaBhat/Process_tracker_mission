// ============================================================
//  GEMINI API ENGINE v5 — final
//  - gemini-2.0-flash
//  - auto-retry: convert-to-JSON on parse failure  
//  - robust bracket-depth JSON extractor
//  - detailed console logging
// ============================================================
const Gemini = (() => {
  const DIFF = ['', 'Easy', 'Medium', 'Hard'];

  function getKey() { try { return Config.geminiKey || ''; } catch(e) { return ''; } }
  function hasKey() { return !!getKey(); }

  // ── raw API call ───────────────────────────────────────────
  async function callRaw(prompt) {
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
    const finishReason = data && data.candidates && data.candidates[0] && data.candidates[0].finishReason;
    const text = data &&
      data.candidates && data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text;
    if (!text) {
      throw new Error('Gemini returned empty response (finishReason: ' + (finishReason || 'unknown') + ')');
    }
    console.log('[Gemini] raw (' + Config.geminiModel + '):', text.slice(0, 400));
    return text;
  }

  // ── walk brackets respecting strings ──────────────────────
  function walkBrackets(str, start, openCh, closeCh) {
    var depth = 0, inStr = false, prevBackslash = false, end = -1;
    for (var i = start; i < str.length; i++) {
      var ch = str[i];
      if (inStr) {
        if (prevBackslash) { prevBackslash = false; continue; }
        if (ch === '\\')  { prevBackslash = true; continue; }
        if (ch === '"')   { inStr = false; }
        continue;
      }
      if (ch === '"')    { inStr = true; continue; }
      if (ch === openCh)  { depth++; }
      else if (ch === closeCh) {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }
    return end === -1 ? null : str.slice(start, end + 1);
  }

  // ── unwrap helper: if obj wraps an array, return the array ─
  function maybeUnwrap(parsed, wantArray) {
    if (!wantArray || Array.isArray(parsed)) return parsed;
    if (typeof parsed !== 'object' || !parsed) return parsed;
    var keys = Object.keys(parsed);
    for (var i = 0; i < keys.length; i++) {
      var val = parsed[keys[i]];
      if (Array.isArray(val) && val.length > 0) {
        console.log('[Gemini] unwrapped array from key:', keys[i]);
        return val;
      }
    }
    return parsed; // could not unwrap
  }

  // ── JSON extractor ─────────────────────────────────────────
  function extractJSON(raw, expectArray) {
    if (!raw) return null;
    var wantArray = !!expectArray;

    // 1. strip markdown fences
    var cleaned = raw
      .replace(/```json\s*([\s\S]*?)```/gi, function(_, inner) { return inner.trim(); })
      .replace(/```\s*([\s\S]*?)```/gi,     function(_, inner) { return inner.trim(); })
      .trim();

    // 2. direct parse — handles clean JSON responses
    try {
      var direct = JSON.parse(cleaned);
      return maybeUnwrap(direct, wantArray);
    } catch(e) {}

    // 3. bracket-depth walk — handles text-before/after responses
    var starts = [];
    for (var si = 0; si < cleaned.length && starts.length < 8; si++) {
      if (cleaned[si] === '[' || cleaned[si] === '{') starts.push(si);
    }

    // sort: prefer expected type first
    var preferOpen = wantArray ? '[' : '{';
    starts.sort(function(a, b) {
      var ac = cleaned[a] === preferOpen ? 0 : 1;
      var bc = cleaned[b] === preferOpen ? 0 : 1;
      return ac - bc || a - b;
    });

    for (var ci = 0; ci < starts.length; ci++) {
      var start = starts[ci];
      var openCh  = cleaned[start];
      var closeCh = openCh === '[' ? ']' : '}';
      var slice   = walkBrackets(cleaned, start, openCh, closeCh);
      if (!slice) continue;

      // repair trailing commas e.g. [1,2,] or {"a":1,}
      slice = slice.replace(/,(\s*[}\]])/g, '$1');

      try {
        var parsed = JSON.parse(slice);
        var unwrapped = maybeUnwrap(parsed, wantArray);
        // validate type matches expectation
        if (wantArray && !Array.isArray(unwrapped)) continue;
        if (!wantArray && (typeof unwrapped !== 'object' || Array.isArray(unwrapped))) continue;
        return unwrapped;
      } catch(e) {
        console.warn('[Gemini] slice parse err:', e.message, '| slice:', slice.slice(0, 80));
      }
    }

    console.error('[Gemini] extractJSON failed entirely. raw:\n', raw.slice(0, 600));
    return null;
  }

  // ── convert-to-JSON retry ──────────────────────────────────
  async function convertToJSON(badResponse, schema) {
    console.warn('[Gemini] retry: asking model to reformat its response as JSON');
    var prompt =
      'The following content needs to be formatted as a valid JSON ' + schema + '.\n' +
      'Output ONLY the raw JSON. Absolutely no explanation, no markdown, no code fences.\n' +
      'Your entire response must start with ' + (schema === 'array' ? '[' : '{') + ' and end with ' + (schema === 'array' ? ']' : '}') + '.\n\n' +
      'Content:\n' + badResponse.slice(0, 3000);
    return await callRaw(prompt);
  }

  // ── call with auto-retry ───────────────────────────────────
  async function callWithRetry(prompt, expectArray, minItems, label) {
    var wantArray = !!expectArray;

    function isValid(r) {
      if (!r) return false;
      if (wantArray) return Array.isArray(r) && r.length >= minItems;
      return typeof r === 'object' && !Array.isArray(r) && Object.keys(r).length > 0;
    }

    // attempt 1 — main prompt
    var raw1 = await callRaw(prompt);
    var result = extractJSON(raw1, wantArray);
    if (isValid(result)) {
      console.log('[Gemini]', label, 'OK on attempt 1:', wantArray ? result.length + ' items' : 'object');
      return result;
    }

    // attempt 2 — ask model to reformat its own response
    var schema = wantArray ? 'array' : 'object';
    console.warn('[Gemini]', label, 'attempt 1 invalid, retrying...');
    var raw2 = await convertToJSON(raw1, schema);
    result = extractJSON(raw2, wantArray);
    if (isValid(result)) {
      console.log('[Gemini]', label, 'OK on attempt 2:', wantArray ? result.length + ' items' : 'object');
      return result;
    }

    // failed both
    console.error('[Gemini]', label, 'FAILED both attempts.');
    console.error('Attempt 1 raw:', raw1.slice(0, 400));
    console.error('Attempt 2 raw:', raw2.slice(0, 400));
    throw new Error(
      label + ' failed after 2 attempts. ' +
      (raw1.length < 50 ? 'Gemini returned almost nothing — check your API key and quota.' : 'Check browser console for the raw response.')
    );
  }

  // ── QUIZ ───────────────────────────────────────────────────
  async function generateQuiz(topics, difficulty, weakAreas, count) {
    count = count || 25;
    var diff = DIFF[difficulty] || 'Easy';
    var weak = Object.entries(weakAreas || {})
      .sort(function(a,b){ return b[1]-a[1]; })
      .slice(0,5).map(function(e){ return e[0]; }).join(', ') || 'none';

    var prompt =
      'You are a technical interview coach for AI/ML and Software Engineering roles in India.\n' +
      'Generate ' + count + ' multiple-choice questions at ' + diff + ' difficulty.\n' +
      'Topics: ' + topics.join(', ') + '\n' +
      'Prioritise weak areas (40% more): ' + weak + '\n\n' +
      'CRITICAL: Your entire response must be ONLY a raw JSON array.\n' +
      'No text before [. No text after ]. No markdown. No explanation.\n' +
      'Each object: {id, topic, question, options(4 strings "A) ..." "B) ..." "C) ..." "D) ..."), correct(0-3), explanation, wrong_explanations(3 strings), interview_tip, difficulty}';

    return await callWithRetry(prompt, true, Math.floor(count * 0.5), 'Quiz');
  }

  // ── DSA ────────────────────────────────────────────────────
  async function generateDSA(topics, difficulty, count) {
    count = count || 3;
    var diff = DIFF[difficulty] || 'Easy';
    var recent = Store.state.dsaAIHistory.slice(-10)
      .map(function(h){ return h.topic; }).join(', ') || 'none';

    var prompt =
      'You are a DSA interview coach. Generate ' + count + ' coding problems at ' + diff + ' difficulty.\n' +
      'Topics: ' + topics.join(', ') + '\n' +
      'Avoid repeating: ' + recent + '\n\n' +
      'CRITICAL: Your entire response must be ONLY a raw JSON array.\n' +
      'No text before [. No text after ]. No markdown. No explanation.\n' +
      'Each object: {id, title, topic, difficulty, problem, examples(array of {input,output,explanation}), constraints(string array), hint, approach, time_complexity, space_complexity, followup}';

    return await callWithRetry(prompt, true, 1, 'DSA');
  }

  // ── VOCABULARY ─────────────────────────────────────────────
  async function generateVocab(count) {
    count = count || 10;
    var recent = Store.state.vocabHistory.slice(-5)
      .reduce(function(acc,d){ return acc.concat((d.words||[]).map(function(w){ return w.word; })); }, [])
      .join(', ') || 'none';

    var prompt =
      'You are a vocabulary coach for an Indian CS student preparing for tech internships.\n' +
      'Generate ' + count + ' vocabulary words focused on Corporate English, startup terms, AI/ML terminology.\n' +
      'Avoid recently used words: ' + recent + '\n\n' +
      'CRITICAL: Your entire response must be ONLY a raw JSON array.\n' +
      'No text before [. No text after ]. No markdown. No explanation.\n' +
      'Each object: {word, pronunciation, meaning, example, professional_usage, memory_trick, category, quiz_question, quiz_options(4 strings), quiz_correct(0-3), quiz_explanation}';

    return await callWithRetry(prompt, true, 5, 'Vocabulary');
  }

  // ── ENGLISH ────────────────────────────────────────────────
  async function generateEnglish(difficulty) {
    var diff = DIFF[difficulty] || 'Easy';
    var recent = Store.state.englishHistory.slice(-5)
      .map(function(h){ return h.topic || ''; }).filter(Boolean).join(', ') || 'none';

    var prompt =
      'You are an English coach for Indian tech students preparing for internship interviews.\n' +
      'Generate one English lesson at ' + diff + ' difficulty.\n' +
      'Choose a topic from: professional sentence framing, grammar correction, corporate communication, ' +
      'interview English, email writing, common Indian English mistakes, formal vs informal language.\n' +
      'Avoid recently covered: ' + recent + '\n\n' +
      'CRITICAL: Your entire response must be ONLY a raw JSON object.\n' +
      'No text before {. No text after }. No markdown. No explanation.\n' +
      'Keys: topic, difficulty, explanation(3-4 sentences), good_examples(3 strings), bad_examples(2 strings), ' +
      'exercises(EXACTLY 5 objects each with: type, instruction, question, options(4 strings), correct(0-3), explanation), ' +
      'interview_phrases(3 strings), key_takeaway';

    var result = await callWithRetry(prompt, false, 1, 'English');
    if (!result.exercises || result.exercises.length === 0) {
      throw new Error('English lesson is missing exercises');
    }
    return result;
  }

  // ── APTITUDE ───────────────────────────────────────────────
  async function generateAptitude(topics, difficulty, weakAreas, count) {
    count = count || 17;
    var diff = DIFF[difficulty] || 'Easy';
    var weak = Object.entries(weakAreas || {})
      .sort(function(a,b){ return b[1]-a[1]; })
      .slice(0,3).map(function(e){ return e[0]; }).join(', ') || 'none';

    var prompt =
      'You are an aptitude coach for Indian campus placements (TCS, Infosys, Wipro, Paytm, Swiggy).\n' +
      'Generate ' + count + ' aptitude questions at ' + diff + ' difficulty.\n' +
      'Topics: ' + topics.join(', ') + '\n' +
      'Prioritise weak areas: ' + weak + '\n\n' +
      'CRITICAL: Your entire response must be ONLY a raw JSON array.\n' +
      'No text before [. No text after ]. No markdown. No explanation.\n' +
      'Each object: {id, topic, question, options(4 strings "A) ..." "B) ..." "C) ..." "D) ..."), correct(0-3), solution(step by step), shortcut(quick trick or empty string), difficulty}';

    return await callWithRetry(prompt, true, Math.floor(count * 0.5), 'Aptitude');
  }

  // ── CODE REVIEW ────────────────────────────────────────────
  async function reviewCode(problem, userCode, language) {
    language = language || 'Python';
    var prompt =
      'You are a senior software engineer reviewing student code for tech internship prep.\n' +
      'Language: ' + language + '\n' +
      'Problem: ' + problem.slice(0, 600) + '\n' +
      'Code:\n' + userCode.slice(0, 1500) + '\n\n' +
      'CRITICAL: Your entire response must be ONLY a raw JSON object.\n' +
      'No text before {. No text after }. No markdown. No explanation.\n' +
      'Keys: is_correct(bool), correctness_note, bugs(string array), time_complexity, space_complexity, ' +
      'quality_score(1-10), quality_note, improvements(string array), optimal_approach, optimal_code, good_things(string array), interview_verdict';

    return await callWithRetry(prompt, false, 1, 'Code Review');
  }

  return {
    hasKey, callRaw, extractJSON, walkBrackets,
    generateQuiz, generateDSA, generateVocab,
    generateEnglish, generateAptitude, reviewCode
  };
})();
