// ============================================================
//  GEMINI API ENGINE v6
//  - NO responseMimeType (breaks gemini-2.0-flash)
//  - Clean prompts with NO embedded example JSON
//  - Auto-retry: if Gemini returns prose, send it back to reformat
//  - Robust bracket-depth JSON extractor
// ============================================================
const Gemini = (() => {
  const DIFF = ['', 'Easy', 'Medium', 'Hard'];

  function getKey() { try { return Config.geminiKey || ''; } catch(e) { return ''; } }
  function hasKey() { return !!getKey(); }

  // ── raw API call (no responseMimeType) ────────────────────
  async function callRaw(prompt) {
    const key = getKey();
    if (!key) throw new Error('NO_KEY');
    const url = Config.geminiEndpoint + Config.geminiModel + ':generateContent?key=' + key;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 8192 }
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(function() { return {}; });
      const msg = (err.error && err.error.message) ? err.error.message : 'HTTP ' + res.status;
      console.error('[Gemini] API error:', msg);
      throw new Error(msg);
    }
    const data = await res.json();
    const text = data && data.candidates && data.candidates[0] &&
      data.candidates[0].content && data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
    if (!text) {
      const reason = (data && data.candidates && data.candidates[0] && data.candidates[0].finishReason) || 'unknown';
      throw new Error('Gemini returned empty response (reason: ' + reason + ')');
    }
    console.log('[Gemini] raw response:', text.slice(0, 300));
    return text;
  }

  // ── bracket-depth JSON extractor ──────────────────────────
  function walkBrackets(str, start, openCh, closeCh) {
    var depth = 0, inStr = false, prevSlash = false, end = -1;
    for (var i = start; i < str.length; i++) {
      var ch = str[i];
      if (inStr) {
        if (prevSlash) { prevSlash = false; continue; }
        if (ch === '\\') { prevSlash = true; continue; }
        if (ch === '"')  { inStr = false; }
        continue;
      }
      if (ch === '"')    { inStr = true; continue; }
      if (ch === openCh) { depth++; }
      else if (ch === closeCh) { depth--; if (depth === 0) { end = i; break; } }
    }
    return end === -1 ? null : str.slice(start, end + 1);
  }

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
    return parsed;
  }

  function extractJSON(raw, expectArray) {
    if (!raw) return null;
    var wantArray = !!expectArray;
    // strip markdown fences
    var cleaned = raw
      .replace(/```json\s*([\s\S]*?)```/gi, function(_, g) { return g.trim(); })
      .replace(/```\s*([\s\S]*?)```/gi,     function(_, g) { return g.trim(); })
      .trim();
    // direct parse (best case)
    try { return maybeUnwrap(JSON.parse(cleaned), wantArray); } catch(e) {}
    // bracket-depth walk
    var preferOpen = wantArray ? '[' : '{';
    var starts = [];
    for (var si = 0; si < cleaned.length && starts.length < 8; si++) {
      if (cleaned[si] === '[' || cleaned[si] === '{') starts.push(si);
    }
    starts.sort(function(a, b) {
      return ((cleaned[a] === preferOpen ? 0 : 1) - (cleaned[b] === preferOpen ? 0 : 1)) || a - b;
    });
    for (var ci = 0; ci < starts.length; ci++) {
      var openCh  = cleaned[starts[ci]];
      var closeCh = openCh === '[' ? ']' : '}';
      var slice   = walkBrackets(cleaned, starts[ci], openCh, closeCh);
      if (!slice) continue;
      slice = slice.replace(/,(\s*[}\]])/g, '$1'); // trailing comma repair
      try {
        var parsed = JSON.parse(slice);
        var unwrapped = maybeUnwrap(parsed, wantArray);
        if (wantArray && !Array.isArray(unwrapped)) continue;
        if (!wantArray && (typeof unwrapped !== 'object' || Array.isArray(unwrapped))) continue;
        return unwrapped;
      } catch(e) {}
    }
    console.error('[Gemini] extractJSON failed. Raw:\n', raw.slice(0, 500));
    return null;
  }

  // ── call with auto-retry ──────────────────────────────────
  async function callWithRetry(prompt, expectArray, minItems, label) {
    var wantArray = !!expectArray;
    function isValid(r) {
      if (!r) return false;
      if (wantArray) return Array.isArray(r) && r.length >= minItems;
      return typeof r === 'object' && !Array.isArray(r) && Object.keys(r).length > 0;
    }
    // attempt 1
    var raw1 = await callRaw(prompt);
    var result = extractJSON(raw1, wantArray);
    if (isValid(result)) {
      console.log('[Gemini]', label, 'OK (attempt 1):', wantArray ? result.length + ' items' : 'object');
      return result;
    }
    // attempt 2: ask Gemini to reformat its own response
    console.warn('[Gemini]', label, 'attempt 1 invalid, retrying with reformat request...');
    var schema = wantArray ? 'array' : 'object';
    var retryPrompt =
      'Convert the following content into a valid JSON ' + schema + '.\n' +
      'Output ONLY raw JSON. No text before or after. No markdown.\n' +
      (wantArray ? 'Start with [ and end with ].' : 'Start with { and end with }.') + '\n\n' +
      'Content:\n' + raw1.slice(0, 3000);
    var raw2 = await callRaw(retryPrompt);
    result = extractJSON(raw2, wantArray);
    if (isValid(result)) {
      console.log('[Gemini]', label, 'OK (attempt 2):', wantArray ? result.length + ' items' : 'object');
      return result;
    }
    console.error('[Gemini]', label, 'FAILED both attempts.');
    console.error('Attempt 1:\n', raw1.slice(0, 400));
    console.error('Attempt 2:\n', raw2.slice(0, 400));
    var hint = raw1.length < 30
      ? 'Gemini returned almost nothing. Check API key and quota.'
      : 'Gemini returned prose instead of JSON twice. Open browser console to see the raw response.';
    throw new Error(label + ' failed. ' + hint);
  }

  // ── QUIZ ─────────────────────────────────────────────────
  async function generateQuiz(topics, difficulty, weakAreas, count) {
    count = count || 25;
    var diff = DIFF[difficulty] || 'Easy';
    var weak = Object.entries(weakAreas || {}).sort(function(a,b){return b[1]-a[1];})
      .slice(0,5).map(function(e){return e[0];}).join(', ') || 'none';
    var prompt =
      'You are a technical interview coach for AI/ML and Software Engineering internships in India.\n' +
      'Generate ' + count + ' multiple-choice questions at ' + diff + ' difficulty.\n' +
      'Topics to cover: ' + topics.join(', ') + '\n' +
      'Give extra weight to these weak areas: ' + weak + '\n\n' +
      'IMPORTANT: Output ONLY a raw JSON array. No text before [. No text after ]. No markdown.\n' +
      'Each item must have these keys:\n' +
      'id (number), topic (string), question (string),\n' +
      'options (array of exactly 4 strings, each starting with "A) " "B) " "C) " "D) "),\n' +
      'correct (number 0 to 3),\n' +
      'explanation (string - why the correct answer is right),\n' +
      'wrong_explanations (array of 3 strings - why each wrong option is wrong),\n' +
      'interview_tip (string), difficulty (string)';
    return await callWithRetry(prompt, true, Math.floor(count * 0.5), 'Quiz');
  }

  // ── DSA ──────────────────────────────────────────────────
  async function generateDSA(topics, difficulty, count) {
    count = count || 3;
    var diff = DIFF[difficulty] || 'Easy';
    var recent = Store.state.dsaAIHistory.slice(-10).map(function(h){return h.topic;}).join(', ') || 'none';
    var prompt =
      'You are a DSA interview coach. Generate ' + count + ' coding problems at ' + diff + ' difficulty.\n' +
      'Topics: ' + topics.join(', ') + '\n' +
      'Do not repeat these recent topics: ' + recent + '\n\n' +
      'IMPORTANT: Output ONLY a raw JSON array. No text before [. No text after ]. No markdown.\n' +
      'Each item must have these keys:\n' +
      'id (number), title (string), topic (string), difficulty (string),\n' +
      'problem (string - full problem description),\n' +
      'examples (array of objects with keys: input, output, explanation),\n' +
      'constraints (array of strings), hint (string), approach (string),\n' +
      'time_complexity (string), space_complexity (string), followup (string)';
    return await callWithRetry(prompt, true, 1, 'DSA');
  }

  // ── VOCABULARY ───────────────────────────────────────────
  async function generateVocab(count) {
    count = count || 10;
    var recent = Store.state.vocabHistory.slice(-5)
      .reduce(function(acc,d){return acc.concat((d.words||[]).map(function(w){return w.word;}));}, [])
      .join(', ') || 'none';
    var prompt =
      'You are a vocabulary coach for an Indian CS student preparing for tech internships.\n' +
      'Generate ' + count + ' vocabulary words. Focus: Corporate English, AI/ML terms, startup language, software engineering.\n' +
      'Avoid words used recently: ' + recent + '\n\n' +
      'IMPORTANT: Output ONLY a raw JSON array. No text before [. No text after ]. No markdown.\n' +
      'Each item must have these keys:\n' +
      'word (string), pronunciation (string), meaning (string), example (string),\n' +
      'professional_usage (string), memory_trick (string), category (string),\n' +
      'quiz_question (string), quiz_options (array of 4 strings),\n' +
      'quiz_correct (number 0 to 3), quiz_explanation (string)';
    return await callWithRetry(prompt, true, 5, 'Vocabulary');
  }

  // ── ENGLISH ──────────────────────────────────────────────
  async function generateEnglish(difficulty) {
    var diff = DIFF[difficulty] || 'Easy';
    var recent = Store.state.englishHistory.slice(-5)
      .map(function(h){return h.topic||'';}).filter(Boolean).join(', ') || 'none';
    var prompt =
      'You are an English coach for Indian tech students preparing for internship interviews.\n' +
      'Generate one English lesson at ' + diff + ' difficulty.\n' +
      'Choose a topic from: professional sentence framing, grammar correction, corporate communication,\n' +
      'interview English, email writing, common Indian English mistakes, formal vs informal language.\n' +
      'Avoid recently covered topics: ' + recent + '\n\n' +
      'IMPORTANT: Output ONLY a raw JSON object. No text before {. No text after }. No markdown.\n' +
      'The object must have these keys:\n' +
      'topic (string), difficulty (string), explanation (string - 3 to 4 sentences),\n' +
      'good_examples (array of 3 strings), bad_examples (array of 2 strings),\n' +
      'exercises (array of exactly 5 objects, each with: type, instruction, question,\n' +
      '  options (array of 4 strings), correct (number 0-3), explanation),\n' +
      'interview_phrases (array of 3 strings), key_takeaway (string)';
    var result = await callWithRetry(prompt, false, 1, 'English');
    if (!result.exercises || !result.exercises.length) throw new Error('English lesson missing exercises');
    return result;
  }

  // ── APTITUDE ─────────────────────────────────────────────
  async function generateAptitude(topics, difficulty, weakAreas, count) {
    count = count || 17;
    var diff = DIFF[difficulty] || 'Easy';
    var weak = Object.entries(weakAreas || {}).sort(function(a,b){return b[1]-a[1];})
      .slice(0,3).map(function(e){return e[0];}).join(', ') || 'none';
    var prompt =
      'You are an aptitude coach for Indian campus placements (TCS, Infosys, Wipro, Paytm, Swiggy).\n' +
      'Generate ' + count + ' aptitude questions at ' + diff + ' difficulty.\n' +
      'Topics: ' + topics.join(', ') + '\n' +
      'Give extra weight to weak areas: ' + weak + '\n\n' +
      'IMPORTANT: Output ONLY a raw JSON array. No text before [. No text after ]. No markdown.\n' +
      'Each item must have these keys:\n' +
      'id (number), topic (string), question (string),\n' +
      'options (array of exactly 4 strings, each starting with "A) " "B) " "C) " "D) "),\n' +
      'correct (number 0 to 3),\n' +
      'solution (string - step by step working),\n' +
      'shortcut (string - quick trick, or empty string if none),\n' +
      'difficulty (string)';
    return await callWithRetry(prompt, true, Math.floor(count * 0.5), 'Aptitude');
  }

  // ── PYTHON LEARNING ──────────────────────────────────────
  async function generatePythonLesson(topic, day) {
    var prompt =
      'You are a Python tutor teaching a CS student from scratch for AI/ML internships.\n' +
      'Generate a daily Python lesson for Day ' + day + '.\n' +
      'Topic: ' + topic + '\n\n' +
      'IMPORTANT: Output ONLY a raw JSON object. No text before {. No text after }. No markdown.\n' +
      'The object must have these keys:\n' +
      'topic (string), day (number), concept (string - 3 to 4 sentence explanation),\n' +
      'key_points (array of 4 to 6 strings - bullet points of what to remember),\n' +
      'code_example (string - a clean working Python code example with comments),\n' +
      'common_mistakes (array of 2 to 3 strings),\n' +
      'coding_question (object with keys: title, description, examples(array of {input,output}), hint),\n' +
      'mcq (array of exactly 5 objects, each with: question, options(4 strings), correct(0-3), explanation)';
    var result = await callWithRetry(prompt, false, 1, 'Python Lesson');
    if (!result.concept || !result.mcq || !result.coding_question) {
      throw new Error('Python lesson missing required fields');
    }
    return result;
  }

  // ── CODE REVIEW ──────────────────────────────────────────
  async function reviewCode(problem, userCode, language) {
    language = language || 'Python';
    var prompt =
      'You are a senior engineer reviewing student code for tech internship prep.\n' +
      'Language: ' + language + '\n' +
      'Problem: ' + problem.slice(0, 600) + '\n' +
      'Code:\n' + userCode.slice(0, 1500) + '\n\n' +
      'IMPORTANT: Output ONLY a raw JSON object. No text before {. No text after }. No markdown.\n' +
      'Keys: is_correct (boolean), correctness_note (string), bugs (array of strings),\n' +
      'time_complexity (string), space_complexity (string), quality_score (number 1-10),\n' +
      'quality_note (string), improvements (array of strings), optimal_approach (string),\n' +
      'optimal_code (string), good_things (array of strings), interview_verdict (string)';
    return await callWithRetry(prompt, false, 1, 'Code Review');
  }

  return {
    hasKey, callRaw, extractJSON,
    generateQuiz, generateDSA, generateVocab, generateEnglish,
    generateAptitude, generatePythonLesson, reviewCode
  };
})();
