# 🎯 Internship Mission 2026 — AI Preparation Platform

> Personal AI-powered internship preparation platform for AI/ML Engineer, Data Scientist, Backend Developer, and Software Engineer roles.

**Built by Soorya Bhat** · June 24, 2026 → Until Offer

---

## 🚀 Deploy in 2 Minutes

### Option 1 — GitHub Pages

```bash
git init
git add .
git commit -m "🎯 Mission 2026 v2 — AI Platform"
git remote add origin https://github.com/SooryaBhat/internship-mission-2026.git
git push -u origin main
# Settings → Pages → Source: main / root → Save
# Live at: https://SooryaBhat.github.io/internship-mission-2026
```

### Option 2 — Vercel (Recommended for env vars)

```bash
npm i -g vercel
vercel
# In Vercel dashboard → Project Settings → Environment Variables:
# Add: VITE_GEMINI_API_KEY = your_key_here
# In Vercel dashboard → Build & Development Settings:
# Build Command: echo "window.GEMINI_API_KEY='$VITE_GEMINI_API_KEY';" > env-config.js
# Output Directory: . (root)
```

### Option 3 — Netlify Drop

1. Go to [app.netlify.com/drop](https://app.netlify.com/drop)
2. Drag and drop this entire folder
3. Set env var in Site Settings → Environment Variables

---

## 🔑 Adding Your Gemini API Key

### For Local Development
Open `env-config.js` in the root and set:
```javascript
window.GEMINI_API_KEY = 'your-gemini-api-key-here';
```

### For Vercel
1. Go to Project Settings → Environment Variables
2. Add: `VITE_GEMINI_API_KEY` = your key
3. Set Build Command to:
   ```
   echo "window.GEMINI_API_KEY='$VITE_GEMINI_API_KEY';" > env-config.js
   ```

### Get a Free API Key
Visit [aistudio.google.com](https://aistudio.google.com) → Get API Key (free tier available)

---

## ✨ Features

### 🎛 Dashboard
- Mission Control HUD (day, streak, DSA, apps, XP level)
- Today's Mission checklist with live completion
- Daily Scorecard (6 activities)
- Stats overview + weekly bar chart
- Progress overview across all tracks

### 📋 Phase 1 — Foundation (June 24 – July 4)
- AI/ML Prime Course (7 topics)
- CS Fundamentals (5 subjects)
- DSA progress toward July 4 target
- Daily communication checkboxes

### 🎯 Phase 2 — Internship Prep (July 5+)
- DSA topic-wise tracker with +/− counters
- Interview prep, project explanations, aptitude, networking

### 🤖 Technical Quiz (AI)
- 25 MCQs daily using Gemini AI
- Adaptive difficulty (Easy → Medium → Hard based on score)
- Spaced repetition on weak topics
- Full explanations + interview tips after each answer
- Score tracking + weak area heatmap

### 💻 DSA Practice (AI)
- 2–5 problems daily, adaptive difficulty
- Problem statement, examples, constraints
- Hint & Approach reveal
- Paste your code → Gemini reviews correctness, complexity, improvements
- Optimal solution shown

### 📚 Vocabulary Builder (AI)
- 10 new words daily (Corporate/AI/Tech English)
- Pronunciation, meaning, example, memory trick
- Mini quiz after learning
- Streak tracking

### 🗣 English Improvement (AI)
- Daily lessons: grammar, corporate communication, interview English
- 5 exercises per lesson (correct sentence, better wording, fill blank, rewrite)
- Full explanations for every answer
- Adaptive difficulty

### 🧮 Aptitude Practice (AI)
- 17 questions daily (Quant, Logical, Coding Aptitude)
- Shortcuts and step-by-step solutions
- Weak area tracking
- Campus placement style questions

### 📬 Applications
- Full pipeline tracker: Applied → OA → HR → Technical → Final → Selected 🎉
- Filter by status, live stats

### 🧠 AI Finance Project
- 8 phase cards with completion tracking
- Milestone tracker with dates
- Research notes

### ⭐ XP & Level System
- 16 levels (Rookie → God Mode)
- XP for every activity
- Visual level bar + XP toasts
- Best streak tracking

---

## 📁 Project Structure

```
internship-mission-2026/
├── index.html              # Main HTML (all pages)
├── env-config.js           # API key injection (gitignored in production)
├── .env.example            # Template for env vars
├── css/
│   └── style.css           # Full dark theme (~2100 lines)
├── js/
│   ├── data.js             # All data definitions
│   ├── config.js           # API config
│   ├── store.js            # localStorage persistence
│   ├── gemini.js           # Gemini API engine
│   ├── ui.js               # Shared UI helpers
│   ├── app.js              # Main controller
│   └── pages/
│       ├── quiz.js         # Technical Quiz page
│       ├── dsaai.js        # DSA AI page
│       ├── vocab.js        # Vocabulary page
│       ├── english.js      # English page
│       └── aptitude.js     # Aptitude page
└── README.md
```

**No build step. No npm install. No framework. Pure HTML + CSS + JS.**

---

## 💾 Data Backup

All data is in `localStorage`. To back up:
```javascript
// In browser console:
copy(JSON.stringify(
  Object.fromEntries(
    Object.keys(localStorage)
      .filter(k => k.startsWith('im26_'))
      .map(k => [k, JSON.parse(localStorage.getItem(k))])
  )
));
// Paste into a .json file and save
```

To restore:
```javascript
const backup = { /* paste backup */ };
Object.entries(backup).forEach(([k,v]) => localStorage.setItem(k, JSON.stringify(v)));
location.reload();
```

---

## ⚙️ Adaptive Difficulty System

The app tracks your last 5 session scores per activity:
- Average ≥ 80% → Difficulty increases
- Average < 50% → Difficulty decreases
- Otherwise → Stays the same

This applies to: Technical Quiz, DSA Practice, English Lessons, Aptitude.

---

## 🎯 XP Rewards

| Activity | XP |
|---|---|
| Technical Quiz | Up to +60 XP (scales with score) |
| DSA Problem Solved | +50 XP |
| Vocabulary | +15 XP |
| English Lesson | +15 XP |
| Aptitude | Up to +40 XP |
| Application Sent | +20 XP |
| Project Phase | +25 XP |

---

*Go get that internship, Soorya. You've got this. 🚀*
