// ============================================================
//  GEMINI API ENGINE
// ============================================================
const Gemini = (() => {
  const DIFF_LABEL = ['','Easy','Medium','Hard'];

  function getKey() {
    return Config.geminiKey || '';
  }

  function hasKey() {
    return !!getKey();
  }

  async function call(prompt, systemPrompt = '') {
    const key = getKey();
    if (!key) throw new Error('NO_KEY');
    const url = `${Config.geminiEndpoint}${Config.geminiModel}:generateContent?key=${key}`;
    const body = {
      contents: [{ role:'user', parts:[{ text: prompt }] }],
      ...(systemPrompt ? { systemInstruction:{ parts:[{ text: systemPrompt }] } } : {}),
      generationConfig: { temperature: 0.8, maxOutputTokens: 4096 }
    };
    const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || 'API Error'); }
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  function parseJSON(text) {
    try {
      const match = text.match(/```json\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
      return JSON.parse(match ? match[1] : text);
    } catch { return null; }
  }

  // ---- QUIZ ----
  async function generateQuiz(topics, difficulty, weakAreas, count = 25) {
    const diffLabel = DIFF_LABEL[difficulty];
    const topicsStr = topics.join(', ');
    const weakStr = Object.entries(weakAreas).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([t])=>t).join(', ') || 'none yet';
    const prompt = `You are a technical interview coach for AI/ML, Data Science, and Software Engineering roles in Indian tech companies.

Generate exactly ${count} multiple-choice questions at ${diffLabel} difficulty.

Topics pool: ${topicsStr}
Weak areas (prioritize these): ${weakStr}

RULES:
- Mix topics, weight weak areas 40% more
- ${diffLabel === 'Easy' ? 'Basic concepts, definitions, simple usage' : diffLabel === 'Medium' ? 'Applied concepts, tricky edge cases, comparison questions' : 'Complex scenarios, optimization, deep internals, interview-hard problems'}
- No repeated questions from common patterns
- Today's date context: ${new Date().toDateString()}

Return ONLY a JSON array, no markdown prose:
[
  {
    "id": 1,
    "topic": "Python",
    "question": "Question text here?",
    "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
    "correct": 0,
    "explanation": "Why A is correct: detailed explanation",
    "wrong_explanations": ["Why B is wrong", "Why C is wrong", "Why D is wrong"],
    "interview_tip": "In interviews, remember to...",
    "difficulty": "${diffLabel}"
  }
]`;
    const text = await call(prompt);
    return parseJSON(text);
  }

  // ---- DSA PROBLEMS ----
  async function generateDSA(topics, difficulty, count = 3) {
    const diffLabel = DIFF_LABEL[difficulty];
    const topicsStr = topics.join(', ');
    const recentHistory = Store.state.dsaAIHistory.slice(-10).map(h=>h.topic).join(', ') || 'none';
    const prompt = `You are a DSA interview coach for top tech companies (Google, Amazon, Flipkart, etc).

Generate exactly ${count} DSA problems at ${diffLabel} difficulty.

Topics to pick from: ${topicsStr}
Recently covered (avoid repeating): ${recentHistory}

Return ONLY a JSON array:
[
  {
    "id": 1,
    "title": "Problem Title",
    "topic": "Arrays",
    "difficulty": "${diffLabel}",
    "problem": "Full problem statement with context...",
    "examples": [
      {"input": "nums = [2,7,11,15], target = 9", "output": "0, 1", "explanation": "nums[0]+nums[1]=9"}
    ],
    "constraints": ["1 <= nums.length <= 10^4", "All integers are unique"],
    "hint": "Think about using a hash map to store...",
    "approach": "Use a hash map. For each element, check if target-element exists in map. TC: O(n), SC: O(n)",
    "time_complexity": "O(n)",
    "space_complexity": "O(n)",
    "followup": "What if the array is sorted?"
  }
]`;
    const text = await call(prompt);
    return parseJSON(text);
  }

  // ---- VOCABULARY ----
  async function generateVocab(count = 10) {
    const recentWords = Store.state.vocabHistory.slice(-5).flatMap(d=>d.words?.map(w=>w.word)||[]).join(', ') || 'none';
    const prompt = `You are an English vocabulary coach for tech professionals in India.

Generate exactly ${count} vocabulary words for a computer science student preparing for tech internships.

Focus: Corporate English, Business English, Startup terminology, Product Engineering, AI terminology, Software Engineering.

Avoid recently used: ${recentWords}

Return ONLY a JSON array:
[
  {
    "word": "Iterate",
    "pronunciation": "IT-uh-rayt",
    "meaning": "To repeat a process, typically to refine or improve a product or solution",
    "example": "The team decided to iterate on the prototype based on user feedback.",
    "professional_usage": "Used in meetings: 'We need to iterate quickly on this feature before the sprint ends.'",
    "memory_trick": "Iterate = 'I'll do it again, and again, and again' — like a loop in code",
    "category": "Product Engineering",
    "quiz_question": "Which sentence uses 'iterate' correctly?",
    "quiz_options": ["A) We need to iterate the database.", "B) Let's iterate on this design until users love it.", "C) The iterate was successful.", "D) He iterated the room."],
    "quiz_correct": 1,
    "quiz_explanation": "B is correct — iterate means to refine through repetition."
  }
]`;
    const text = await call(prompt);
    return parseJSON(text);
  }

  // ---- ENGLISH LESSON ----
  async function generateEnglish(difficulty) {
    const diffLabel = DIFF_LABEL[difficulty];
    const recentTopics = Store.state.englishHistory.slice(-5).map(h=>h.topic||'').join(', ') || 'none';
    const prompt = `You are a professional English communication coach for Indian tech students preparing for internship interviews.

Generate a complete daily English lesson at ${diffLabel} difficulty.

Avoid recently covered topics: ${recentTopics}

The lesson should cover ONE of these areas (pick based on what's most useful at ${diffLabel} level):
- Professional sentence framing
- Grammar correction
- Corporate communication
- Interview English
- Email wording
- Common mistakes Indians make in English
- Formal vs informal language

Return ONLY a JSON object:
{
  "topic": "Lesson Topic Name",
  "difficulty": "${diffLabel}",
  "explanation": "Clear explanation of the concept (3-4 sentences, practical)",
  "good_examples": ["Example of correct usage 1", "Example of correct usage 2", "Example of correct usage 3"],
  "bad_examples": ["Incorrect version 1", "Incorrect version 2"],
  "exercises": [
    {
      "type": "correct_sentence",
      "instruction": "Correct this sentence:",
      "question": "I am having 5 years of experience.",
      "options": ["A) I am having 5 years of experience.", "B) I have 5 years of experience.", "C) I had 5 years of experience.", "D) I was having 5 years of experience."],
      "correct": 1,
      "explanation": "In English, 'have' (not 'am having') is used for facts/states. Experience is a fact, not an ongoing action."
    },
    {
      "type": "better_wording",
      "instruction": "Choose the more professional version:",
      "question": "How do you say this in a professional email?",
      "options": ["A) Please do the needful.", "B) Please take the necessary action.", "C) Kindly do the needful at the earliest.", "D) Do it."],
      "correct": 1,
      "explanation": "'Please take the necessary action' is globally understood. 'Do the needful' is an Indian-English phrase not standard globally."
    },
    {
      "type": "fill_blank",
      "instruction": "Fill in the blank:",
      "question": "I look forward to ___ from you.",
      "options": ["A) hearing", "B) hear", "C) heard", "D) have heard"],
      "correct": 0,
      "explanation": "'Look forward to' is followed by a gerund (-ing form). So 'hearing' is correct."
    },
    {
      "type": "rewrite",
      "instruction": "Rewrite this professionally:",
      "question": "My bad, I forgot to send the report.",
      "options": ["A) Oops, I forgot.", "B) I apologize for the delay in sending the report. I will share it immediately.", "C) Sorry, my mistake.", "D) My bad for the report."],
      "correct": 1,
      "explanation": "Professional communication requires a formal apology + immediate action statement."
    },
    {
      "type": "correct_sentence",
      "instruction": "Which is grammatically correct?",
      "question": "Choose the correct sentence:",
      "options": ["A) I can able to complete this task.", "B) I am able to complete this task.", "C) I am able complete this task.", "D) I can to complete this task."],
      "correct": 1,
      "explanation": "'I am able to' or 'I can' — never combine 'can' with 'able to'."
    }
  ],
  "interview_phrases": ["Phrase 1 with context", "Phrase 2 with context", "Phrase 3 with context"],
  "key_takeaway": "One sentence summary of what to remember"
}`;
    const text = await call(prompt);
    return parseJSON(text);
  }

  // ---- APTITUDE ----
  async function generateAptitude(topics, difficulty, weakAreas, count = 17) {
    const diffLabel = DIFF_LABEL[difficulty];
    const weakStr = Object.entries(weakAreas).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([t])=>t).join(', ') || 'none';
    const prompt = `You are an aptitude coach for Indian tech campus placements and internship tests (TCS, Infosys, Wipro, Paytm, Swiggy-style tests).

Generate exactly ${count} aptitude questions at ${diffLabel} difficulty.

Topics: ${topics.join(', ')}
Weak areas (prioritize): ${weakStr}

For ${diffLabel}: ${difficulty===1?'Simple direct calculations, easy ratios':'difficulty===2?Medium calculations, 2-step problems':'Complex multi-step problems, time pressure scenarios'}

Return ONLY a JSON array:
[
  {
    "id": 1,
    "topic": "Percentage",
    "question": "A shirt costs ₹800. After a 25% discount, what is the final price?",
    "options": ["A) ₹600", "B) ₹650", "C) ₹700", "D) ₹750"],
    "correct": 0,
    "solution": "Discount = 25% of 800 = 200. Final price = 800 - 200 = ₹600.",
    "shortcut": "Remaining% method: 100% - 25% = 75%. 75% of 800 = 600. Much faster!",
    "difficulty": "${diffLabel}"
  }
]`;
    const text = await call(prompt);
    return parseJSON(text);
  }

  // ---- CODE REVIEW ----
  async function reviewCode(problem, userCode, language = 'Python') {
    const prompt = `You are a senior software engineer reviewing code for a student preparing for tech internships.

Problem Statement:
${problem}

Student's ${language} Code:
\`\`\`${language.toLowerCase()}
${userCode}
\`\`\`

Provide a thorough code review. Return ONLY a JSON object:
{
  "is_correct": true/false,
  "correctness_note": "Brief note on whether the logic is correct",
  "bugs": ["Bug 1 if any", "Bug 2 if any"],
  "time_complexity": "O(...) — explanation",
  "space_complexity": "O(...) — explanation",
  "quality_score": 7,
  "quality_note": "Overall code quality assessment",
  "improvements": ["Specific improvement 1", "Specific improvement 2", "Specific improvement 3"],
  "optimal_approach": "Describe the optimal approach if different from student's approach",
  "optimal_code": "# Optimal solution code here\ndef solution():\n    pass",
  "good_things": ["What student did well 1", "What student did well 2"],
  "interview_verdict": "Would this pass a coding interview? Why/why not?"
}`;
    const text = await call(prompt);
    return parseJSON(text);
  }

  return { hasKey, call, parseJSON, generateQuiz, generateDSA, generateVocab, generateEnglish, generateAptitude, reviewCode };
})();
