// ============================================================
//  GEMINI API ENGINE v2 — safe, never throws on load
// ============================================================
const Gemini = (() => {
  const DIFF_LABEL = ['', 'Easy', 'Medium', 'Hard'];

  function getKey() {
    try { return Config.geminiKey || ''; } catch(e) { return ''; }
  }

  function hasKey() { return !!getKey(); }

  async function call(prompt, systemPrompt) {
    const key = getKey();
    if (!key) throw new Error('NO_KEY');
    const url = Config.geminiEndpoint + Config.geminiModel + ':generateContent?key=' + key;
    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 4096, responseMimeType: "application/json" }
    };
    if (systemPrompt) {
      body.systemInstruction = { parts: [{ text: systemPrompt }] };
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error ? e.error.message : 'API Error ' + res.status);
    }
    const data = await res.json();
    const text = data.candidates && data.candidates[0] &&
                 data.candidates[0].content && data.candidates[0].content.parts &&
                 data.candidates[0].content.parts[0] &&
                 data.candidates[0].content.parts[0].text;
    return text || '';
  }

  function parseJSON(text) {
    if (!text) return null;
    try {
      // Strip markdown code fences if present
      const clean = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
      return JSON.parse(clean);
    } catch(e1) {
      // Try to extract first JSON array or object
      try {
        const arrMatch = text.match(/\[[\s\S]*\]/);
        if (arrMatch) return JSON.parse(arrMatch[0]);
        const objMatch = text.match(/\{[\s\S]*\}/);
        if (objMatch) return JSON.parse(objMatch[0]);
      } catch(e2) {}
      return null;
    }
  }

  async function generateQuiz(topics, difficulty, weakAreas, count) {
    count = count || 25;
    const diffLabel = DIFF_LABEL[difficulty] || 'Easy';
    const topicsStr = topics.join(', ');
    const weakEntries = Object.entries(weakAreas || {}).sort(function(a,b){return b[1]-a[1];}).slice(0,5);
    const weakStr = weakEntries.length ? weakEntries.map(function(e){return e[0];}).join(', ') : 'none yet';
    const prompt = 'You are a technical interview coach for AI/ML, Data Science, and Software Engineering roles.\n\n' +
      'Generate exactly ' + count + ' multiple-choice questions at ' + diffLabel + ' difficulty.\n\n' +
      'Topics pool: ' + topicsStr + '\n' +
      'Weak areas to prioritize (40% more weight): ' + weakStr + '\n\n' +
      'Return ONLY a JSON array, no markdown, no extra text:\n' +
      '[{"id":1,"topic":"Python","question":"Question?","options":["A) opt1","B) opt2","C) opt3","D) opt4"],' +
      '"correct":0,"explanation":"Why A is correct","wrong_explanations":["Why B","Why C","Why D"],' +
      '"interview_tip":"Tip here","difficulty":"' + diffLabel + '"}]';
    const text = await call(prompt);
    return parseJSON(text);
  }

  async function generateDSA(topics, difficulty, count) {
    count = count || 3;
    const diffLabel = DIFF_LABEL[difficulty] || 'Easy';
    const topicsStr = topics.join(', ');
    const recentHistory = Store.state.dsaAIHistory.slice(-10).map(function(h){return h.topic;}).join(', ') || 'none';
    const prompt = 'You are a DSA interview coach for top tech companies.\n\n' +
      'Generate exactly ' + count + ' DSA problems at ' + diffLabel + ' difficulty.\n' +
      'Topics: ' + topicsStr + '\n' +
      'Recently covered (avoid): ' + recentHistory + '\n\n' +
      'Return ONLY a JSON array:\n' +
      '[{"id":1,"title":"Two Sum","topic":"Arrays","difficulty":"' + diffLabel + '",' +
      '"problem":"Full problem statement","examples":[{"input":"nums=[2,7]","output":"0,1","explanation":"note"}],' +
      '"constraints":["1<=n<=10^4"],"hint":"Use hash map",' +
      '"approach":"Hash map approach. TC: O(n)","time_complexity":"O(n)","space_complexity":"O(n)","followup":"What if sorted?"}]';
    const text = await call(prompt);
    return parseJSON(text);
  }

  async function generateVocab(count) {
    count = count || 10;
    const recentWords = Store.state.vocabHistory.slice(-5)
      .reduce(function(acc, d) { return acc.concat((d.words || []).map(function(w){return w.word;})); }, [])
      .join(', ') || 'none';
    const prompt = 'You are an English vocabulary coach for tech professionals.\n\n' +
      'Generate exactly ' + count + ' vocabulary words for a CS student preparing for tech internships.\n' +
      'Focus: Corporate English, Business English, AI terminology, Software Engineering terminology.\n' +
      'Avoid recently used: ' + recentWords + '\n\n' +
      'Return ONLY a JSON array:\n' +
      '[{"word":"Iterate","pronunciation":"IT-uh-rayt","meaning":"To repeat a process to refine or improve",' +
      '"example":"The team iterated on the prototype.","professional_usage":"We need to iterate quickly on this feature.",' +
      '"memory_trick":"Like a loop in code - do it again and again","category":"Product Engineering",' +
      '"quiz_question":"Which sentence uses iterate correctly?",' +
      '"quiz_options":["A) We iterate the database.","B) Lets iterate on this design.","C) The iterate was done.","D) He iterated the room."],' +
      '"quiz_correct":1,"quiz_explanation":"B is correct - iterate means to refine through repetition."}]';
    const text = await call(prompt);
    return parseJSON(text);
  }

  async function generateEnglish(difficulty) {
    const diffLabel = DIFF_LABEL[difficulty] || 'Easy';
    const recentTopics = Store.state.englishHistory.slice(-5).map(function(h){return h.topic||'';}).join(', ') || 'none';
    const prompt = 'You are an English communication coach for Indian tech students preparing for internship interviews.\n\n' +
      'Generate a daily English lesson at ' + diffLabel + ' difficulty.\n' +
      'Avoid recently covered topics: ' + recentTopics + '\n\n' +
      'Return ONLY a JSON object (no markdown):\n' +
      '{"topic":"Lesson Topic","difficulty":"' + diffLabel + '",' +
      '"explanation":"Clear explanation 3-4 sentences",' +
      '"good_examples":["Example 1","Example 2","Example 3"],' +
      '"bad_examples":["Mistake 1","Mistake 2"],' +
      '"exercises":[' +
      '{"type":"correct_sentence","instruction":"Correct this sentence:","question":"I am having 5 years of experience.",' +
      '"options":["A) I am having 5 years.","B) I have 5 years of experience.","C) I had 5 years.","D) I was having 5 years."],' +
      '"correct":1,"explanation":"Have not am having for facts"},' +
      '{"type":"better_wording","instruction":"Choose professional version:","question":"How to say this professionally?",' +
      '"options":["A) Please do the needful.","B) Please take the necessary action.","C) Kindly do needful.","D) Do it."],' +
      '"correct":1,"explanation":"Please take necessary action is globally understood"},' +
      '{"type":"fill_blank","instruction":"Fill in the blank:","question":"I look forward to ___ from you.",' +
      '"options":["A) hearing","B) hear","C) heard","D) have heard"],' +
      '"correct":0,"explanation":"Look forward to needs gerund -ing form"},' +
      '{"type":"rewrite","instruction":"Rewrite professionally:","question":"My bad, I forgot to send the report.",' +
      '"options":["A) Oops I forgot.","B) I apologize for the delay. I will share it immediately.","C) Sorry my mistake.","D) My bad for the report."],' +
      '"correct":1,"explanation":"Professional apology plus immediate action"},' +
      '{"type":"correct_sentence","instruction":"Which is correct?","question":"Choose grammatically correct sentence:",' +
      '"options":["A) I can able to do this.","B) I am able to do this.","C) I am able do this.","D) I can to do this."],' +
      '"correct":1,"explanation":"Never combine can with able to"}' +
      '],' +
      '"interview_phrases":["Phrase 1 with context","Phrase 2","Phrase 3"],' +
      '"key_takeaway":"One sentence summary"}';
    const text = await call(prompt);
    return parseJSON(text);
  }

  async function generateAptitude(topics, difficulty, weakAreas, count) {
    count = count || 17;
    const diffLabel = DIFF_LABEL[difficulty] || 'Easy';
    const weakEntries = Object.entries(weakAreas || {}).sort(function(a,b){return b[1]-a[1];}).slice(0,3);
    const weakStr = weakEntries.length ? weakEntries.map(function(e){return e[0];}).join(', ') : 'none';
    const prompt = 'You are an aptitude coach for Indian tech campus placements.\n\n' +
      'Generate exactly ' + count + ' aptitude questions at ' + diffLabel + ' difficulty.\n' +
      'Topics: ' + topics.join(', ') + '\n' +
      'Weak areas to prioritize: ' + weakStr + '\n\n' +
      'Return ONLY a JSON array:\n' +
      '[{"id":1,"topic":"Percentage","question":"A shirt costs 800. After 25% discount, final price?",' +
      '"options":["A) 600","B) 650","C) 700","D) 750"],' +
      '"correct":0,"solution":"Discount=25% of 800=200. Final=800-200=600.",' +
      '"shortcut":"75% of 800 = 600 directly","difficulty":"' + diffLabel + '"}]';
    const text = await call(prompt);
    return parseJSON(text);
  }

  async function reviewCode(problem, userCode, language) {
    language = language || 'Python';
    const prompt = 'You are a senior software engineer reviewing code for a student preparing for tech internships.\n\n' +
      'Problem:\n' + problem + '\n\n' +
      'Student code (' + language + '):\n' + userCode + '\n\n' +
      'Return ONLY a JSON object:\n' +
      '{"is_correct":true,"correctness_note":"Logic assessment",' +
      '"bugs":["bug1 if any"],' +
      '"time_complexity":"O(n) - explanation","space_complexity":"O(n) - explanation",' +
      '"quality_score":7,"quality_note":"Overall assessment",' +
      '"improvements":["improvement1","improvement2"],' +
      '"optimal_approach":"Describe optimal approach",' +
      '"optimal_code":"# optimal code here",' +
      '"good_things":["good point 1","good point 2"],' +
      '"interview_verdict":"Would this pass a coding interview? Why?"}';
    const text = await call(prompt);
    return parseJSON(text);
  }

  return {
    hasKey: hasKey,
    call: call,
    parseJSON: parseJSON,
    generateQuiz: generateQuiz,
    generateDSA: generateDSA,
    generateVocab: generateVocab,
    generateEnglish: generateEnglish,
    generateAptitude: generateAptitude,
    reviewCode: reviewCode
  };
})();
