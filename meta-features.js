(()=>{
'use strict';
const q=s=>document.querySelector(s), qa=s=>[...document.querySelectorAll(s)];
const gpLoad=(k,f)=>{try{const v=JSON.parse(localStorage.getItem(k));return v??f}catch{return f}};
const gpSave=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
const gp={
  sessions:gpLoad('gpSessions',[]),daily:gpLoad('gpDaily',{}),bingo:gpLoad('gpBingo',{}),collections:gpLoad('gpCollections',{}),
  settings:gpLoad('gpSettings',{energy:'normal',device:'any',modifiers:[],shipMode:false,randomEvent:null}),
  flags:gpLoad('gpFlags',{}),resurrections:gpLoad('gpResurrections',0),lastObserved:null
};
const fmtMin=m=>m<60?`${Math.round(m)}m`:`${Math.floor(m/60)}h ${Math.round(m%60)}m`;
const dayKey=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const gameById=id=>GAMES.find(g=>g.appid===+id);
const tagNames=['souls','strategy','medieval','sandbox','story','chill','sweat','brainoff','explore','multi'];
const tagLabel=t=>({souls:'Souls',strategy:'Strategy',medieval:'Medieval',sandbox:'Sandbox',story:'Story',chill:'Chill',sweat:'Competitive',brainoff:'Brain Off',explore:'Exploration',multi:'Multiplayer'}[t]||t);
const now=()=>Date.now();
const weekAgo=()=>now()-7*86400000;
let installPrompt=null,sessionTimer=null;

function injectUI(){
  const stats=q('.stats');
  if(stats&&!q('#metaLauncher')){
    const el=document.createElement('section');el.id='metaLauncher';el.className='panel meta-launcher';
    el.innerHTML=`<div class="meta-title"><h2>🎮 Game Command Center</h2><p>Challenges, sessions, taste learning, arcade modes and backlog analytics.</p></div><div class="meta-actions">
      <button class="meta-btn" data-meta="daily">Daily <span class="meta-badge" id="dailyStreakBadge">0🔥</span></button>
      <button class="meta-btn" data-meta="bingo">Bingo</button><button class="meta-btn" data-meta="dashboard">Dashboard</button>
      <button class="meta-btn" data-meta="sessions">Sessions</button><button class="meta-btn" data-meta="taste">Taste</button>
      <button class="meta-btn" data-meta="graveyard">Graveyard</button><button class="meta-btn" data-meta="arcade">Arcade</button>
      <button class="meta-btn" data-meta="collections">Collections</button><button class="meta-btn" data-meta="backup">Sync / App</button>
    </div>`;
    stats.insertAdjacentElement('afterend',el);
  }
  if(!q('#metaModal')) document.body.insertAdjacentHTML('beforeend',`<div class="meta-modal" id="metaModal"><div class="meta-card"><div class="meta-head"><h3 id="metaTitle">Command Center</h3><button class="small-btn" id="metaClose">Close</button></div><div class="meta-body" id="metaBody"></div></div></div>`);
  if(!q('#sessionBanner')) document.body.insertAdjacentHTML('beforeend',`<div class="session-banner" id="sessionBanner"><strong id="sessionGame">Session</strong><span class="session-time" id="sessionTime">00:00</span><button class="small-btn" id="sessionStop">Stop</button></div><div class="meta-toast" id="metaToast"></div>`);
  const grid=q('.decision-grid');
  if(grid&&!q('#energyLevel')){
    const anchor=grid.querySelector('.toggle-group');
    const energy=document.createElement('div');energy.className='control-group device-extra';energy.innerHTML=`<label>ENERGY LEVEL</label><select id="energyLevel"><option value="dead">Dead</option><option value="normal">Normal</option><option value="locked">Locked In</option></select>`;
    const device=document.createElement('div');device.className='control-group device-extra';device.innerHTML=`<label>DEVICE</label><select id="deviceMode"><option value="any">Any</option><option value="handheld">Handheld</option><option value="controller">Controller</option><option value="kbm">Keyboard + Mouse</option></select>`;
    const mods=document.createElement('div');mods.className='control-group wide';mods.innerHTML=`<label>WHEEL MODIFIERS</label><div class="modifier-chips" id="modifierChips">
      <button class="modifier-chip" data-mod="unplayed">Only Unplayed</button><button class="modifier-chip" data-mod="under5">Under 5h</button><button class="modifier-chip" data-mod="rating90">90%+</button><button class="modifier-chip" data-mod="forgotten">Forgotten</button><button class="modifier-chip" data-mod="nomulti">No Multiplayer</button>
    </div>`;
    grid.insertBefore(energy,anchor);grid.insertBefore(device,anchor);grid.insertBefore(mods,anchor);
  }
  const actions=q('#result .actions');
  if(actions&&!q('#whyBtn')) actions.insertAdjacentHTML('afterbegin','<button class="icon-btn" id="whyBtn" title="Why this game?">Why?</button><button class="icon-btn" id="launchSteam" title="Launch in Steam">Launch</button>');
  q('#energyLevel').value=gp.settings.energy||'normal';q('#deviceMode').value=gp.settings.device||'any';
  syncModifierUI();syncShipClass();updateDailyBadge();syncSession();
}
function toast(msg){const t=q('#metaToast');if(!t)return;t.textContent=msg;t.classList.add('show');clearTimeout(t._to);t._to=setTimeout(()=>t.classList.remove('show'),2600)}
function openMeta(view){q('#metaModal').classList.add('show');renderView(view)}
function closeMeta(){q('#metaModal').classList.remove('show')}
function renderView(view){
  const titles={daily:'Daily Challenge',bingo:'Backlog Bingo',dashboard:'Library Health Dashboard',sessions:'Session Tracker & Weekly Recap',taste:'Taste Profile',graveyard:'Backlog Graveyard',arcade:'Arcade Modes',collections:'Custom Collections',backup:'Backup, Sync & App',why:'Why This Game?'};
  q('#metaTitle').textContent=titles[view]||'Command Center';
  const fn={daily:renderDaily,bingo:renderBingo,dashboard:renderDashboard,sessions:renderSessions,taste:renderTaste,graveyard:renderGraveyard,arcade:renderArcade,collections:renderCollections,backup:renderBackup,why:renderWhy}[view];
  q('#metaBody').innerHTML='';if(fn)fn(q('#metaBody'));
}

/* Selection-engine extensions */
const originalPool=currentPool;
currentPool=function(){
  let arr=originalPool();const mods=new Set(gp.settings.modifiers||[]),ev=gp.settings.randomEvent;
  if(mods.has('unplayed'))arr=arr.filter(g=>g.hours===0);
  if(mods.has('under5'))arr=arr.filter(g=>g.hours<5);
  if(mods.has('rating90'))arr=arr.filter(g=>(g.rating||0)>=90);
  if(mods.has('forgotten'))arr=arr.filter(g=>g.hours<1&&meta(g).archaeology>=20);
  if(mods.has('nomulti'))arr=arr.filter(g=>!meta(g).tags.has('multi'));
  if(gp.settings.energy==='dead')arr=arr.filter(g=>meta(g).session==='quick'||meta(g).tags.has('chill')||meta(g).tags.has('brainoff'));
  if(gp.settings.shipMode)arr=arr.filter(g=>!meta(g).tags.has('multi'));
  if(ev?.type==='jail')arr=arr.filter(g=>(state.dodges[g.appid]||0)>=5);
  if(ev?.type==='rating')arr=arr.filter(g=>(g.rating||0)>=90);
  if(ev?.type==='forgotten')arr=arr.filter(g=>g.hours<1);
  return arr;
};
const originalWeight=smartWeight;
smartWeight=function(g){
  let w=originalWeight(g),m=meta(g);
  if(gp.settings.energy==='locked'&&(m.tags.has('sweat')||m.tags.has('souls')||m.tags.has('strategy')||m.session==='long'))w+=15;
  if(gp.settings.energy==='dead'&&(m.tags.has('chill')||m.tags.has('brainoff')||m.session==='quick'))w+=18;
  if(gp.settings.device==='handheld'){if(m.session==='quick'||m.tags.has('chill')||m.tags.has('brainoff'))w+=16;if(m.tags.has('strategy')&&m.session==='long')w-=10}
  if(gp.settings.device==='controller'&&(m.tags.has('souls')||m.tags.has('story')||m.tags.has('explore')))w+=15;
  if(gp.settings.device==='kbm'&&(m.tags.has('strategy')||m.tags.has('sweat')||m.tags.has('sandbox')))w+=15;
  return Math.max(1,w);
};

function syncModifierUI(){qa('.modifier-chip').forEach(b=>b.classList.toggle('active',(gp.settings.modifiers||[]).includes(b.dataset.mod)))}
function toggleModifier(mod){const s=new Set(gp.settings.modifiers||[]);s.has(mod)?s.delete(mod):s.add(mod);gp.settings.modifiers=[...s];gpSave('gpSettings',gp.settings);syncModifierUI();updateWheel();}
function syncShipClass(){document.body.dataset.ship=gp.settings.shipMode?'1':'0'}

/* Daily challenge */
function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return Math.abs(h>>>0)}
function dailyGame(date=dayKey()){
  const candidates=GAMES.filter(g=>g.wheelEligible&&g.hours<10&&(g.rating==null||g.rating>=78)&&getStatus(g)!=='finished'&&getStatus(g)!=='dropped');
  return candidates[hash(date)%Math.max(1,candidates.length)]||GAMES[hash(date)%GAMES.length];
}
function dailyStreak(){let streak=0,d=new Date();for(let i=0;i<365;i++){const k=dayKey(d);if(gp.daily[k]?.completed)streak++;else break;d.setDate(d.getDate()-1)}return streak}
function updateDailyBadge(){const b=q('#dailyStreakBadge');if(b)b.textContent=`${dailyStreak()}🔥`}
function renderDaily(root){
  const k=dayKey(),g=dailyGame(k),rec=gp.daily[k]||{appid:g.appid};gp.daily[k]=rec;gpSave('gpDaily',gp.daily);
  root.innerHTML=`<div class="daily-hero"><img src="${img(g)}" onerror="this.style.visibility='hidden'"><div><div class="meta-note">DAILY CHALLENGE · ${dailyStreak()} day streak</div><h3>${esc(g.name)}</h3><p>${fmtHours(g.hours)} · ${g.rating?g.rating.toFixed(1)+'%':'No rating'} · Play at least 45 minutes today.</p><div class="meta-footer-actions"><button class="spin" id="dailyStart">Start 45m Session</button><button class="small-btn" id="dailyLaunch">Launch Steam</button><button class="small-btn" id="dailyDone">${rec.completed?'✓ Completed':'Mark Complete'}</button></div></div></div>`;
  q('#dailyStart').onclick=()=>startSession(g,45);q('#dailyLaunch').onclick=()=>launchSteam(g);q('#dailyDone').onclick=()=>{rec.completed=true;rec.completedAt=new Date().toISOString();gp.daily[k]=rec;gpSave('gpDaily',gp.daily);updateDailyBadge();renderView('daily');toast('Daily challenge complete 🔥')};
}

/* Session tracking */
function activeSession(){return gpLoad('gpActiveSession',null)}
function startSession(g,planned=0){const a=activeSession();if(a&&a.appid!==g.appid&&!confirm(`A session for ${a.name} is already running. Replace it?`))return;gpSave('gpActiveSession',{appid:g.appid,name:g.name,start:now(),planned});syncSession();toast(`Session started: ${g.name}`)}
function stopSession(){const a=activeSession();if(!a)return;const end=now(),minutes=Math.max(1,(end-a.start)/60000);gp.sessions.unshift({appid:a.appid,name:a.name,start:a.start,end,minutes});gp.sessions=gp.sessions.slice(0,1000);gpSave('gpSessions',gp.sessions);localStorage.removeItem('gpActiveSession');syncSession();toast(`Session saved · ${fmtMin(minutes)}`);if(q('#metaModal').classList.contains('show'))renderView('sessions')}
function syncSession(){const a=activeSession(),bar=q('#sessionBanner');clearInterval(sessionTimer);if(!a){bar?.classList.remove('show');return}bar.classList.add('show');q('#sessionGame').textContent=a.name;const tick=()=>{const mins=(now()-a.start)/60000;q('#sessionTime').textContent=fmtMin(mins)};tick();sessionTimer=setInterval(tick,1000)}
function sessionGame(g){startSession(g);setTimeout(()=>launchSteam(g),120)}
function launchSteam(g=state.result){if(!g)return;window.location.href=`steam://run/${g.appid}`}
function renderSessions(root){
  const week=gp.sessions.filter(s=>s.end>=weekAgo()),total=week.reduce((a,s)=>a+s.minutes,0),unique=new Set(week.map(s=>s.appid)).size;
  root.innerHTML=`<div class="meta-grid"><div class="meta-panel"><h4>This week</h4><div class="meta-kpi">${fmtMin(total)}</div><p>${week.length} sessions · ${unique} games</p></div><div class="meta-panel"><h4>All tracked</h4><div class="meta-kpi">${fmtMin(gp.sessions.reduce((a,s)=>a+s.minutes,0))}</div><p>${gp.sessions.length} recorded sessions</p></div><div class="meta-panel"><h4>Active</h4><div class="meta-kpi">${activeSession()?'LIVE':'—'}</div><p>${activeSession()?.name||'No session running'}</p></div></div><h3>Weekly recap</h3><p class="muted">You played ${unique} different games for ${fmtMin(total)} across ${week.length} sessions in the last 7 days.</p><div id="sessionRows"></div>`;
  q('#sessionRows').innerHTML=gp.sessions.slice(0,30).map(s=>`<div class="meta-row"><span>${esc(s.name)}</span><small>${new Date(s.start).toLocaleString()} · ${fmtMin(s.minutes)}</small></div>`).join('')||'<div class="empty">No tracked sessions yet. Press Play or start the Daily Challenge.</div>';
}

/* Taste profile + why */
function tasteScores(){const scores=Object.fromEntries(tagNames.map(t=>[t,0]));for(const g of GAMES){const m=meta(g),f=state.feedback[g.appid]||{};for(const t of m.tags){if(scores[t]==null)continue;scores[t]+=Math.min(g.hours,25)*.5+(f.love||0)*18+(f.play||0)*5+(state.favs.has(g.appid)?8:0)+(state.pins.has(g.appid)?5:0)}}return scores}
function renderTaste(root){const scores=tasteScores(),max=Math.max(1,...Object.values(scores)),sorted=Object.entries(scores).sort((a,b)=>b[1]-a[1]);root.innerHTML=`<div class="meta-panel"><h4>Your learned taste profile</h4><p>Built from Steam playtime plus your Play/Loved/Favorite/Pin behavior inside this app.</p><div class="taste-list">${sorted.map(([t,v])=>`<div class="taste-line"><b>${tagLabel(t)}</b><div class="meta-bar"><span style="width:${Math.round(v/max*100)}%"></span></div><strong>${Math.round(v/max*100)}%</strong></div>`).join('')}</div></div>`}
function weightBreakdown(g){const f=state.feedback[g.appid]||{},m=meta(g),rows=[];rows.push(['Base recommendation',Math.round((g.score||50)-42)]);rows.push(['SteamDB rating',Math.round(((g.rating||70)-65)*.35)]);const learned=(f.play||0)*8+(f.love||0)*22-(f.skip||0)*12-(f.notToday||0)*5;if(learned)rows.push(['Your learned behavior',learned]);if(state.favs.has(g.appid))rows.push(['Favorite',10]);if(state.pins.has(g.appid))rows.push(['Pinned',18]);if((state.dodges[g.appid]||0)>=5)rows.push(['Game Jail pressure',12]);if(gp.settings.energy==='dead'&&(m.tags.has('chill')||m.tags.has('brainoff')||m.session==='quick'))rows.push(['Low-energy fit',18]);if(gp.settings.energy==='locked'&&(m.tags.has('sweat')||m.tags.has('souls')||m.tags.has('strategy')))rows.push(['Locked-in fit',15]);if(gp.settings.device==='controller'&&(m.tags.has('souls')||m.tags.has('story')||m.tags.has('explore')))rows.push(['Controller fit',15]);if(gp.settings.device==='handheld'&&m.session==='quick')rows.push(['Handheld fit',16]);return rows}
function renderWhy(root){const g=state.result;if(!g){root.innerHTML='<div class="empty">Spin a game first.</div>';return}const rows=weightBreakdown(g),tags=[...meta(g).tags].map(tagLabel);root.innerHTML=`<div class="daily-hero"><img src="${img(g)}"><div><h3>${esc(g.name)}</h3><p>${tags.length?tags.join(' · '):'General'} · ${meta(g).session} session · ${fmtHours(g.hours)}</p><p><strong>Why:</strong> ${g.hours<2?'It is still largely unexplored in your library. ':''}${(g.rating||0)>=88?'It has a strong SteamDB rating. ':''}${state.favs.has(g.appid)||state.pins.has(g.appid)?'You explicitly marked interest in it. ':''}${(state.dodges[g.appid]||0)>=5?'You keep dodging it, so Game Jail is pushing back. ':''}</p></div></div><div class="meta-panel"><h4>Decision score breakdown</h4><div class="why-breakdown">${rows.map(([n,v])=>`<div class="why-line"><span>${n}</span><strong class="${v>=0?'pos':'neg'}">${v>=0?'+':''}${v}</strong></div>`).join('')}<div class="why-line"><span>Current smart weight</span><strong class="pos">${Math.round(smartWeight(g))}</strong></div></div></div>`}

/* Dashboard / heatmap / achievements */
function statusCounts(){const c={unplayed:0,tried:0,playing:0,finished:0,dropped:0};GAMES.forEach(g=>c[getStatus(g)]++);return c}
function heatData(days=84){const map={};gp.sessions.forEach(s=>{const k=dayKey(new Date(s.start));map[k]=(map[k]||0)+s.minutes});const out=[],d=new Date();d.setDate(d.getDate()-days+1);for(let i=0;i<days;i++){const k=dayKey(d),v=map[k]||0;out.push([k,v]);d.setDate(d.getDate()+1)}return out}
function bingoLines(){const done=i=>i===12||gp.bingo[i];let lines=0;for(let r=0;r<5;r++)if([0,1,2,3,4].every(c=>done(r*5+c)))lines++;for(let c=0;c<5;c++)if([0,1,2,3,4].every(r=>done(r*5+c)))lines++;if([0,6,12,18,24].every(done))lines++;if([4,8,12,16,20].every(done))lines++;return lines}
function achievements(){const c=statusCounts(),tracked=gp.sessions.reduce((a,s)=>a+s.minutes,0),night=gp.sessions.some(s=>{const h=new Date(s.start).getHours();return h>=23||h<5});return [
 ['🎡','First Spin',state.history.length>=1],['🧭','Backlog Explorer',state.history.length>=25],['⏱','Session Starter',gp.sessions.length>=1],['📆','Habit Forming',gp.sessions.length>=5],['🕙','Ten Tracked Hours',tracked>=600],['🏁','First Finish',c.finished>=1],['🏆','Closer',c.finished>=5],['⭐','Collector of Favorites',state.favs.size>=10],['⚰️','Resurrection',gp.resurrections>=1],['🔥','Daily Streak x3',dailyStreak()>=3],['🟩','Bingo!',bingoLines()>=1],['📚','Curator',Object.keys(gp.collections).length>=1],['🌙','Night Owl',night],['🛋','Marathon',gp.sessions.some(s=>s.minutes>=180)],['❓','Mystery Player',!!gp.flags.mystery]
 ]}
function renderDashboard(root){const c=statusCounts(),tracked=gp.sessions.reduce((a,s)=>a+s.minutes,0),heat=heatData();root.innerHTML=`<div class="meta-grid"><div class="meta-panel"><h4>Finished</h4><div class="meta-kpi">${c.finished}</div><p>${c.playing} currently playing</p></div><div class="meta-panel"><h4>Unplayed</h4><div class="meta-kpi">${c.unplayed}</div><p>${c.tried} tried · ${c.dropped} dropped</p></div><div class="meta-panel"><h4>Tracked time</h4><div class="meta-kpi">${fmtMin(tracked)}</div><p>${gp.sessions.length} app sessions</p></div></div><h3>84-day play heatmap</h3><div class="heatmap">${heat.map(([k,v])=>`<span class="heat" data-level="${v>=180?4:v>=90?3:v>=30?2:v>0?1:0}" title="${k}: ${fmtMin(v)}"></span>`).join('')}</div><h3>Achievements</h3><div class="achievement-grid">${achievements().map(([i,n,u])=>`<div class="achievement ${u?'unlocked':''}"><strong>${i} ${n}</strong><small>${u?'Unlocked':'Locked'}</small></div>`).join('')}</div>`}

/* Bingo */
const BINGO=[
 'Try a never-played game','Play 30+ minutes','Play a 90%+ rated game','Play something Chill','Play something competitive',
 'Play a Souls-like','Play a strategy game','Play multiplayer','Play a Hidden Gem','Finish one game',
 'Resurrect a dropped game','Favorite a new game','FREE SPACE','Play after 11 PM','Play a game under 2h playtime',
 'Play 60+ minutes','Use Mystery Mode','Use Gacha Reveal','Try a Game Jail inmate','Create a custom collection',
 'Play on Handheld mode','Use Wildcard risk','Complete Daily Challenge','Try 3 different games','Do a 2h+ session'
];
function renderBingo(root){root.innerHTML=`<p class="muted">Tap cells as you complete them. The center is free. ${bingoLines()} completed line(s).</p><div class="bingo">${BINGO.map((t,i)=>i===12?`<button class="bingo-cell free">FREE<br>SPACE</button>`:`<button class="bingo-cell ${gp.bingo[i]?'done':''}" data-bingo="${i}">${t}</button>`).join('')}</div><div class="meta-footer-actions"><button class="small-btn" id="bingoReset">Reset card</button></div>`;qa('[data-bingo]').forEach(b=>b.onclick=()=>{gp.bingo[b.dataset.bingo]=!gp.bingo[b.dataset.bingo];gpSave('gpBingo',gp.bingo);renderView('bingo')});q('#bingoReset').onclick=()=>{if(confirm('Reset the whole bingo card?')){gp.bingo={};gpSave('gpBingo',gp.bingo);renderView('bingo')}}}

/* Graveyard */
function droppedGames(){return GAMES.filter(g=>getStatus(g)==='dropped'||(state.feedback[g.appid]?.skip||0)>=3).sort((a,b)=>(state.feedback[b.appid]?.skip||0)-(state.feedback[a.appid]?.skip||0))}
function resurrect(g){state.statuses[g.appid]='tried';save('sbpStatuses',state.statuses);gp.resurrections++;gpSave('gpResurrections',gp.resurrections);toast(`${g.name} resurrected`);renderView('graveyard');renderList();updateStats()}
function renderGraveyard(root){const arr=droppedGames();root.innerHTML=arr.length?arr.map(g=>`<div class="meta-game"><img class="meta-cover" src="${img(g)}"><div><h4>${esc(g.name)}</h4><small class="muted">${state.feedback[g.appid]?.skip||0} skips · ${state.dodges[g.appid]||0} dodges</small></div><div class="meta-game-actions"><button class="small-btn" data-resurrect="${g.appid}">Resurrect</button></div></div>`).join(''):'<div class="empty">Your graveyard is empty.</div>';qa('[data-resurrect]').forEach(b=>b.onclick=()=>resurrect(gameById(b.dataset.resurrect)))}

/* Arcade modes */
function spinAndClose(arr){if(!arr.length){toast('No games match this mode');return}closeMeta();drawWheel(arr);spin(arr)}
function completionCandidates(){return GAMES.filter(g=>g.wheelEligible&&g.hours>=6&&g.hours<=35&&getStatus(g)!=='finished'&&getStatus(g)!=='dropped'&&(meta(g).tags.has('story')||meta(g).session==='long')).sort((a,b)=>b.hours-a.hours).slice(0,40)}
function oneMoreCandidates(){return droppedGames().filter(g=>g.wheelEligible).slice(0,50)}
function bossCandidates(){return GAMES.filter(g=>g.wheelEligible).sort((a,b)=>((state.dodges[b.appid]||0)+(state.feedback[b.appid]?.skip||0)*2)-((state.dodges[a.appid]||0)+(state.feedback[a.appid]?.skip||0)*2)).slice(0,4)}
function renderArcade(root){root.innerHTML=`<div class="meta-grid">
 <div class="meta-panel"><h4>🏁 Completion Roulette</h4><p>Targets substantial story/long-form games you already put time into.</p><button class="small-btn" id="completionRoulette">Spin candidates</button></div>
 <div class="meta-panel"><h4>🧟 One More Chance</h4><p>Dropped and repeatedly skipped games get a chance at redemption.</p><button class="small-btn" id="oneMore">Open redemption wheel</button></div>
 <div class="meta-panel"><h4>⚔ Boss Fight</h4><p>Your four most-dodged games enter a tournament bracket.</p><button class="small-btn" id="bossFight">Start bracket</button></div>
 <div class="meta-panel"><h4>🎴 Gacha Reveal</h4><p>Pick one of three face-down cards and discover your game.</p><button class="small-btn" id="gacha">Draw 3 cards</button></div>
 <div class="meta-panel"><h4>🕶 Blind Pick</h4><p>See clues but not the game's identity before accepting.</p><button class="small-btn" id="blind">Give me clues</button></div>
 <div class="meta-panel"><h4>❓ Mystery Mode</h4><p>No title, no cover, no rating. Accept fate first.</p><button class="small-btn" id="mystery">Enter mystery</button></div>
 <div class="meta-panel"><h4>🤷 I Don't Know</h4><p>Time, energy and learned taste choose for you automatically.</p><button class="spin" id="idk">JUST PICK</button></div>
 </div><div id="arcadeStage"></div>`;
 q('#completionRoulette').onclick=()=>spinAndClose(completionCandidates());q('#oneMore').onclick=()=>{gp.flags.oneMore=true;gpSave('gpFlags',gp.flags);spinAndClose(oneMoreCandidates())};q('#bossFight').onclick=renderBoss;q('#gacha').onclick=renderGacha;q('#blind').onclick=()=>renderBlind(false);q('#mystery').onclick=()=>renderBlind(true);q('#idk').onclick=idkPick;
}
function renderBoss(){const arr=bossCandidates(),s=q('#arcadeStage');if(arr.length<4){toast('Not enough dodged games yet');return}s.innerHTML=`<h3>Boss Fight Bracket</h3><div class="bracket"><div class="bracket-col">${arr.slice(0,2).map(g=>`<div class="bracket-game">${esc(g.name)}</div>`).join('')}</div><div class="bracket-vs">VS</div><div class="bracket-col">${arr.slice(2).map(g=>`<div class="bracket-game">${esc(g.name)}</div>`).join('')}</div></div><button class="spin" id="runBracket">RUN TOURNAMENT</button>`;q('#runBracket').onclick=()=>{const semi1=smartWeight(arr[0])>=smartWeight(arr[1])?arr[0]:arr[1],semi2=smartWeight(arr[2])>=smartWeight(arr[3])?arr[2]:arr[3],winner=Math.random()<smartWeight(semi1)/(smartWeight(semi1)+smartWeight(semi2))?semi1:semi2;s.innerHTML=`<div class="daily-hero"><img src="${img(winner)}"><div><div class="meta-note">BOSS FIGHT WINNER</div><h3>${esc(winner.name)}</h3><p>No more dodging.</p><button class="spin" id="faceBoss">FACE THE BOSS</button></div></div>`;q('#faceBoss').onclick=()=>{closeMeta();choose(winner)}}}
function renderGacha(){const arr=weightedSample(currentPool(),3),s=q('#arcadeStage');if(arr.length<3){toast('Need at least 3 eligible games');return}s.innerHTML=`<h3>Choose one card</h3><div class="gacha-grid">${arr.map((g,i)=>`<button class="gacha-card" data-card="${i}">?</button>`).join('')}</div>`;qa('[data-card]').forEach(b=>b.onclick=()=>{const g=arr[+b.dataset.card];b.classList.add('revealed');b.innerHTML=`<img src="${img(g)}"><h4>${esc(g.name)}</h4>`;qa('[data-card]').forEach(x=>x.disabled=true);setTimeout(()=>{closeMeta();gp.flags.gacha=true;gpSave('gpFlags',gp.flags);choose(g)},850)})}
function blindCandidate(){const a=currentPool();return a.length?a[Math.floor(Math.random()*a.length)]:null}
function renderBlind(mystery){const g=blindCandidate(),s=q('#arcadeStage');if(!g){toast('No eligible games');return}if(mystery){s.innerHTML=`<div class="blind-box"><h2>❓ UNKNOWN GAME</h2><p class="muted">No clues. You only learn what it is after accepting.</p><button class="spin" id="acceptBlind">ACCEPT FATE</button></div>`}else{const m=meta(g),tags=[...m.tags].map(tagLabel);s.innerHTML=`<div class="blind-box"><h2>Blind Pick</h2><span class="clue">${m.session.toUpperCase()} SESSION</span><span class="clue">${g.hours===0?'UNPLAYED':fmtHours(g.hours)}</span><span class="clue">${g.rating?Math.floor(g.rating/5)*5+'%+ rating':'rating unknown'}</span>${tags.slice(0,3).map(t=>`<span class="clue">${t}</span>`).join('')}<div class="meta-footer-actions" style="justify-content:center"><button class="spin" id="acceptBlind">ACCEPT</button><button class="small-btn" id="newBlind">New clues</button></div></div>`}q('#acceptBlind').onclick=()=>{if(mystery){gp.flags.mystery=true;gpSave('gpFlags',gp.flags)}closeMeta();choose(g)};if(q('#newBlind'))q('#newBlind').onclick=()=>renderBlind(false)}
function idkPick(){const scores=tasteScores(),top=Object.entries(scores).sort((a,b)=>b[1]-a[1])[0]?.[0]||'any',h=new Date().getHours();gp.settings.energy=h>=23?'dead':'normal';gpSave('gpSettings',gp.settings);q('#energyLevel').value=gp.settings.energy;if(['souls','strategy','chill','sweat','story','explore','brainoff','multi'].includes(top)){state.mood=top;qa('#moodMode button').forEach(b=>b.classList.toggle('active',b.dataset.value===top))}state.timeMode=h>=22?'60':'any';qa('#timeMode button').forEach(b=>b.classList.toggle('active',b.dataset.value===state.timeMode));closeMeta();updateWheel();setTimeout(()=>spin(),100)}

/* Collections */
function renderCollections(root){const names=Object.keys(gp.collections);root.innerHTML=`<div class="meta-form"><input id="newCollection" placeholder="New collection name"><button class="small-btn" id="createCollection">Create</button></div><div class="collection-list" id="collectionList">${names.map(n=>collectionCard(n)).join('')||'<div class="empty">No collections yet.</div>'}</div><h3>Add a game</h3><div class="meta-form"><select id="collectionTarget">${names.map(n=>`<option>${esc(n)}</option>`).join('')}</select><input id="collectionSearch" placeholder="Search your library"><button class="small-btn" id="addCurrent">Add current pick</button></div><div id="collectionSearchResults"></div>`;
 q('#createCollection').onclick=()=>{const n=q('#newCollection').value.trim();if(!n)return;gp.collections[n]=gp.collections[n]||[];gpSave('gpCollections',gp.collections);renderView('collections')};q('#collectionSearch').oninput=searchCollectionGames;q('#addCurrent').onclick=()=>{if(!state.result){toast('Spin a game first');return}addToCollection(q('#collectionTarget').value,state.result.appid)};qa('[data-spin-collection]').forEach(b=>b.onclick=()=>{const games=(gp.collections[b.dataset.spinCollection]||[]).map(gameById).filter(Boolean);spinAndClose(games)});qa('[data-delete-collection]').forEach(b=>b.onclick=()=>{if(confirm(`Delete ${b.dataset.deleteCollection}?`)){delete gp.collections[b.dataset.deleteCollection];gpSave('gpCollections',gp.collections);renderView('collections')}})}
function collectionCard(n){const ids=gp.collections[n]||[];return `<div class="collection-card"><div class="collection-card-head"><strong>${esc(n)}</strong><div><button class="small-btn" data-spin-collection="${esc(n)}">Spin</button> <button class="small-btn" data-delete-collection="${esc(n)}">Delete</button></div></div><div class="collection-games">${ids.slice(0,16).map(id=>`<span>${esc(gameById(id)?.name||id)}</span>`).join('')}${ids.length>16?`<span>+${ids.length-16}</span>`:''}</div></div>`}
function addToCollection(name,id){if(!name){toast('Create a collection first');return}const a=new Set(gp.collections[name]||[]);a.add(+id);gp.collections[name]=[...a];gpSave('gpCollections',gp.collections);toast('Added to collection');renderView('collections')}
function searchCollectionGames(){const term=q('#collectionSearch').value.toLowerCase().trim(),out=q('#collectionSearchResults');if(term.length<2){out.innerHTML='';return}const hits=GAMES.filter(g=>g.name.toLowerCase().includes(term)).slice(0,10);out.innerHTML=hits.map(g=>`<div class="meta-row"><span>${esc(g.name)}</span><button class="small-btn" data-add-search="${g.appid}">Add</button></div>`).join('');qa('[data-add-search]').forEach(b=>b.onclick=()=>addToCollection(q('#collectionTarget').value,b.dataset.addSearch))}

/* Backup / sync / PWA */
function profileData(){const data={version:2,exportedAt:new Date().toISOString(),storage:{}};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k.startsWith('sbp')||k.startsWith('gp'))data.storage[k]=localStorage.getItem(k)}return data}
function encodeProfile(){return btoa(unescape(encodeURIComponent(JSON.stringify(profileData()))))}
function importProfile(data){if(!data?.storage)throw new Error('Invalid profile');Object.entries(data.storage).forEach(([k,v])=>localStorage.setItem(k,v));location.hash='';location.reload()}
function exportProfile(){const blob=new Blob([JSON.stringify(profileData(),null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`game-picker-profile-${dayKey()}.json`;a.click();URL.revokeObjectURL(a.href)}
function renderBackup(root){root.innerHTML=`<div class="meta-grid"><div class="meta-panel"><h4>📲 Install as App</h4><p>PWA support caches the picker, game data and UI for offline use.</p><button class="small-btn" id="installApp">Install / Add to Home</button></div><div class="meta-panel"><h4>🚢 Offline / Ship Mode</h4><p>Removes multiplayer picks and keeps the local decision engine usable without internet.</p><button class="small-btn" id="shipMode">${gp.settings.shipMode?'Disable':'Enable'} Ship Mode</button></div><div class="meta-panel"><h4>💾 Profile backup</h4><p>Favorites, pins, learning, sessions, status, bingo and collections.</p><button class="small-btn" id="exportProfile">Export JSON</button> <label class="small-btn">Import JSON<input id="importProfile" type="file" accept="application/json" hidden></label></div></div><h3>Cross-device Sync Link</h3><p class="muted">No account or backend required: the profile is embedded in the link fragment and never sent to GitHub Pages. Large profiles can create long links.</p><textarea class="sync-box" id="syncBox" readonly></textarea><div class="meta-footer-actions"><button class="small-btn" id="makeSync">Generate Sync Link</button><button class="small-btn" id="copySync">Copy</button></div><div class="meta-note">True automatic cloud sync would require a signed-in backend or a user-authorized service. This link gives you private manual phone ↔ PC transfer without storing your profile on a server.</div>`;
 q('#installApp').onclick=installApp;q('#shipMode').onclick=()=>{gp.settings.shipMode=!gp.settings.shipMode;gpSave('gpSettings',gp.settings);syncShipClass();updateWheel();renderView('backup')};q('#exportProfile').onclick=exportProfile;q('#importProfile').onchange=async e=>{try{const txt=await e.target.files[0].text();importProfile(JSON.parse(txt))}catch(err){alert('Import failed: '+err.message)}};q('#makeSync').onclick=()=>{try{q('#syncBox').value=`${location.origin}${location.pathname}#sync=${encodeProfile()}`}catch(e){toast('Profile is too large for a sync link; use JSON export.')}};q('#copySync').onclick=async()=>{if(!q('#syncBox').value)q('#makeSync').click();await navigator.clipboard.writeText(q('#syncBox').value);toast('Sync link copied')}
}
async function installApp(){if(installPrompt){installPrompt.prompt();await installPrompt.userChoice;installPrompt=null}else toast('Use your browser menu → Add to Home screen / Install app')}

/* Random events */
function maybeRandomEvent(){const n=state.history.length;if(!n||n%10!==0)return;const fired=gpLoad('gpEventsFired',[]);if(fired.includes(n))return;fired.push(n);gpSave('gpEventsFired',fired);const events=[['rating','RATING RUSH: next 3 picks are 90%+'],['forgotten','ARCHAEOLOGY EVENT: next 3 picks favor forgotten games'],['jail','JAILBREAK: next pick comes from Game Jail']];let [type,msg]=events[Math.floor(Math.random()*events.length)];if(type==='jail'&&!GAMES.some(g=>(state.dodges[g.appid]||0)>=5))[type,msg]=events[0];gp.settings.randomEvent={type,remaining:type==='jail'?1:3};gpSave('gpSettings',gp.settings);toast('⚡ '+msg);updateWheel()}
function afterPick(g){
  maybeRandomEvent();const ev=gp.settings.randomEvent;if(ev){ev.remaining--;if(ev.remaining<=0)gp.settings.randomEvent=null;gpSave('gpSettings',gp.settings)}
  const a=activeSession();if(a&&a.appid===g.appid)return;
}
try{const originalChoose=choose;choose=function(g,opts={}){const r=originalChoose(g,opts);setTimeout(()=>afterPick(g),0);return r}}catch{}

/* Events */
function bindEvents(){
  document.addEventListener('click',e=>{
    const mb=e.target.closest('[data-meta]');if(mb){openMeta(mb.dataset.meta);return}
    const mod=e.target.closest('[data-mod]');if(mod){toggleModifier(mod.dataset.mod);return}
    if(e.target.id==='metaClose'||e.target.id==='metaModal')closeMeta();
    if(e.target.matches('[data-feedback="play"]')&&state.result)setTimeout(()=>startSession(state.result),0);
  });
  q('#sessionStop').onclick=stopSession;q('#whyBtn').onclick=()=>openMeta('why');q('#launchSteam').onclick=()=>launchSteam();
  q('#energyLevel').onchange=e=>{gp.settings.energy=e.target.value;gpSave('gpSettings',gp.settings);updateWheel()};q('#deviceMode').onchange=e=>{gp.settings.device=e.target.value;gpSave('gpSettings',gp.settings);updateWheel()};
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e});
}
function importHash(){if(!location.hash.startsWith('#sync='))return;try{const raw=location.hash.slice(6),data=JSON.parse(decodeURIComponent(escape(atob(raw))));if(confirm('Import Game Picker profile from this sync link?'))importProfile(data);else history.replaceState(null,'',location.pathname)}catch{history.replaceState(null,'',location.pathname)}}

injectUI();bindEvents();importHash();
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
try{updateWheel()}catch{}
})();
