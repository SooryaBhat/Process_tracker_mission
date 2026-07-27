// ============================================================
//  GEMINI API ENGINE v8
//  Root cause of truncation: long 'solution' fields in aptitude
//  and long 'explanation' in quiz cause MAX_TOKENS cut-off.
//
//  Fix strategy:
//  1. Detect truncation (MAX_TOKENS or Unterminated string error)
//  2. On truncation: retry with HALF the count + strict char limits
//  3. Never use 'reformat' retry for truncation (data is already JSON)
//  4. For aptitude: solution = 1 short sentence only
//  5. salvageArray as last resort for partial data
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
    const finishReason = (data && data.candidates && data.candidates[0] &&
                          data.candidates[0].finishReason) || 'STOP';
    const text = data && data.candidates && data.candidates[0] &&
                 data.candidates[0].content && data.candidates[0].content.parts &&
                 data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
    if (!text) {
      throw new Error('Empty response from Gemini (finishReason: ' + finishReason + ')');
    }
    console.log('[Gemini] raw (' + finishReason + '):', text.slice(0, 150));
    // attach finishReason so callWithRetry can detect truncation
    text._finishReason = finishReason;
    return { text: text, truncated: finishReason === 'MAX_TOKENS' };
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
    return null;
  }

  // ── detect truncation from parse error ───────────────────
  function isTruncationError(e) {
    var msg = e && e.message ? e.message.toLowerCase() : '';
    return msg.indexOf('unterminated') !== -1 ||
           msg.indexOf('unexpected end') !== -1 ||
           msg.indexOf('unexpected token') !== -1;
  }

  // ── salvage complete objects from cut-off array ───────────
  function salvageArray(str) {
    var results = [], depth = 0, inStr = false, prevSlash = false;
    var objStart = -1, arrStarted = false;
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
      if (ch === '{') { if (depth === 1) objStart = i; depth++; }
      else if (ch === '[') { depth++; }
      else if (ch === '}') {
        depth--;
        if (depth === 1 && objStart !== -1) {
          try { results.push(JSON.parse(str.slice(objStart, i + 1))); objStart = -1; } catch(e) {}
        }
      } else if (ch === ']') { depth--; }
    }
    return results;
  }

  // ── unwrap {key:[...]} ────────────────────────────────────
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

  // ── extract JSON from raw text ────────────────────────────
  function extractJSON(raw, expectArray) {
    if (!raw) return null;
    var wantArray = !!expectArray;
    var cleaned = raw
      .replace(/```json\s*([\s\S]*?)```/gi, function(_, g) { return g.trim(); })
      .replace(/```\s*([\s\S]*?)```/gi,     function(_, g) { return g.trim(); })
      .trim();

    // 1. direct parse
    try { return maybeUnwrap(JSON.parse(cleaned), wantArray); } catch(e) {
      if (wantArray && isTruncationError(e)) {
        // truncated — try to salvage whatever completed before cut-off
        var salvaged = salvageArray(cleaned);
        if (salvaged.length > 0) {
          console.warn('[Gemini] Salvaged', salvaged.length, 'items from truncated response');
          return salvaged;
        }
      }
    }

    // 2. bracket-depth walk
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
      slice = slice.replace(/,(\s*[}\]])/g, '$1');
      try {
        var parsed = JSON.parse(slice);
        var unwrapped = maybeUnwrap(parsed, wantArray);
        if (wantArray && !Array.isArray(unwrapped)) continue;
        if (!wantArray && (typeof unwrapped !== 'object' || Array.isArray(unwrapped))) continue;
        return unwrapped;
      } catch(e) {}
    }

    // 3. final salvage attempt for arrays
    if (wantArray) {
      var s = salvageArray(cleaned);
      if (s.length > 0) {
        console.warn('[Gemini] Last-resort salvage:', s.length, 'items');
        return s;
      }
    }

    console.error('[Gemini] extractJSON failed. Raw:\n', raw.slice(0, 300));
    return null;
  }

  // ── validate ──────────────────────────────────────────────
  function isValid(r, wantArray, minItems) {
    if (!r) return false;
    if (wantArray) return Array.isArray(r) && r.length >= minItems;
    return typeof r === 'object' && !Array.isArray(r) && Object.keys(r).length > 0;
  }

  // ── call with smart retry ─────────────────────────────────
  // Two retry strategies:
  //   - Truncation (MAX_TOKENS / Unterminated): retry with fewer items
  //   - Prose (model ignored JSON instruction): retry with reformat request
  async function callWithRetry(prompt, expectArray, minItems, label, retryPromptFn) {
    var wantArray = !!expectArray;

    // attempt 1
    var r1 = await callRaw(prompt);
    var result = extractJSON(r1.text, wantArray);
    if (isValid(result, wantArray, minItems)) {
      console.log('[Gemini]', label, 'OK (attempt 1):', wantArray ? result.length + ' items' : 'object');
      return result;
    }

    var isTrunc = r1.truncated ||
      (r1.text && (r1.text.indexOf('"Unterminated') !== -1 || !r1.text.includes(wantArray ? ']' : '}')));

    if (isTrunc && retryPromptFn) {
      // truncation: use caller-provided shorter prompt
      console.warn('[Gemini]', label, 'TRUNCATED — retrying with shorter prompt');
      var shortPrompt = retryPromptFn();
      var r2 = await callRaw(shortPrompt);
      result = extractJSON(r2.text, wantArray);
      if (isValid(result, wantArray, minItems)) {
        console.log('[Gemini]', label, 'OK (attempt 2, short):', wantArray ? result.length + ' items' : 'object');
        return result;
      }
    } else {
      // prose: ask Gemini to reformat its own response
      console.warn('[Gemini]', label, 'invalid JSON — retrying with reformat request');
      var reformatPrompt =
        'Convert the content below into a valid JSON ' + (wantArray ? 'array' : 'object') + '.\n' +
        'Output ONLY raw JSON. No text. No markdown. No code fences.\n' +
        (wantArray ? 'Start with [ and end with ].' : 'Start with { and end with }.') + '\n\n' +
        'Content:\n' + r1.text.slice(0, 2000);
      var r2b = await callRaw(reformatPrompt);
      result = extractJSON(r2b.text, wantArray);
      if (isValid(result, wantArray, minItems)) {
        console.log('[Gemini]', label, 'OK (attempt 2, reformat):', wantArray ? result.length + ' items' : 'object');
        return result;
      }
    }

    console.error('[Gemini]', label, 'FAILED both attempts');
    console.error('Attempt 1 raw:\n', r1.text.slice(0, 300));
    throw new Error(
      label + ' failed. ' +
      (isTrunc
        ? 'Response was too long and got cut off. Retried with shorter prompt — still failed. Try again.'
        : 'Open browser console (F12) to see the raw Gemini response.')
    );
  }

  // ── QUIZ (10 questions, concise fields) ───────────────────
  function quizPrompt(topics, diff, weak, count) {
    return 'You are a technical interview coach for AI/ML and Software Engineering internships in India.\n' +
      'Generate exactly ' + count + ' multiple-choice questions at ' + diff + ' difficulty.\n' +
      'Topics (mix well): ' + topics.join(', ') + '\n' +
      'Extra weight on weak areas: ' + weak + '\n\n' +
      'RULES — MUST FOLLOW:\n' +
      '- Output ONLY a raw JSON array. Nothing before [. Nothing after ]. No markdown.\n' +
      '- Keep explanation under 15 words. Keep interview_tip under 10 words.\n' +
      '- Each item: id(number), topic(string), question(string),\n' +
      '  options(array of 4 strings "A) ..." "B) ..." "C) ..." "D) ..."),\n' +
      '  correct(0-3), explanation(string MAX 15 words),\n' +
      '  wrong_explanations(array of 3 strings MAX 8 words each),\n' +
      '  interview_tip(string MAX 10 words), difficulty(string)';
  }

  async function generateQuiz(topics, difficulty, weakAreas, count) {
    count = count || 10;
    var diff = DIFF[difficulty] || 'Easy';
    var weak = Object.entries(weakAreas || {})
      .sort(function(a,b){ return b[1]-a[1]; })
      .slice(0,5).map(function(e){ return e[0]; }).join(', ') || 'none';
    var prompt = quizPrompt(topics, diff, weak, count);
    return await callWithRetry(
      prompt, true, Math.floor(count * 0.5), 'Quiz',
      function() { return quizPrompt(topics, diff, weak, Math.floor(count / 2)); }
    );
  }

  // ── DSA ───────────────────────────────────────────────────
  function dsaPrompt(topics, diff, recent, count) {
    return 'You are a DSA interview coach. Generate exactly ' + count + ' coding problems at ' + diff + ' difficulty.\n' +
      'Topics: ' + topics.join(', ') + '\n' +
      'Avoid recent topics: ' + recent + '\n\n' +
      'RULES — MUST FOLLOW:\n' +
      '- Output ONLY a raw JSON array. Nothing before [. Nothing after ]. No markdown.\n' +
      '- Keep all text fields short and concise.\n' +
      '- Each item: id(number), title(string), topic(string), difficulty(string),\n' +
      '  problem(string MAX 60 words), examples(array of {input,output,explanation}),\n' +
      '  constraints(array of strings), hint(string MAX 20 words),\n' +
      '  approach(string MAX 30 words), time_complexity(string), space_complexity(string), followup(string MAX 15 words)';
  }

  async function generateDSA(topics, difficulty, count) {
    count = count || 3;
    var diff = DIFF[difficulty] || 'Easy';
    var recent = Store.state.dsaAIHistory.slice(-10)
      .map(function(h){ return h.topic; }).join(', ') || 'none';
    var prompt = dsaPrompt(topics, diff, recent, count);
    return await callWithRetry(
      prompt, true, 1, 'DSA',
      function() { return dsaPrompt(topics, diff, recent, 1); }
    );
  }

  // ── VOCABULARY ────────────────────────────────────────────
  function vocabPrompt(recent, count) {
    return 'You are a vocabulary coach for an Indian CS student preparing for tech internships.\n' +
      'Generate exactly ' + count + ' words. Focus: Corporate English, AI/ML terms, startup language.\n' +
      'Avoid recently used words: ' + recent + '\n\n' +
      'RULES — MUST FOLLOW:\n' +
      '- Output ONLY a raw JSON array. Nothing before [. Nothing after ]. No markdown.\n' +
      '- Keep all text fields under 20 words each.\n' +
      '- Each item: word(string), pronunciation(string), meaning(string MAX 20 words),\n' +
      '  example(string MAX 15 words), professional_usage(string MAX 15 words),\n' +
      '  memory_trick(string MAX 15 words), category(string),\n' +
      '  quiz_question(string), quiz_options(4 strings), quiz_correct(0-3), quiz_explanation(string MAX 15 words)';
  }

  async function generateVocab(count) {
    count = count || 10;
    var recent = Store.state.vocabHistory.slice(-5)
      .reduce(function(acc,d){ return acc.concat((d.words||[]).map(function(w){ return w.word; })); }, [])
      .join(', ') || 'none';
    var prompt = vocabPrompt(recent, count);
    return await callWithRetry(
      prompt, true, 5, 'Vocabulary',
      function() { return vocabPrompt(recent, 5); }
    );
  }

  // ── ENGLISH ───────────────────────────────────────────────
  function englishPrompt(diff, recent) {
    return 'You are an English coach for Indian tech students preparing for internship interviews.\n' +
      'Generate one English lesson at ' + diff + ' difficulty.\n' +
      'Choose ONE topic from: professional sentence framing, grammar correction, corporate communication,\n' +
      'interview English, email writing, common Indian English mistakes, formal vs informal language.\n' +
      'Avoid recently covered: ' + recent + '\n\n' +
      'RULES — MUST FOLLOW:\n' +
      '- Output ONLY a raw JSON object. Nothing before {. Nothing after }. No markdown.\n' +
      '- Keep ALL text fields under 20 words.\n' +
      '- Keys: topic(string), difficulty(string), explanation(string MAX 40 words),\n' +
      '  good_examples(3 strings MAX 15 words each), bad_examples(2 strings MAX 15 words each),\n' +
      '  exercises(exactly 5 objects: type,instruction,question,options(4 strings),correct(0-3),explanation(MAX 20 words)),\n' +
      '  interview_phrases(3 strings MAX 12 words each), key_takeaway(string MAX 20 words)';
  }

  async function generateEnglish(difficulty) {
    var diff = DIFF[difficulty] || 'Easy';
    var recent = Store.state.englishHistory.slice(-5)
      .map(function(h){ return h.topic || ''; }).filter(Boolean).join(', ') || 'none';
    var prompt = englishPrompt(diff, recent);
    var result = await callWithRetry(
      prompt, false, 1, 'English',
      function() { return englishPrompt(diff, recent); }
    );
    if (!result.exercises || !result.exercises.length) throw new Error('English lesson missing exercises');
    return result;
  }

  // ── APTITUDE (5 questions, short solution field) ──────────
  // KEY FIX: aptitude solution field was the main cause of truncation.
  // Math working like "Let M = max marks. 0.6M - 30 = 0.45M + 15..." is very long.
  // Solution: ask for solution as ONE short sentence answer only.
  function aptPrompt(topics, diff, weak, count) {
    return 'You are an aptitude coach for Indian campus placements.\n' +
      'Generate exactly ' + count + ' aptitude questions at ' + diff + ' difficulty.\n' +
      'Topics: ' + topics.join(', ') + '\n' +
      'Extra weight on weak areas: ' + weak + '\n\n' +
      'RULES — MUST FOLLOW:\n' +
      '- Output ONLY a raw JSON array. Nothing before [. Nothing after ]. No markdown.\n' +
      '- solution field: ONE short sentence with the answer only. NO step-by-step working.\n' +
      '- shortcut field: ONE short trick sentence or empty string.\n' +
      '- Each item: id(number), topic(string), question(string),\n' +
      '  options(array of 4 strings "A) ..." "B) ..." "C) ..." "D) ..."),\n' +
      '  correct(0-3), solution(string MAX 15 words), shortcut(string MAX 10 words), difficulty(string)';
  }

  async function generateAptitude(topics, difficulty, weakAreas, count) {
    count = count || 8;
    var diff = DIFF[difficulty] || 'Easy';
    var weak = Object.entries(weakAreas || {})
      .sort(function(a,b){ return b[1]-a[1]; })
      .slice(0,3).map(function(e){ return e[0]; }).join(', ') || 'none';
    var prompt = aptPrompt(topics, diff, weak, count);
    return await callWithRetry(
      prompt, true, Math.floor(count * 0.5), 'Aptitude',
      function() { return aptPrompt(topics, diff, weak, 5); }
    );
  }

  // ── PYTHON LESSON ─────────────────────────────────────────
  function pythonPrompt(topic, day) {
    return 'You are a Python tutor for an Indian CS student preparing for AI/ML internships.\n' +
      'Generate a Python lesson for Day ' + day + ' on: ' + topic + '\n\n' +
      'RULES — MUST FOLLOW:\n' +
      '- Output ONLY a raw JSON object. Nothing before {. Nothing after }. No markdown.\n' +
      '- Keep ALL text fields concise. Code example max 15 lines.\n' +
      '- Keys: topic(string), day(number), concept(string MAX 50 words),\n' +
      '  key_points(array of 4-5 strings MAX 12 words each),\n' +
      '  code_example(string — working Python code with comments MAX 15 lines),\n' +
      '  common_mistakes(array of 2-3 strings MAX 12 words each),\n' +
      '  coding_question(object: title, description(MAX 40 words), examples(array of {input,output}), hint(MAX 15 words)),\n' +
      '  mcq(array of exactly 5 objects: question, options(4 strings), correct(0-3), explanation(MAX 15 words))';
  }

  async function generatePythonLesson(topic, day) {
    var prompt = pythonPrompt(topic, day);
    var result = await callWithRetry(
      prompt, false, 1, 'Python Lesson',
      function() { return pythonPrompt(topic, day); }
    );
    if (!result.concept || !result.mcq || !result.coding_question) {
      throw new Error('Python lesson missing required fields');
    }
    return result;
  }

  // ── CODE REVIEW ───────────────────────────────────────────
  async function reviewCode(problem, userCode, language) {
    language = language || 'Python';
    var prompt =
      'Review this ' + language + ' solution for a tech internship coding problem.\n' +
      'Problem: ' + problem.slice(0, 300) + '\n' +
      'Code:\n' + userCode.slice(0, 800) + '\n\n' +
      'RULES — MUST FOLLOW:\n' +
      '- Output ONLY a raw JSON object. Nothing before {. Nothing after }. No markdown.\n' +
      '- Keep ALL text fields under 20 words.\n' +
      '- Keys: is_correct(boolean), correctness_note(string MAX 20 words),\n' +
      '  bugs(array of strings MAX 10 words each, empty array if none),\n' +
      '  time_complexity(string), space_complexity(string),\n' +
      '  quality_score(1-10), quality_note(string MAX 15 words),\n' +
      '  improvements(array of max 3 strings MAX 15 words each),\n' +
      '  optimal_approach(string MAX 25 words), optimal_code(string),\n' +
      '  good_things(array of max 2 strings MAX 10 words each),\n' +
      '  interview_verdict(string MAX 20 words)';
    return await callWithRetry(prompt, false, 1, 'Code Review', null);
  }

  return {
    hasKey, callRaw, extractJSON, salvageArray,
    generateQuiz, generateDSA, generateVocab, generateEnglish,
    generateAptitude, generatePythonLesson, reviewCode
  };
})();
