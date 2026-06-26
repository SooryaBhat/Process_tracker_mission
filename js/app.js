// ============================================================
//  APP — main controller v2
// ============================================================
const App = (() => {
  function qs(s,p=document){return p.querySelector(s);}
  function qsa(s,p=document){return [...p.querySelectorAll(s)];}
  function el(id){return document.getElementById(id);}
  function todayISO(){return new Date().toISOString().slice(0,10);}
  function key(label){return label.replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_]/g,'');}

  let currentPage = 'dashboard';

  // ---- Navigation ----
  function showPage(name) {
    currentPage = name;
    qsa('.page').forEach(p=>p.classList.remove('active'));
    qsa('.nav-btn[data-page]').forEach(b=>b.classList.remove('active'));
    const page = el('page-'+name);
    if (page) page.classList.add('active');
    const btn = qs(`.nav-btn[data-page="${name}"]`);
    if (btn) btn.classList.add('active');
    closeSidebar();
    refreshPage(name);
  }

  function refreshPage(name) {
    switch(name) {
      case 'dashboard':    renderDashboard();    break;
      case 'phase1':       renderPhase1();       break;
      case 'phase2':       renderPhase2();       break;
      case 'applications': renderApplications(); break;
      case 'project':      renderProject();      break;
      case 'quiz':         QuizPage.render();    break;
      case 'dsa-ai':       DSAPage.render();     break;
      case 'vocab':        VocabPage.render();   break;
      case 'english':      EnglishPage.render(); break;
      case 'aptitude':     AptPage.render();     break;
    }
    updateHUD();
  }

  function openSidebar(){el('sidebar').classList.add('open');el('sidebar-overlay').classList.add('open');}
  function closeSidebar(){el('sidebar').classList.remove('open');el('sidebar-overlay').classList.remove('open');}

  // ---- HUD ----
  function updateHUD() {
    const day = Store.daysSinceStart()+1;
    el('hud-day').textContent = 'Day '+day;
    el('hud-streak').textContent = '🔥 '+Store.calcStreak()+' streak';
    el('hud-dsa').textContent = '⚡ '+Store.dsaTotal()+' DSA';
    el('hud-apps').textContent = '📬 '+Store.state.apps.length+' apps';
    const sc = Object.values(Store.getTodayScores()).filter(Boolean).length;
    el('hud-score').textContent = '✅ '+sc+'/6 today';
    // XP pill
    const lvl = Store.getLevel();
    const hxp = el('hud-xp');
    if (hxp) hxp.textContent = '⭐ Lv.'+lvl.level+' · '+lvl.xp.toLocaleString()+' XP';
    const now = new Date();
    const phase2Start = new Date('2026-07-05');
    el('sidebar-phase').textContent = now < phase2Start ? '📅 Phase 1 Active' : '🚀 Phase 2 Active';
    const p1pct = calcPhase1Pct();
    const nb = el('nav-p1-badge'); if(nb) nb.textContent = Math.round(p1pct)+'%';
    const ab = el('nav-apps-badge'); if(ab) ab.textContent = Store.state.apps.length;
  }

  function calcPhase1Pct() {
    const all = [...DATA.aiml,...DATA.cs];
    const done = all.filter(i=>Store.state.checks['aiml_'+key(i)]||Store.state.checks['cs_'+key(i)]).length;
    return all.length ? (done/all.length)*100 : 0;
  }

  // ---- Task Lists ----
  function renderTaskList(containerId, items, prefix) {
    const container = el(containerId); if(!container) return;
    container.innerHTML = items.map(item=>{
      const id = prefix+'_'+key(item);
      const checked = Store.state.checks[id]||false;
      return `<div class="task-row"><input type="checkbox" id="${id}" ${checked?'checked':''} onchange="App.toggleCheck('${id}',this.checked)"><label for="${id}" class="${checked?'done':''}">${item}</label></div>`;
    }).join('');
  }

  function toggleCheck(id, val) {
    Store.state.checks[id] = val;
    Store.save('checks');
    const lbl = qs(`label[for="${id}"]`);
    if (lbl) lbl.className = val?'done':'';
    updateHUD();
    if (currentPage==='phase1') renderPhase1Bars();
    if (currentPage==='dashboard') renderProgressOverview();
  }

  function countChecked(prefix, items) {
    return items.filter(i=>Store.state.checks[prefix+'_'+key(i)]).length;
  }

  // ---- DASHBOARD ----
  function renderDashboard() {
    const now = new Date();
    const dEl = el('dash-date');
    if(dEl) dEl.textContent = now.toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
    renderScorecard();
    renderStats();
    renderProgressOverview();
    renderWeekChart();
    renderTodayMission();
  }

  function renderTodayMission() {
    const container = el('today-mission'); if(!container) return;
    const scores = Store.getTodayScores();
    const tasks = [
      {id:'quiz',     label:'Technical Quiz (30 XP)',      icon:'ti-bulb',        done:!!scores.interview},
      {id:'dsa_ai',   label:'DSA Practice (50 XP)',        icon:'ti-code',        done:!!scores.dsa},
      {id:'vocab',    label:'Vocabulary (15 XP)',          icon:'ti-book',        done:!!scores.comm},
      {id:'english',  label:'English Lesson (15 XP)',      icon:'ti-language',    done:!!scores.comm},
      {id:'aptitude', label:'Aptitude (20 XP)',            icon:'ti-calculator',  done:!!scores.aiml},
      {id:'apps',     label:'Apply to Jobs (20 XP)',       icon:'ti-briefcase',   done:!!scores.apps},
      {id:'project',  label:'Major Project (25 XP)',       icon:'ti-brain',       done:!!scores.project},
    ];
    const done = tasks.filter(t=>t.done).length;
    container.innerHTML = `
      <div class="mission-header"><span>Today's Mission</span><span class="section-tag">${done}/${tasks.length}</span></div>
      ${UI.progressBar((done/tasks.length)*100,'indigo',6)}
      <div class="mission-tasks">
        ${tasks.map(t=>`<div class="mission-task ${t.done?'done':''}">
          <i class="ti ${t.icon}"></i>
          <span>${t.label}</span>
          ${t.done?'<i class="ti ti-check mission-check"></i>':''}
        </div>`).join('')}
      </div>`;
  }

  function renderScorecard() {
    const container = el('scorecard'); if(!container) return;
    const scores = Store.getTodayScores();
    const total = Object.values(scores).filter(Boolean).length;
    const st = el('score-total'); if(st) st.textContent = total+' / 6';
    container.innerHTML = DATA.scoreItems.map(s=>{
      const done = scores[s.id]||false;
      return `<div class="score-card ${done?'done':''}" onclick="App.toggleScore('${s.id}')" title="${done?'Done! Click to undo':'Mark done'}">
        <i class="${s.icon} score-icon" aria-hidden="true"></i>
        <div class="score-name">${s.label}</div>
      </div>`;
    }).join('');
  }

  function toggleScore(id) {
    const scores = Store.getTodayScores();
    Store.setScore(id, !scores[id]);
    renderScorecard();
    updateHUD();
    if(currentPage==='dashboard'){renderStats();renderTodayMission();}
  }

  function renderStats() {
    const container = el('stat-grid'); if(!container) return;
    const apps = Store.state.apps;
    const interviews = apps.filter(a=>['hr','tech','final','selected'].includes(a.status)).length;
    const sc = Object.values(Store.getTodayScores()).filter(Boolean).length;
    const aimlDone = countChecked('aiml', DATA.aiml);
    const csDone = countChecked('cs', DATA.cs);
    const lvl = Store.getLevel();
    container.innerHTML = `
      <div class="stat-card"><div class="stat-num indigo">${Store.daysSinceStart()}</div><div class="stat-label">Days Running</div></div>
      <div class="stat-card"><div class="stat-num green">${Store.calcStreak()}</div><div class="stat-label">Streak</div></div>
      <div class="stat-card"><div class="stat-num amber">${Store.dsaTotal()}</div><div class="stat-label">DSA Solved</div></div>
      <div class="stat-card"><div class="stat-num blue">${apps.length}</div><div class="stat-label">Apps Sent</div></div>
      <div class="stat-card"><div class="stat-num purple">${interviews}</div><div class="stat-label">Interviews</div></div>
      <div class="stat-card"><div class="stat-num">${sc}/6</div><div class="stat-label">Today's Score</div></div>
      <div class="stat-card"><div class="stat-num green">${aimlDone}/${DATA.aiml.length}</div><div class="stat-label">AI/ML Done</div></div>
      <div class="stat-card"><div class="stat-num indigo">Lv.${lvl.level}</div><div class="stat-label">Your Level</div></div>`;
  }

  function renderProgressOverview() {
    const container = el('progress-overview'); if(!container) return;
    const aimlDone = countChecked('aiml',DATA.aiml);
    const csDone = countChecked('cs',DATA.cs);
    const projDone = Object.values(Store.state.projPhases).filter(Boolean).length;
    const dsaT = Store.dsaTotal();
    const quizSessions = Store.state.quizHistory.length;
    const lvl = Store.getLevel();
    const items = [
      {title:'AI/ML Course',icon:'ti-school',done:aimlDone,total:DATA.aiml.length,color:'indigo'},
      {title:'CS Fundamentals',icon:'ti-cpu',done:csDone,total:DATA.cs.length,color:'green'},
      {title:'Major Project',icon:'ti-brain',done:projDone,total:DATA.projPhases.length,color:'purple'},
      {title:'DSA Problems',icon:'ti-code',done:Math.min(dsaT,20),total:20,color:'amber'},
      {title:'Quiz Sessions',icon:'ti-bulb',done:Math.min(quizSessions,30),total:30,color:'blue'},
      {title:'XP Progress',icon:'ti-star',done:lvl.xp-lvl.currXP,total:lvl.nextXP-lvl.currXP,color:'indigo'},
    ];
    container.innerHTML = items.map(item=>{
      const pct = item.total ? Math.round((item.done/item.total)*100) : 0;
      return `<div class="progress-card">
        <div class="progress-card-header"><span class="progress-card-title"><i class="ti ${item.icon}"></i> ${item.title}</span><span class="progress-card-pct" style="color:var(--${item.color})">${pct}%</span></div>
        <div class="progress-bar"><div class="progress-fill ${item.color}" style="width:${pct}%"></div></div>
        <div class="progress-label"><span>${item.done} / ${item.total}</span><span>${item.total-item.done} to go</span></div>
      </div>`;
    }).join('');
  }

  function renderWeekChart() {
    const chartEl = el('week-chart'); const labelsEl = el('week-labels');
    if(!chartEl) return;
    const week = Store.getWeek();
    const yLabels = el('chart-y');
    if(yLabels) yLabels.innerHTML = ['6','3','0'].map(l=>`<div class="chart-y-label">${l}</div>`).join('');
    chartEl.innerHTML = week.map(w=>{
      const scoreH = Math.round((w.score/6)*90);
      const maxDSA = Math.max(1,...week.map(x=>x.dsa));
      const dsaH = Math.round((w.dsa/maxDSA)*90);
      return `<div class="bar-group"><div class="chart-bar score-bar" style="height:${Math.max(3,scoreH)}px" title="Score: ${w.score}/6"></div><div class="chart-bar dsa-bar" style="height:${Math.max(3,dsaH)}px" title="DSA: ${w.dsa}"></div></div>`;
    }).join('');
    if(labelsEl) labelsEl.innerHTML = week.map(w=>`<div class="chart-x-label">${w.label}</div>`).join('');
  }

  // ---- PHASE 1 ----
  function renderPhase1() {
    renderTaskList('aiml-tasks',DATA.aiml,'aiml');
    renderTaskList('cs-tasks',DATA.cs,'cs');
    renderTaskList('comm-tasks',DATA.comm,'comm');
    renderPhase1Bars();
    renderP1DSA();
  }

  function renderPhase1Bars() {
    const aimlDone = countChecked('aiml',DATA.aiml);
    const csDone = countChecked('cs',DATA.cs);
    const total = DATA.aiml.length+DATA.cs.length;
    const totalDone = aimlDone+csDone;
    const overallPct = Math.round((totalDone/total)*100);
    const aimlPct = Math.round((aimlDone/DATA.aiml.length)*100);
    const csPct = Math.round((csDone/DATA.cs.length)*100);
    const at = el('aiml-tag'); if(at) at.textContent = `${aimlDone}/${DATA.aiml.length}`;
    const ct = el('cs-tag'); if(ct) ct.textContent = `${csDone}/${DATA.cs.length}`;
    const ot = el('p1-overall-tag'); if(ot) ot.textContent = overallPct+'%';
    const mp = el('p1-multi-progress');
    if(mp) mp.innerHTML = `
      <div class="multi-row"><div class="multi-label"><span>AI/ML Course</span><span>${aimlPct}%</span></div><div class="progress-bar"><div class="progress-fill" style="width:${aimlPct}%"></div></div></div>
      <div class="multi-row"><div class="multi-label"><span>CS Fundamentals</span><span>${csPct}%</span></div><div class="progress-bar"><div class="progress-fill green" style="width:${csPct}%"></div></div></div>
      <div class="multi-row"><div class="multi-label" style="font-weight:600"><span>Phase 1 Overall</span><span>${overallPct}%</span></div><div class="progress-bar" style="height:8px"><div class="progress-fill amber" style="width:${overallPct}%"></div></div></div>`;
  }

  function renderP1DSA() {
    const total = Store.dsaTotal(); const target = 15;
    const pct = Math.round(Math.min(100,(total/target)*100));
    const tb = el('p1-dsa-target-bar');
    if(tb) tb.innerHTML = `<div class="dsa-target-label"><span>Progress toward ${target}-problem target</span><span style="color:var(--amber);font-weight:600">${total} / ${target}</span></div><div class="dsa-target-track"><div class="dsa-target-fill" style="width:${pct}%"></div></div>`;
    const ds = el('p1-dsa-stats');
    if(ds) ds.innerHTML = `<div class="stat-card"><div class="stat-num amber">${total}</div><div class="stat-label">Solved</div></div><div class="stat-card"><div class="stat-num">${target}</div><div class="stat-label">Target</div></div><div class="stat-card"><div class="stat-num green">${Math.max(0,target-total)}</div><div class="stat-label">Remaining</div></div><div class="stat-card"><div class="stat-num indigo">${pct}%</div><div class="stat-label">Done</div></div>`;
  }

  // ---- PHASE 2 ----
  function renderPhase2() {
    renderDSATopics();
    renderTaskList('interview-tasks',DATA.interview,'interview');
    renderTaskList('project-explain-tasks',DATA.projExplain,'projexp');
    renderTaskList('aptitude-tasks',DATA.aptitude,'apt');
    renderTaskList('networking-tasks',DATA.networking,'net');
    renderNetworkStats();
  }

  function renderDSATopics() {
    const container = el('dsa-topics-list'); if(!container) return;
    const dsa = Store.state.dsa;
    const total = Store.dsaTotal();
    const maxVal = Math.max(1,...Object.values(dsa));
    const sel = el('dsa-topic-select');
    if(sel&&!sel.options.length) DATA.dsaTopics.forEach(t=>{const o=document.createElement('option');o.value=t;o.textContent=t;sel.appendChild(o);});
    container.innerHTML = DATA.dsaTopics.map(t=>{
      const count = dsa[t]||0;
      const pct = Math.round((count/maxVal)*100);
      return `<div class="dsa-topic-row"><span class="dsa-topic-label">${t}</span><div class="dsa-mini-bar"><div class="dsa-mini-fill" style="width:${pct}%"></div></div><div class="counter-row"><button class="counter-btn" onclick="App.adjDSA('${t}',-1)">−</button><span class="dsa-count-num">${count}</span><button class="counter-btn" onclick="App.adjDSA('${t}',1)">+</button></div></div>`;
    }).join('');
    const gt = el('dsa-grand-total'); if(gt) gt.textContent = 'Total: '+total;
    renderDSAChart();
    renderP1DSA();
    updateHUD();
  }

  function renderDSAChart() {
    const container = el('dsa-topic-chart'); if(!container) return;
    const dsa = Store.state.dsa; const total = Store.dsaTotal();
    if(!total){container.innerHTML='<p style="font-size:12px;color:var(--text3);text-align:center;padding:16px 0">Solve some problems to see distribution!</p>';return;}
    const maxVal = Math.max(1,...Object.values(dsa));
    container.innerHTML = DATA.dsaTopics.filter(t=>(dsa[t]||0)>0).sort((a,b)=>(dsa[b]||0)-(dsa[a]||0)).map(t=>{
      const count=dsa[t]||0,pct=Math.round((count/maxVal)*100);
      return `<div class="topic-chart-row"><span class="topic-chart-label">${t}</span><div class="topic-chart-bar-wrap"><div class="topic-chart-fill" style="width:${pct}%"></div></div><span class="topic-chart-val">${count}</span></div>`;
    }).join('');
  }

  function adjDSA(topic, delta) {
    Store.state.dsa[topic] = Math.max(0,(Store.state.dsa[topic]||0)+delta);
    Store.save('dsa');
    Store.snapshotWeekly();
    renderDSATopics();
    if(currentPage==='dashboard'){renderStats();renderProgressOverview();renderWeekChart();}
  }

  function addDSA() {
    const topic = el('dsa-topic-select')?.value;
    const count = parseInt(el('dsa-add-count')?.value)||1;
    if(!topic) return;
    Store.state.dsa[topic] = (Store.state.dsa[topic]||0)+count;
    Store.save('dsa');
    Store.snapshotWeekly();
    const c = el('dsa-add-count'); if(c) c.value=1;
    renderDSATopics();
    updateHUD();
  }

  function renderNetworkStats() {
    const container = el('network-stats'); if(!container) return;
    const li = Store.state.checks['net_'+key(DATA.networking[0])]?1:0;
    const ref = Store.state.checks['net_'+key(DATA.networking[1])]?1:0;
    const mentor = Store.state.checks['net_'+key(DATA.networking[2])]?1:0;
    container.innerHTML = `<div class="stat-card"><div class="stat-num indigo">${li}</div><div class="stat-label">LinkedIn Today</div></div><div class="stat-card"><div class="stat-num amber">${ref}</div><div class="stat-label">Referrals Today</div></div><div class="stat-card"><div class="stat-num green">${mentor}</div><div class="stat-label">Mentors Today</div></div>`;
  }

  // ---- APPLICATIONS ----
  function renderApplications() {
    const apps = Store.state.apps;
    const filter = (el('app-filter')||{}).value||'all';
    const filtered = filter==='all' ? apps : apps.filter(a=>a.status===filter);
    const statContainer = el('app-stat-grid');
    if(statContainer){
      const total=apps.length,active=apps.filter(a=>!['rejected','selected'].includes(a.status)).length;
      const interviews=apps.filter(a=>['hr','tech','final','selected'].includes(a.status)).length;
      const offers=apps.filter(a=>a.status==='selected').length;
      const rejected=apps.filter(a=>a.status==='rejected').length;
      statContainer.innerHTML = `<div class="stat-card"><div class="stat-num blue">${total}</div><div class="stat-label">Total Applied</div></div><div class="stat-card"><div class="stat-num amber">${active}</div><div class="stat-label">Active</div></div><div class="stat-card"><div class="stat-num indigo">${interviews}</div><div class="stat-label">Interviews</div></div><div class="stat-card"><div class="stat-num green">${offers}</div><div class="stat-label">Offers 🎉</div></div><div class="stat-card"><div class="stat-num rose">${rejected}</div><div class="stat-label">Rejected</div></div>`;
    }
    const tbody = el('apps-tbody'); const emptyState = el('apps-empty');
    if(!tbody) return;
    if(!filtered.length){tbody.innerHTML='';if(emptyState)emptyState.classList.remove('hidden');return;}
    if(emptyState) emptyState.classList.add('hidden');
    tbody.innerHTML = filtered.map((a)=>{
      const realIdx = apps.indexOf(a);
      const statusOpts = Object.entries(DATA.statusLabels).map(([val,lbl])=>`<option value="${val}" ${a.status===val?'selected':''}>${lbl}</option>`).join('');
      return `<tr><td style="font-weight:500">${a.company}</td><td style="color:var(--text2)">${a.role||'—'}</td><td style="color:var(--text3);font-size:12px">${a.date}</td><td><select class="app-select" onchange="App.updateAppStatus(${realIdx},this.value)">${statusOpts}</select></td><td><button class="btn danger" onclick="App.removeApp(${realIdx})" title="Remove"><i class="ti ti-trash"></i></button></td></tr>`;
    }).join('');
  }

  function addApplication() {
    const company=(el('app-company')?.value||'').trim();
    const role=(el('app-role')?.value||'').trim();
    const date=el('app-date')?.value||todayISO();
    const status=el('app-status-select')?.value;
    if(!company){el('app-company')?.focus();return;}
    Store.state.apps.unshift({company,role,date,status});
    Store.save('apps');
    Store.addXP(DATA.xpRewards.application,'Application Sent');
    Store.setScore('apps',true);
    el('app-company').value='';
    el('app-role').value='';
    renderApplications();
    updateHUD();
  }

  function removeApp(idx){
    if(!confirm(`Remove application to "${Store.state.apps[idx].company}"?`)) return;
    Store.state.apps.splice(idx,1);
    Store.save('apps');
    renderApplications();
    updateHUD();
  }

  function updateAppStatus(idx,val){
    Store.state.apps[idx].status=val;
    Store.save('apps');
    renderApplications();
  }

  // ---- PROJECT ----
  function renderProject() {
    renderProjPhases();
    renderMilestones();
    const notesEl = el('proj-notes');
    if(notesEl) notesEl.value = Store.state.notes;
  }

  function renderProjPhases() {
    const phases = Store.state.projPhases;
    const done = Object.values(phases).filter(Boolean).length;
    const total = DATA.projPhases.length;
    const pct = Math.round((done/total)*100);
    const bar = el('proj-bar'); if(bar) bar.style.width = pct+'%';
    const pb = el('proj-pct-badge'); if(pb) pb.textContent = pct+'%';
    const chips = el('proj-phase-chips');
    if(chips) chips.innerHTML = DATA.projPhases.map(p=>`<span class="phase-chip ${phases[p.id]?'done':''}">${phases[p.id]?'✓':'○'} ${p.label}</span>`).join('');
    const grid = el('proj-phases');
    if(grid) grid.innerHTML = DATA.projPhases.map(p=>{
      const isDone=phases[p.id]||false;
      return `<div class="proj-phase-card ${isDone?'done':''}" onclick="App.togglePhase('${p.id}')"><div class="phase-card-icon"><i class="ti ${p.icon}"></i></div><div class="phase-card-name">${p.label}</div><div class="phase-card-status">${isDone?'✓ Complete':'Not started'}</div></div>`;
    }).join('');
  }

  function togglePhase(id) {
    Store.state.projPhases[id] = !Store.state.projPhases[id];
    Store.save('projPhases');
    if(Store.state.projPhases[id]){Store.addXP(DATA.xpRewards.project,'Project Phase');Store.setScore('project',true);App.updateHUD();}
    renderProjPhases();
    if(currentPage==='dashboard') renderProgressOverview();
  }

  function renderMilestones() {
    const container = el('milestones-list'); if(!container) return;
    const milestones = Store.state.milestones;
    if(!milestones.length){container.innerHTML='<p style="font-size:12px;color:var(--text3);padding:8px 0">No milestones yet.</p>';return;}
    container.innerHTML = milestones.map((m,i)=>`<div class="milestone-item"><div class="milestone-dot ${m.done?'done':'active'}" onclick="App.toggleMilestone(${i})" title="${m.done?'Mark incomplete':'Mark complete'}"></div><div class="milestone-body"><div class="milestone-text ${m.done?'done':''}">${m.text}</div>${m.date?`<div class="milestone-date">📅 ${m.date}</div>`:''}</div><button class="milestone-del btn danger" onclick="App.removeMilestone(${i})"><i class="ti ti-x"></i></button></div>`).join('');
  }

  function showMilestoneForm(){el('milestone-form').classList.remove('hidden');el('milestone-text')?.focus();}
  function hideMilestoneForm(){el('milestone-form').classList.add('hidden');if(el('milestone-text'))el('milestone-text').value='';if(el('milestone-date'))el('milestone-date').value='';}

  function addMilestone(){
    const text=(el('milestone-text')?.value||'').trim();
    if(!text) return;
    const date=el('milestone-date')?.value;
    Store.state.milestones.push({text,date,done:false});
    Store.save('milestones');
    hideMilestoneForm();
    renderMilestones();
  }

  function toggleMilestone(i){Store.state.milestones[i].done=!Store.state.milestones[i].done;Store.save('milestones');renderMilestones();}
  function removeMilestone(i){Store.state.milestones.splice(i,1);Store.save('milestones');renderMilestones();}

  function saveNotes(){
    Store.state.notes=(el('proj-notes')?.value||'');
    Store.save('notes');
    const msg=el('note-saved-msg');
    if(msg){msg.textContent='✓ Saved';setTimeout(()=>{msg.textContent='';},2000);}
  }

  // ---- Phase 2 tabs ----
  function showTab(tabId){
    qsa('.tab-content').forEach(t=>t.classList.remove('active'));
    qsa('.tab-btn[data-tab]').forEach(b=>b.classList.remove('active'));
    const te=el('tab-'+tabId);if(te)te.classList.add('active');
    const btn=qs(`.tab-btn[data-tab="${tabId}"]`);if(btn)btn.classList.add('active');
  }

  // ---- Init ----
  function init() {
    qsa('.nav-btn[data-page]').forEach(btn=>btn.addEventListener('click',()=>showPage(btn.dataset.page)));
    qsa('.tab-btn[data-tab]').forEach(btn=>btn.addEventListener('click',()=>showTab(btn.dataset.tab)));
    el('menu-toggle')?.addEventListener('click',()=>el('sidebar').classList.contains('open')?closeSidebar():openSidebar());
    el('sidebar-overlay')?.addEventListener('click',closeSidebar);
    const dateInput=el('app-date'); if(dateInput) dateInput.value=todayISO();
    ['app-company','app-role'].forEach(id=>{const i=el(id);if(i)i.addEventListener('keydown',e=>{if(e.key==='Enter')addApplication();});});
    const mi=el('milestone-text');if(mi)mi.addEventListener('keydown',e=>{if(e.key==='Enter')addMilestone();});
    // Init dsa state if topics changed
    DATA.dsaTopics.forEach(t=>{if(Store.state.dsa[t]===undefined)Store.state.dsa[t]=0;});
    Store.snapshotWeekly();
    showPage('dashboard');
  }

  return {
    init, showPage, showTab, updateHUD,
    toggleCheck, toggleScore, adjDSA, addDSA,
    addApplication, removeApp, updateAppStatus, renderApplications,
    togglePhase, showMilestoneForm, hideMilestoneForm, addMilestone, toggleMilestone, removeMilestone,
    saveNotes
  };
})();

document.addEventListener('DOMContentLoaded', App.init);
