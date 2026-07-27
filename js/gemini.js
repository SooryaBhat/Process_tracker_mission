// ============================================================
//  GEMINI API ENGINE v7
//  Root fixes:
//  1. NO responseMimeType (breaks gemini-2.0-flash)
//  2. NO embedded example JSON in prompts
//  3. Reduced counts: quiz=10, aptitude=10 (avoids token truncation)
//  4. Truncation recovery: salvages complete objects from cut-off JSON
//  5. Auto-retry on parse failure
// ============================================================
const Gemini = (() => {
  const DIFF = ['', 'Easy', 'Medium', 'Hard'];

  function getKey() { try { return Config.geminiKey || ''; } catch(e) { return ''; } }
  function hasKey() { return !!getKey(); }

  // ── raw API call ──────────────────────────────────────────
  async function callRaw(prompt) {
    const key = getKey();
    if (!key) throw new Error('NO_KEY');
    const url = Config.geminiEndpoint + Config.geminiModel + ':generateContent?key=' + key;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 8192
          // NO responseMimeType — it rejects prompts containing JSON examples
        }
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(function() { return {}; });
      const msg = (err.error && err.error.message) ? err.error.message : 'HTTP ' + res.status;
      console.error('[Gemini] API error:', msg);
      throw new Error(msg);
    }
    const data = await res.json();
    const finishReason = data && data.candidates && data.candidates[0] &&
                         data.candidates[0].finishReason;
    const text = data && data.candidates && data.candidates[0] &&
                 data.candidates[0].content && data.candidates[0].content.parts &&
                 data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
    if (!text) {
      throw new Error('Empty response from Gemini (finishReason: ' + (finishReason || 'unknown') + ')');
    }
    if (finishReason === 'MAX_TOKENS') {
      console.warn('[Gemini] Response hit MAX_TOKENS — will attempt truncation recovery');
    }
    console.log('[Gemini] raw (' + finishReason + '):', text.slice(0, 200));
    return text;
  }

  // ── bracket-depth walker ──────────────────────────────────
  function walkBrackets(str, start, openCh, closeCh) {
    var depth = 0, inStr = false, prevSlash = false;
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
      else if (ch === closeCh) {
        depth--;
        if (depth === 0) return str.slice(start, i + 1);
      }
    }
    return null; // not found (truncated)
  }

  // ── salvage complete objects from truncated array ─────────
  // When Gemini hits MAX_TOKENS mid-JSON, we extract whatever
  // complete objects were generated before the cut-off.
  function salvageArray(str) {
    var results = [];
    var depth = 0, inStr = false, prevSlash = false;
    var objStart = -1;
    var arrStarted = false;

    for (var i = 0; i < str.length; i++) {
      var ch = str[i];
      if (inStr) {
        if (prevSlash) { prevSlash = false; continue; }
        if (ch === '\\') { prevSlash = true; continue; }
        if (ch === '"')  { inStr = false; }
        continue;
      }
      if (ch === '"') { inStr = true; continue; }

      if (ch === '[' && !arrStarted) { arrStarted = true; depth = 1; continue; }
      if (!arrStarted) continue;

      if (ch === '{') {
        if (depth === 1) objStart = i; // start of a top-level object
        depth++;
      } else if (ch === '[') {
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 1 && objStart !== -1) {
          // complete top-level object found
          try {
            results.push(JSON.parse(str.slice(objStart, i + 1)));
            objStart = -1;
          } catch(e) {}
        }
      } else if (ch === ']') {
        depth--;
      }
    }
    return results;
  }

  // ── unwrap {key: [...]} wrapper ───────────────────────────
  function maybeUnwrap(parsed, wantArray) {
    if (!wantArray || Array.isArray(parsed)) return parsed;
    if (typeof parsed !== 'object' || !parsed) return parsed;
    var keys = Object.keys(parsed);
    for (var i = 0; i < keys.length; i++) {
      if (Array.isArray(parsed[keys[i]]) && parsed[keys[i]].length > 0) {
        console.log('[Gemini] unwrapped from key:', keys[i]);
        return parsed[keys[i]];
      }
    }
    return parsed;
  }

  // ── main JSON extractor ───────────────────────────────────
  function extractJSON(raw, expectArray) {
    if (!raw) return null;
    var wantArray = !!expectArray;

    // strip markdown fences
    var cleaned = raw
      .replace(/```json\s*([\s\S]*?)```/gi, function(_, g) { return g.trim(); })
      .replace(/```\s*([\s\S]*?)```/gi,     function(_, g) { return g.trim(); })
      .trim();

    // 1. direct parse (clean response)
    try {
      var d = JSON.parse(cleaned);
      return maybeUnwrap(d, wantArray);
    } catch(e) {}

    // 2. bracket-depth walk to find outermost structure
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

    // 3. truncation recovery — salvage whatever complete objects exist
    if (wantArray) {
      var salvaged = salvageArray(cleaned);
      if (salvaged.length > 0) {
        console.warn('[Gemini] Truncation recovery: salvaged', salvaged.length, 'objects');
        return salvaged;
      }
    }

    console.error('[Gemini] extractJSON failed. Raw:\n', raw.slice(0, 400));
    return null;
  }

  // ── validate result ───────────────────────────────────────
  function isValid(r, wantArray, minItems) {
    if (!r) return false;
    if (wantArray) return Array.isArray(r) && r.length >= minItems;
    return typeof r === 'object' && !Array.isArray(r) && Object.keys(r).length > 0;
  }

  // ── call with auto-retry ──────────────────────────────────
  async function callWithRetry(prompt, expectArray, minItems, label) {
    var wantArray = !!expectArray;

    // attempt 1
    var raw1 = await callRaw(prompt);
    var result = extractJSON(raw1, wantArray);
    if (isValid(result, wantArray, minItems)) {
      console.log('[Gemini]', label, 'OK (attempt 1):', wantArray ? result.length + ' items' : 'object');
      return result;
    }

    // attempt 2: ask Gemini to reformat its own response as JSON
    console.warn('[Gemini]', label, 'attempt 1 invalid — retrying with reformat request');
    var retryPrompt =
      'Convert the content below into a valid JSON ' + (wantArray ? 'array' : 'object') + '.\n' +
      'Output ONLY raw JSON. No text before or after. No markdown. No code fences.\n' +
      (wantArray ? 'Start with [ and end with ].' : 'Start with { and end with }.') + '\n\n' +
      'Content:\n' + raw1.slice(0, 3000);
    var raw2 = await callRaw(retryPrompt);
    result = extractJSON(raw2, wantArray);
    if (isValid(result, wantArray, minItems)) {
      console.log('[Gemini]', label, 'OK (attempt 2):', wantArray ? result.length + ' items' : 'object');
      return result;
    }

    console.error('[Gemini]', label, 'both attempts failed.');
    console.error('Attempt 1:\n', raw1.slice(0, 400));
    console.error('Attempt 2:\n', raw2.slice(0, 400));
    throw new Error(
      label + ' failed. ' +
      (raw1.length < 30
        ? 'Gemini returned almost nothing — check your API key and quota.'
        : 'Open browser console (F12) to see the raw Gemini response.')
    );
  }

  // ── QUIZ (10 questions to avoid token limits) ─────────────
  async function generateQuiz(topics, difficulty, weakAreas, count) {
    count = count || 10; // 10 not 25 — 25 consistently hits MAX_TOKENS
    var diff = DIFF[difficulty] || 'Easy';
    var weak = Object.entries(weakAreas || {})
      .sort(function(a,b){ return b[1]-a[1]; })
      .slice(0, 5).map(function(e){ return e[0]; }).join(', ') || 'none';

    var prompt =
      'You are a technical interview coach for AI/ML and Software Engineering internships in India.\n' +
      'Generate exactly ' + count + ' multiple-choice questions at ' + diff + ' difficulty.\n' +
      'Topics to cover (mix well): ' + topics.join(', ') + '\n' +
      'Give extra questions on these weak areas: ' + weak + '\n\n' +
      'RULES:\n' +
      '- Output ONLY a raw JSON array. Nothing before [. Nothing after ]. No markdown.\n' +
      '- Keep explanations concise (1-2 sentences max) to avoid hitting length limits.\n' +
      '- Each item must have EXACTLY these keys:\n' +
      '  id (number), topic (string), question (string),\n' +
      '  options (array of 4 strings, each starting with "A) " "B) " "C) " "D) "),\n' +
      '  correct (number 0-3), explanation (string, max 1 sentence),\n' +
      '  wrong_explanations (array of 3 short strings),\n' +
      '  interview_tip (string, max 1 sentence), difficulty (string)';

    return await callWithRetry(prompt, true, Math.floor(count * 0.5), 'Quiz');
  }

  // ── DSA ───────────────────────────────────────────────────
  async function generateDSA(topics, difficulty, count) {
    count = count || 3;
    var diff = DIFF[difficulty] || 'Easy';
    var recent = Store.state.dsaAIHistory.slice(-10)
      .map(function(h){ return h.topic; }).join(', ') || 'none';

    var prompt =
      'You are a DSA interview coach. Generate exactly ' + count + ' coding problems at ' + diff + ' difficulty.\n' +
      'Topics: ' + topics.join(', ') + '\n' +
      'Do not repeat these recent topics: ' + recent + '\n\n' +
      'RULES:\n' +
      '- Output ONLY a raw JSON array. Nothing before [. Nothing after ]. No markdown.\n' +
      '- Keep descriptions concise to avoid length limits.\n' +
      '- Each item must have EXACTLY these keys:\n' +
      '  id (number), title (string), topic (string), difficulty (string),\n' +
      '  problem (string), examples (array of objects with: input, output, explanation),\n' +
      '  constraints (array of strings), hint (string), approach (string),\n' +
      '  time_complexity (string), space_complexity (string), followup (string)';

    return await callWithRetry(prompt, true, 1, 'DSA');
  }

  // ── VOCABULARY ────────────────────────────────────────────
  async function generateVocab(count) {
    count = count || 10;
    var recent = Store.state.vocabHistory.slice(-5)
      .reduce(function(acc, d) {
        return acc.concat((d.words || []).map(function(w) { return w.word; }));
      }, []).join(', ') || 'none';

    var prompt =
      'You are a vocabulary coach for an Indian CS student preparing for tech internships.\n' +
      'Generate exactly ' + count + ' vocabulary words focused on: Corporate English, AI/ML terms, startup language, software engineering.\n' +
      'Avoid these recently used words: ' + recent + '\n\n' +
      'RULES:\n' +
      '- Output ONLY a raw JSON array. Nothing before [. Nothing after ]. No markdown.\n' +
      '- Keep all text fields concise (1-2 sentences max).\n' +
      '- Each item must have EXACTLY these keys:\n' +
      '  word (string), pronunciation (string), meaning (string),\n' +
      '  example (string), professional_usage (string), memory_trick (string), category (string),\n' +
      '  quiz_question (string), quiz_options (array of 4 strings),\n' +
      '  quiz_correct (number 0-3), quiz_explanation (string)';

    return await callWithRetry(prompt, true, 5, 'Vocabulary');
  }

  // ── ENGLISH ───────────────────────────────────────────────
  async function generateEnglish(difficulty) {
    var diff = DIFF[difficulty] || 'Easy';
    var recent = Store.state.englishHistory.slice(-5)
      .map(function(h) { return h.topic || ''; }).filter(Boolean).join(', ') || 'none';

    var prompt =
      'You are an English coach for Indian tech students preparing for internship interviews.\n' +
      'Generate one English lesson at ' + diff + ' difficulty.\n' +
      'Choose ONE topic from: professional sentence framing, grammar correction, corporate communication,\n' +
      'interview English, email writing, common Indian English mistakes, formal vs informal language.\n' +
      'Avoid recently covered topics: ' + recent + '\n\n' +
      'RULES:\n' +
      '- Output ONLY a raw JSON object. Nothing before {. Nothing after }. No markdown.\n' +
      '- Keep all text fields concise (1-2 sentences max) to avoid length limits.\n' +
      '- The object must have EXACTLY these keys:\n' +
      '  topic (string), difficulty (string), explanation (string),\n' +
      '  good_examples (array of 3 strings), bad_examples (array of 2 strings),\n' +
      '  exercises (array of exactly 5 objects, each with:\n' +
      '    type (string), instruction (string), question (string),\n' +
      '    options (array of 4 strings), correct (number 0-3), explanation (string)),\n' +
      '  interview_phrases (array of 3 strings), key_takeaway (string)';

    var result = await callWithRetry(prompt, false, 1, 'English');
    if (!result.exercises || !result.exercises.length) {
      throw new Error('English lesson missing exercises');
    }
    return result;
  }

  // ── APTITUDE (10 questions to avoid token limits) ─────────
  async function generateAptitude(topics, difficulty, weakAreas, count) {
    count = count || 10; // 10 not 17 — 17 consistently hits MAX_TOKENS
    var diff = DIFF[difficulty] || 'Easy';
    var weak = Object.entries(weakAreas || {})
      .sort(function(a,b){ return b[1]-a[1]; })
      .slice(0, 3).map(function(e){ return e[0]; }).join(', ') || 'none';

    var prompt =
      'You are an aptitude coach for Indian campus placements (TCS, Infosys, Wipro, Paytm, Swiggy).\n' +
      'Generate exactly ' + count + ' aptitude questions at ' + diff + ' difficulty.\n' +
      'Topics: ' + topics.join(', ') + '\n' +
      'Give extra questions on weak areas: ' + weak + '\n\n' +
      'RULES:\n' +
      '- Output ONLY a raw JSON array. Nothing before [. Nothing after ]. No markdown.\n' +
      '- Keep solution and shortcut fields concise (2-3 sentences max) to avoid length limits.\n' +
      '- Each item must have EXACTLY these keys:\n' +
      '  id (number), topic (string), question (string),\n' +
      '  options (array of 4 strings, each starting with "A) " "B) " "C) " "D) "),\n' +
      '  correct (number 0-3), solution (string, step-by-step but concise),\n' +
      '  shortcut (string, quick trick or empty string), difficulty (string)';

    return await callWithRetry(prompt, true, Math.floor(count * 0.5), 'Aptitude');
  }

  // ── PYTHON LESSON ─────────────────────────────────────────
  async function generatePythonLesson(topic, day) {
    var prompt =
      'You are a Python tutor teaching an Indian CS student from scratch for AI/ML internships.\n' +
      'Generate a daily Python lesson for Day ' + day + ' on the topic: ' + topic + '\n\n' +
      'RULES:\n' +
      '- Output ONLY a raw JSON object. Nothing before {. Nothing after }. No markdown.\n' +
      '- Keep all text fields concise to avoid length limits.\n' +
      '- The object must have EXACTLY these keys:\n' +
      '  topic (string), day (number), concept (string, 2-3 sentences explaining the topic),\n' +
      '  key_points (array of 4-5 short strings),\n' +
      '  code_example (string, a clean working Python code snippet with comments, max 20 lines),\n' +
      '  common_mistakes (array of 2-3 short strings),\n' +
      '  coding_question (object with: title, description, examples (array of {input, output}), hint),\n' +
      '  mcq (array of exactly 5 objects, each with:\n' +
      '    question (string), options (array of 4 strings), correct (number 0-3), explanation (string, 1 sentence))';

    var result = await callWithRetry(prompt, false, 1, 'Python Lesson');
    if (!result.concept || !result.mcq || !result.coding_question) {
      throw new Error('Python lesson missing required fields');
    }
    return result;
  }

  // ── CODE REVIEW ───────────────────────────────────────────
  async function reviewCode(problem, userCode, language) {
    language = language || 'Python';
    var prompt =
      'You are a senior software engineer reviewing student code for tech internship prep.\n' +
      'Language: ' + language + '\n' +
      'Problem: ' + problem.slice(0, 400) + '\n' +
      'Code:\n' + userCode.slice(0, 1000) + '\n\n' +
      'RULES:\n' +
      '- Output ONLY a raw JSON object. Nothing before {. Nothing after }. No markdown.\n' +
      '- Keep all fields concise (1-2 sentences max).\n' +
      '- The object must have EXACTLY these keys:\n' +
      '  is_correct (boolean), correctness_note (string),\n' +
      '  bugs (array of strings, empty if none), time_complexity (string), space_complexity (string),\n' +
      '  quality_score (number 1-10), quality_note (string),\n' +
      '  improvements (array of max 3 strings), optimal_approach (string),\n' +
      '  optimal_code (string), good_things (array of max 2 strings), interview_verdict (string)';

    return await callWithRetry(prompt, false, 1, 'Code Review');
  }

  return {
    hasKey, callRaw, extractJSON, salvageArray,
    generateQuiz, generateDSA, generateVocab, generateEnglish,
    generateAptitude, generatePythonLesson, reviewCode
  };
})();
