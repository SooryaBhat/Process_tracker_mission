// ============================================================
//  DATA DEFINITIONS v2
// ============================================================
const DATA = {
  aiml: ['Python Revision','SQL Revision','Statistics Revision','Machine Learning Revision','Deep Learning Revision','Pandas Revision','Scikit-Learn Revision'],
  cs:   ['DBMS','OOP','Operating Systems','Computer Networks','System Design Basics'],
  comm: ['Daily English Speaking Practice','Daily Audio Recording Practice'],
  interview:   ['HR Questions Practice','Technical Questions Practice','Mock Interview Session'],
  projExplain: ['AttendIQ — Explanation Ready','PG Management Platform — Explanation Ready','Financial Intelligence System — Explanation Ready'],
  aptitude:    ['Quantitative Aptitude Practice','Logical Reasoning Practice'],
  networking:  ['LinkedIn Connections Sent','Referral Requests Sent','Mentorship Requests Sent'],

  dsaTopics: ['Arrays','Strings','Hashing','Linked Lists','Stack','Queue','Trees','BST','Heap','Graph','Sliding Window','Two Pointer','Binary Search','Recursion','Dynamic Programming'],

  projPhases: [
    {id:'research',   label:'Research',           icon:'ti-search'},
    {id:'dataset',    label:'Dataset Collection', icon:'ti-database'},
    {id:'cleaning',   label:'Data Cleaning',      icon:'ti-filter'},
    {id:'model',      label:'Model Building',     icon:'ti-brain'},
    {id:'dashboard',  label:'Dashboard Dev',      icon:'ti-layout-dashboard'},
    {id:'deployment', label:'Deployment',         icon:'ti-rocket'},
    {id:'testing',    label:'Testing',            icon:'ti-test-pipe'},
    {id:'docs',       label:'Documentation',      icon:'ti-file-text'}
  ],

  scoreItems: [
    {id:'aiml',      label:'AI/ML Study',    icon:'ti ti-school'},
    {id:'dsa',       label:'DSA',            icon:'ti ti-code'},
    {id:'apps',      label:'Applications',   icon:'ti ti-briefcase'},
    {id:'comm',      label:'Communication',  icon:'ti ti-microphone'},
    {id:'interview', label:'Interview Prep', icon:'ti ti-message-circle'},
    {id:'project',   label:'Major Project',  icon:'ti ti-brain'}
  ],

  statusLabels: {applied:'Applied',oa:'OA Received',hr:'HR Round',tech:'Technical',final:'Final Round',rejected:'Rejected',selected:'Selected 🎉'},

  quizTopics: ['Python','SQL','DBMS','OOP','Operating Systems','Computer Networks','Machine Learning','Deep Learning','Statistics','Pandas','NumPy','Scikit-Learn','FastAPI','APIs','Backend Development','Git & GitHub','System Design Basics'],

  dsaAITopics: ['Arrays','Strings','Hashing','Linked Lists','Stack','Queue','Trees','BST','Heap','Graph','Sliding Window','Two Pointer','Binary Search','Recursion','Dynamic Programming'],

  aptitudeTopics: ['Percentage','Ratio & Proportion','Profit & Loss','Time & Work','Time & Distance','Probability','Permutation & Combination','Logical Reasoning','Coding Aptitude','Pattern Recognition'],

  xpRewards: {
    quiz: 30, dsa_ai: 50, vocab: 15, english: 15,
    aptitude: 20, application: 20, project: 25, streak_bonus: 10
  },

  levelNames: ['','Rookie','Learner','Explorer','Thinker','Solver','Coder','Developer','Engineer','Architect','Expert','Master','Champion','Legend','Prodigy','Ace','God Mode'],
};

const START_DATE = new Date('2026-06-24');
