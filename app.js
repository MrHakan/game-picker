const GAMES=window.GAMES||[];
const STATS=window.STATS||{count:GAMES.length,hours:0,unplayed:0,under2:0};
const TIER_LABEL={must:'MUST PLAY',taste:'Definitely your taste',try:'Try it',skip:'Probably skip',played:'Played enough'};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const DAY=86400000;
const load=(k,f)=>{try{let v=JSON.parse(localStorage.getItem(k));return v??f}catch{return f}};
const save=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
const state={
  tab:'must',angle:0,result:null,draft:[],draftFinal:false,
  favs:new Set(load('sbpFavs',[])),pins:new Set(load('sbpPins',[])),history:load('sbpHistory',[]),
  feedback:load('sbpFeedback',{}),statuses:load('sbpStatuses',{}),cooldowns:load('sbpCooldowns',{}),dodges:load('sbpDodges',{}),
  commitment:load('sbpCommitment',null),timeMode:'any',mood:'any'
};

const WORDS={
  souls:['dark souls','elden ring','lies of p','nioh','blasphemous','hollow knight','salt and sanctuary','lords of the fallen','mortal shell','remnant','sekiro','souls'],
  strategy:['hearts of iron','age of empires','civilization','total war','company of heroes','rimworld','manor lords','crusader kings','europa universalis','stellaris','xcom','warhammer 40,000: rogue trader','dyson sphere','factorio','satisfactory','frostpunk','planetary annihilation','star wars™ empire at war'],
  medieval:['mount & blade','mordhau','kingdom come','chivalry','medieval','manor lords','crusader kings','bannerlord','warband'],
  sandbox:['minecraft','terraria','garry','stormworks','astroneer','space engineers','beamng','kenshi','rimworld','satisfactory','factorio','no man','teardown','scrap mechanic','project zomboid','starbound'],
  story:['detroit','road 96','life is strange','soma','dishonored','bioshock','witcher','mass effect','cyberpunk','red dead','yakuza','persona','final fantasy','metal gear','tomb raider','half-life','portal','stray','undertale','ori','firewatch','walking dead','disco elysium','alan wake','control','plague tale','the alters'],
  chill:['euro truck','stardew','tiny terraces','astroneer','slime rancher','house flipper','powerwash','dorfromantik','unpacking','townscaper','cities: skylines','planet zoo','planet coaster','farming simulator','a short hike','abzu'],
  sweat:['counter-strike','pubg','tarkov','mordhau','brawlhalla','marvel rivals','paladins','team fortress','battlefield','rainbow six','apex','dead by daylight','for honor','rocket league'],
  brainoff:['brotato','vampire survivors','deep rock galactic: survivor','megabonk','bloons','balatro','holocure','20 minutes till dawn','risk of rain','muse dash','brotato'],
  explore:['skyrim','oblivion','fallout','no man','subnautica','outer wilds','witcher','elden ring','kenshi','astroneer','sea of thieves','tomb raider','assassin','horizon','dying light','stalker','metro','dragon age','kingdom come'],
  multi:['team fortress','pubg','mordhau','arc raiders','paladins','sea of thieves','brawlhalla','warframe','battlefield','marvel rivals','deep rock','r.e.p.o.','stick fight','town of salem','left 4 dead','payday','helldivers','rocket league','counter-strike','terraria']
};
const LONGFORM=[...WORDS.strategy,...WORDS.story,...WORDS.explore,'path of exile','elder scrolls','fallout','divinity','baldur','dragon age','persona','final fantasy','mass effect','warhammer 40,000: rogue trader','kenshi'];
const QUICK=[...WORDS.brainoff,...WORDS.sweat,'portal','half-life','brawlhalla','stick fight','town of salem','left 4 dead','r.e.p.o.'];
const has=(name,list)=>{name=name.toLowerCase();return list.some(x=>name.includes(x))};
function meta(g){
  const n=g.name.toLowerCase(),tags=new Set();
  for(const [tag,list] of Object.entries(WORDS)) if(has(n,list)) tags.add(tag);
  if(g.coop) tags.add('multi');
  if(/simulator|truck|farming|builder|factory|planet|city|cities/.test(n)) tags.add('chill');
  if(/souls|elden|nioh|blasphem|remnant|hollow knight/.test(n)) tags.add('souls');
  let session=has(n,QUICK)?'quick':has(n,LONGFORM)?'long':'medium';
  let archaeology=(g.hours<1?25:0)+(g.appid<600000?18:g.appid<1200000?8:0)+(g.rating>=85?6:0);
  return {tags,session,archaeology};
}
function img(g){return `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/header.jpg`}
function fmtHours(h){if(!h)return 'Unplayed';if(h<1)return `${Math.max(1,Math.round(h*60))}m`;return `${h.toFixed(h<10?1:0)}h`}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]))}
function baselineStatus(g){return g.hours===0?'unplayed':g.hours>=10?'playing':'tried'}
function getStatus(g){return state.statuses[g.appid]||baselineStatus(g)}
function isCooling(g){let until=state.cooldowns[g.appid]||0;if(until&&until<Date.now()){delete state.cooldowns[g.appid];save('sbpCooldowns',state.cooldowns);return false}return until>Date.now()}
function recentIds(){let n=+$('#recentProtection').value||0;return new Set(state.history.slice(0,n).map(x=>x.appid))}
function matchesPlay(g,v){return v==='all'||(v==='unplayed'&&g.hours===0)||(v==='under2'&&g.hours<2)||(v==='under5'&&g.hours<5)||(v==='under10'&&g.hours<10)}
function matchesTime(g){if(state.timeMode==='any')return true;let s=meta(g).session;if(state.timeMode==='30')return s==='quick';if(state.timeMode==='60')return s!=='long';if(state.timeMode==='180')return s!=='quick'||g.hours<10;return s==='long'||g.hours>=5}
function matchesMood(g){if(state.mood==='any')return true;return meta(g).tags.has(state.mood)}
function specialMatch(g){let m=$('#specialMode').value;if(m==='none')return true;if(m==='hidden')return g.hours<2&&(g.rating||0)>=88;if(m==='finish')return g.hours>=1&&g.hours<=10;if(m==='archaeology')return g.hours<1&&meta(g).archaeology>=25;return true}
function currentPool(){
  const risk=$('#riskLevel').value,recent=recentIds(),min=+$('#ratingFilter').value||0,pf=$('#playFilter').value,tf=$('#tierFilter').value;
  return GAMES.filter(g=>{
    if(!g.wheelEligible||isCooling(g))return false;
    if($('#favoritesOnly').checked&&!state.favs.has(g.appid))return false;
    if($('#pinnedOnly').checked&&!state.pins.has(g.appid))return false;
    if($('#coopOnly').checked&&!meta(g).tags.has('multi'))return false;
    if(recent.has(g.appid))return false;
    if(risk==='chaos')return true;
    if(!matchesPlay(g,pf)||!matchesTime(g)||!matchesMood(g)||!specialMatch(g))return false;
    if(g.rating!=null&&g.rating<min)return false;
    if(tf!=='all'&&g.tier!==tf)return false;
    if(risk==='safe'&&((g.rating||0)<82||g.score<58))return false;
    return true;
  });
}
function behaviorDelta(g){let f=state.feedback[g.appid]||{};return (f.play||0)*8+(f.love||0)*22-(f.skip||0)*12-(f.notToday||0)*5}
function smartWeight(g){
  let risk=$('#riskLevel').value,base=Math.max(3,(g.score||50)-42),rating=(g.rating||70)-65,learn=behaviorDelta(g),w=base+rating*.35+learn;
  if(state.pins.has(g.appid))w+=18;if(state.favs.has(g.appid))w+=10;if((state.dodges[g.appid]||0)>=5)w+=12;
  if(risk==='safe')w+=(g.rating||0)*.18+g.score*.2;
  if(risk==='wildcard')w=Math.max(4,55-w)+(g.hours<2?15:0);
  if(risk==='chaos')w=1;
  if($('#specialMode').value==='archaeology')w+=meta(g).archaeology;
  return Math.max(1,w);
}
function shuffled(arr){let out=[...arr];for(let i=out.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]]}return out}
function weightedSample(arr,n){if(!Number.isFinite(n)||n>=arr.length)return shuffled(arr);let pool=[...arr],out=[];while(out.length<n&&pool.length){let ws=pool.map(g=>$('#weighted').checked?smartWeight(g):1),total=ws.reduce((a,b)=>a+b,0),r=Math.random()*total,idx=0;for(;idx<pool.length;idx++){r-=ws[idx];if(r<=0)break}out.push(pool.splice(Math.min(idx,pool.length-1),1)[0])}return out}
function requestedWheelSize(len){let v=$('#wheelSize').value;return v==='all'?len:Math.min(len,+v)}
function wheelGames(){let pool=currentPool();return weightedSample(pool,requestedWheelSize(pool.length))}
let visibleWheel=[];
function themeColors(i){let t=$('#themeSelect').value;if(t==='bonfire')return [`hsl(${18+(i%5)*6} 70% ${20+(i%2)*7}%)`,'#8b451d'];if(t==='casino')return [i%2?'#173b2b':'#5b1520','#d6b85d'];if(t==='retro')return [`hsl(${280+(i%6)*20} 70% ${25+(i%2)*9}%)`,'#38f6ff'];return [`hsl(${196+(i%6)*7} 45% ${18+(i%2)*5}%)`,'#335369']}
function drawWheel(custom){
  visibleWheel=custom||wheelGames();let c=$('#wheel'),ctx=c.getContext('2d'),W=c.width,H=c.height,cx=W/2,cy=H/2,R=W*.47;ctx.clearRect(0,0,W,H);
  if(!visibleWheel.length){ctx.fillStyle='#13202a';ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.fill();ctx.fillStyle='#91a9ba';ctx.textAlign='center';ctx.font='700 28px system-ui';ctx.fillText('No games match filters',cx,cy);return}
  let n=visibleWheel.length,step=Math.PI*2/n,showLabels=n<=80;
  for(let i=0;i<n;i++){let a0=-Math.PI/2+i*step,a1=a0+step,[fill,stroke]=themeColors(i);ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,R,a0,a1);ctx.closePath();ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=stroke;ctx.lineWidth=n>300?.3:n>150?.5:n>80?.8:2;ctx.stroke();if(showLabels){ctx.save();ctx.translate(cx,cy);ctx.rotate(a0+step/2);ctx.textAlign='right';ctx.fillStyle='#f5fbff';ctx.font=`700 ${n>50?9:n>30?12:n>20?15:18}px system-ui`;let label=visibleWheel[i].name,max=n>50?18:n>30?24:34;if(label.length>max)label=label.slice(0,max-1)+'…';ctx.fillText(label,R-20,4);ctx.restore()}}
}

let audioCtx,lastTick=0;
function tone(freq=440,d=.045,vol=.035,type='sine'){if(!$('#soundEnabled').checked)return;audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();let o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.value=freq;g.gain.value=vol;o.connect(g);g.connect(audioCtx.destination);o.start();g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+d);o.stop(audioCtx.currentTime+d)}
function successSound(){tone(523,.09,.045,'triangle');setTimeout(()=>tone(659,.1,.045,'triangle'),80);setTimeout(()=>tone(784,.16,.05,'triangle'),165)}
function tickSound(now){if(now-lastTick>70){tone(1250,.025,.012,'square');lastTick=now}}
function weightedIndex(arr){if(!$('#weighted').checked||$('#riskLevel').value==='chaos')return Math.floor(Math.random()*arr.length);let ws=arr.map(smartWeight),t=ws.reduce((a,b)=>a+b,0),r=Math.random()*t;for(let i=0;i<ws.length;i++){r-=ws[i];if(r<=0)return i}return arr.length-1}
function controlsLocked(){return state.commitment&&state.commitment.until>Date.now()}
function spin(customGames,opts={}){
  if(controlsLocked()&&!opts.commitmentBypass)return;if(customGames)drawWheel(customGames);if(!visibleWheel.length)return;
  $('#spin').disabled=true;$('#randomize').disabled=true;$('#draftBtn').disabled=true;$('#result').classList.remove('show');let idx=weightedIndex(visibleWheel),step=360/visibleWheel.length,target=360-(idx*step+step/2),extra=360*(5+Math.floor(Math.random()*3)),start=state.angle,end=start+extra+((target-(start%360)+360)%360),dur=4200,t0=performance.now();
  function ease(t){return 1-Math.pow(1-t,4)}
  function frame(now){let p=Math.min(1,(now-t0)/dur);state.angle=start+(end-start)*ease(p);$('#wheel').style.transform=`rotate(${state.angle}deg)`;tickSound(now);if(p<1)requestAnimationFrame(frame);else{state.angle=end;choose(visibleWheel[idx],opts);if(!controlsLocked()){$('#spin').disabled=false;$('#randomize').disabled=false;$('#draftBtn').disabled=false}}}
  requestAnimationFrame(frame)
}
function flags(g){let out=[];if((state.dodges[g.appid]||0)>=5)out.push('🚔 YOU KEEP DODGING THIS');if(state.pins.has(g.appid))out.push('📌 PINNED');if(state.favs.has(g.appid))out.push('★ FAVORITE');if(getStatus(g)==='finished')out.push('✓ FINISHED');return out}
function choose(g,opts={}){
  state.result=g;$('#resultImg').style.visibility='visible';$('#resultImg').src=img(g);$('#resultImg').onerror=e=>e.currentTarget.style.visibility='hidden';$('#resultName').textContent=g.name;$('#resultMeta').textContent=`${fmtHours(g.hours)} · ${g.rating?g.rating.toFixed(2)+'%':'No rating'} · ${TIER_LABEL[g.tier]} · smart ${Math.round(smartWeight(g))}`;$('#resultFlags').innerHTML=flags(g).map(x=>`<span>${x}</span>`).join('');$('#result').classList.add('show');$('#feedbackBar').classList.add('show');$('#statusSelect').value=getStatus(g);$('#pinResult').classList.toggle('active',state.pins.has(g.appid));
  state.history.unshift({appid:g.appid,name:g.name,at:new Date().toISOString()});state.history=state.history.slice(0,100);save('sbpHistory',state.history);renderHistory();
  if($('#noReroll').checked&&!opts.draft){state.commitment={appid:g.appid,name:g.name,until:Date.now()+30*60000};save('sbpCommitment',state.commitment);syncCommitment()}
  successSound();showReveal(g,opts.draft?'FINAL DRAFT PICK':undefined);confetti();updateStats();renderJail()
}
function dodge(g){if(!g)return;state.dodges[g.appid]=(state.dodges[g.appid]||0)+1;save('sbpDodges',state.dodges);renderJail()}
function feedback(kind){let g=state.result;if(!g)return;let f=state.feedback[g.appid]||{play:0,love:0,skip:0,notToday:0};f[kind]=(f[kind]||0)+1;state.feedback[g.appid]=f;save('sbpFeedback',state.feedback);if(kind==='play')setStatus(g,'playing');if(kind==='love')setStatus(g,'finished');if(kind==='skip'){dodge(g);setStatus(g,'dropped')}if(kind==='notToday'){dodge(g);let days=+$('#cooldownDuration').value||7;state.cooldowns[g.appid]=Date.now()+days*DAY;save('sbpCooldowns',state.cooldowns);$('#resultMeta').textContent+=` · cooldown ${days}d`;updateWheel()}renderList();updateStats()}
function setStatus(g,status){state.statuses[g.appid]=status;save('sbpStatuses',state.statuses);$('#statusSelect').value=status;renderProgress();renderList()}
function togglePin(g){if(!g)return;state.pins.has(g.appid)?state.pins.delete(g.appid):state.pins.add(g.appid);save('sbpPins',[...state.pins]);$('#pinResult').classList.toggle('active',state.pins.has(g.appid));renderList();updateWheel()}

function renderProgress(){let trackedUnplayed=GAMES.filter(g=>g.hours===0&&getStatus(g)==='unplayed').length,done=STATS.unplayed-trackedUnplayed,pct=STATS.unplayed?done/STATS.unplayed*100:0;$('#sProgress').textContent=`${STATS.unplayed} → ${trackedUnplayed}`;$('#progressFill').style.width=`${pct}%`;$('#progressLabel').textContent=`${done} moved · ${trackedUnplayed} left`}
function tierCounts(){let o={all:GAMES.length};for(const g of GAMES)o[g.tier]=(o[g.tier]||0)+1;return o}
function renderTabs(){let c=tierCounts(),tabs=[['must','MUST PLAY'],['taste','YOUR TASTE'],['try','TRY'],['skip','SKIP'],['played','PLAYED ENOUGH'],['all','ALL']];$('#tabs').innerHTML=tabs.map(([k,v])=>`<button class="tab ${state.tab===k?'active':''}" data-tab="${k}">${v} · ${c[k]||0}</button>`).join('');$$('.tab').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;renderTabs();renderList()})}
function filteredList(){let q=$('#search').value.trim().toLowerCase();return GAMES.filter(g=>(state.tab==='all'||g.tier===state.tab)&&(!q||g.name.toLowerCase().includes(q))).sort((a,b)=>smartWeight(b)-smartWeight(a)||((b.rating||0)-(a.rating||0)))}
function renderList(){let arr=filteredList();$('#list').innerHTML=arr.length?arr.map(g=>{let jailed=(state.dodges[g.appid]||0)>=5,cooling=isCooling(g),status=getStatus(g);return `<div class="game ${jailed?'jailed':''}"><img class="cover" loading="lazy" src="${img(g)}" onerror="this.style.visibility='hidden'"><div><div class="gtitle">${esc(g.name)}</div><div class="sub"><span class="badge ${g.tier}">${TIER_LABEL[g.tier]}</span> · ${status}${jailed?' · 🚔 jail':''}${cooling?' · ⏳ cooldown':''}</div></div><div class="hours">${fmtHours(g.hours)}</div><div class="rating">${g.rating?g.rating.toFixed(1)+'%':'—'}</div><div class="score">${Math.round(smartWeight(g))}</div><button class="pin ${state.pins.has(g.appid)?'on':''}" data-pin="${g.appid}" title="Pin">📌</button><button class="star ${state.favs.has(g.appid)?'on':''}" data-id="${g.appid}" title="Favorite">★</button></div>`}).join(''):`<div class="empty">Nothing here.</div>`;
  $$('.star').forEach(b=>b.onclick=()=>{let id=+b.dataset.id;state.favs.has(id)?state.favs.delete(id):state.favs.add(id);save('sbpFavs',[...state.favs]);renderList();updateWheel()});$$('.pin').forEach(b=>b.onclick=()=>togglePin(GAMES.find(g=>g.appid===+b.dataset.pin)))
}
function renderHistory(){let h=state.history;$('#historyList').innerHTML=h.length?h.map(x=>`<div class="history-row"><span>${esc(x.name)}</span><small>${new Date(x.at).toLocaleString()}</small></div>`).join(''):'<div class="empty">No spins yet.</div>'}
function renderJail(){let arr=GAMES.filter(g=>(state.dodges[g.appid]||0)>=5).sort((a,b)=>(state.dodges[b.appid]||0)-(state.dodges[a.appid]||0));$('#jailCount').textContent=arr.length;$('#jailList').innerHTML=arr.length?arr.map(g=>`<div class="jail-row"><img src="${img(g)}"><div><b>${esc(g.name)}</b><small>${state.dodges[g.appid]} dodges · sentence active</small></div><button class="small-btn" data-jail-spin="${g.appid}">Face it</button></div>`).join(''):`<div class="empty">Nobody is in jail yet. Keep rerolling. 😈</div>`;$$('[data-jail-spin]').forEach(b=>b.onclick=()=>{let g=GAMES.find(x=>x.appid===+b.dataset.jailSpin);closeModal('jailModal');drawWheel([g]);spin([g])})}
function updateStats(){let pool=currentPool(),wc=requestedWheelSize(pool.length),all=$('#wheelSize').value==='all';$('#sGames').textContent=STATS.count.toLocaleString();$('#sHours').textContent=STATS.hours.toLocaleString(undefined,{maximumFractionDigits:1});$('#sPool').textContent=wc.toLocaleString();$('#poolText').textContent=all?`${pool.length} eligible games · every eligible game is on the wheel.`:`${pool.length} eligible games · ${wc} sampled for this wheel.`;renderProgress();renderDecisionSummary()}
function updateWheel(){updateStats();drawWheel()}
function renderDecisionSummary(){let parts=[];if(state.timeMode!=='any')parts.push(state.timeMode==='night'?'All Night':state.timeMode==='180'?'2–3h':state.timeMode+'m');if(state.mood!=='any')parts.push(state.mood);parts.push($('#riskLevel').selectedOptions[0].text);if($('#specialMode').value!=='none')parts.push($('#specialMode').selectedOptions[0].text);$('#decisionSummary').textContent=parts.join(' · ')}

function draft(){let pool=currentPool(),three=weightedSample(pool,3);if(three.length<2)return;state.draft=three;$('#draftGrid').innerHTML=three.map((g,i)=>`<div class="draft-game"><span>#${i+1}</span><img src="${img(g)}"><h4>${esc(g.name)}</h4><small>${fmtHours(g.hours)} · ${g.rating?g.rating.toFixed(1)+'%':'—'}</small></div>`).join('');openModal('draftModal')}
$('#finalSpin').onclick=()=>{if(!state.draft.length)return;closeModal('draftModal');drawWheel(state.draft);spin(state.draft,{draft:true})};

function applyPreset(v){if(!v)return;$('#specialMode').value='none';$('#coopOnly').checked=false;state.timeMode='any';state.mood='any';if(v==='souls'){state.mood='souls';$('#riskLevel').value='balanced';$('#ratingFilter').value=70}else if(v==='strategy'){state.mood='any';$('#riskLevel').value='balanced';$('#ratingFilter').value=75;$('#specialMode').value='none'}else if(v==='medieval'){state.mood='any';$('#riskLevel').value='balanced';$('#ratingFilter').value=70}else if(v==='sandbox'){state.mood='explore';$('#riskLevel').value='balanced'}else if(v==='story'){state.mood='story';state.timeMode='night'}else if(v==='coop'){state.mood='multi';$('#coopOnly').checked=true}else if(v==='hidden'){$('#specialMode').value='hidden';$('#ratingFilter').value=88;$('#playFilter').value='under2'}syncSegments();updateWheel()}
function presetFilter(g){let p=$('#presetSelect').value,n=g.name.toLowerCase();if(!p)return true;if(p==='souls')return meta(g).tags.has('souls');if(p==='strategy')return meta(g).tags.has('strategy');if(p==='medieval')return meta(g).tags.has('medieval');if(p==='sandbox')return meta(g).tags.has('sandbox');if(p==='story')return meta(g).tags.has('story');if(p==='coop')return meta(g).tags.has('multi');return true}
const baseCurrentPool=currentPool;
currentPool=function(){return baseCurrentPool().filter(presetFilter)};

function openModal(id){$('#'+id).classList.add('show')}function closeModal(id){$('#'+id).classList.remove('show')}
function showReveal(g,kicker){$('#revealKicker').textContent=kicker||"TONIGHT'S PICK";$('#revealImg').src=img(g);$('#revealName').textContent=g.name;$('#revealMeta').textContent=`${fmtHours(g.hours)} · ${g.rating?g.rating.toFixed(1)+'% SteamDB':'No rating'}`;$('#reveal').classList.add('show');setTimeout(()=>$('#reveal').classList.remove('show'),3200)}
function confetti(){let c=$('#confettiCanvas'),ctx=c.getContext('2d'),dpr=devicePixelRatio||1;c.width=innerWidth*dpr;c.height=innerHeight*dpr;c.style.width=innerWidth+'px';c.style.height=innerHeight+'px';ctx.scale(dpr,dpr);let ps=Array.from({length:90},()=>({x:innerWidth/2+(Math.random()-.5)*180,y:innerHeight*.24,vx:(Math.random()-.5)*9,vy:-2-Math.random()*7,g:.16+Math.random()*.1,s:4+Math.random()*7,h:Math.random()*360,r:Math.random()*6.28})),start=performance.now();function f(now){ctx.clearRect(0,0,innerWidth,innerHeight);ps.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.vy+=p.g;p.r+=.12;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.r);ctx.fillStyle=`hsl(${p.h} 80% 58%)`;ctx.fillRect(-p.s/2,-p.s/3,p.s,p.s*.66);ctx.restore()});if(now-start<2200)requestAnimationFrame(f);else ctx.clearRect(0,0,innerWidth,innerHeight)}requestAnimationFrame(f)}
function shareResult(){let g=state.result;if(!g)return;let c=document.createElement('canvas');c.width=1200;c.height=630;let x=c.getContext('2d'),grad=x.createLinearGradient(0,0,1200,630);grad.addColorStop(0,'#0b1722');grad.addColorStop(1,'#173d58');x.fillStyle=grad;x.fillRect(0,0,1200,630);x.fillStyle='#66c0f4';x.font='800 28px system-ui';x.fillText('STEAM BACKLOG PICKER',70,82);x.fillStyle='#fff';x.font='900 64px system-ui';wrapText(x,g.name,70,200,1050,76);x.fillStyle='#a9bed0';x.font='600 30px system-ui';x.fillText(`${fmtHours(g.hours)}  •  ${g.rating?g.rating.toFixed(1)+'% SteamDB':'No rating'}  •  ${TIER_LABEL[g.tier]}`,70,470);x.fillStyle='#65d4ff';x.font='800 26px system-ui';x.fillText('Tonight, we play this.',70,555);c.toBlob(async blob=>{let file=new File([blob],`game-picker-${g.appid}.png`,{type:'image/png'});if(navigator.canShare&&navigator.canShare({files:[file]})){try{await navigator.share({files:[file],title:`Tonight: ${g.name}`});return}catch{}}let a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)},'image/png')}
function wrapText(ctx,text,x,y,maxWidth,lineHeight){let words=text.split(' '),line='',lines=[];for(let w of words){let test=line+w+' ';if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=w+' '}else line=test}lines.push(line);lines.slice(0,3).forEach((l,i)=>ctx.fillText(l.trim(),x,y+i*lineHeight))}
function syncCommitment(){if(state.commitment&&state.commitment.until<=Date.now()){state.commitment=null;localStorage.removeItem('sbpCommitment')}let active=controlsLocked();$('#commitmentBar').classList.toggle('show',active);if(active){let sec=Math.ceil((state.commitment.until-Date.now())/1000),m=Math.floor(sec/60),s=sec%60;$('#commitmentText').textContent=`${state.commitment.name} · ${m}:${String(s).padStart(2,'0')} remaining`;$('#spin').disabled=true;$('#randomize').disabled=true;$('#reroll').disabled=true;$('#draftBtn').disabled=true}else{$('#reroll').disabled=false;$('#draftBtn').disabled=false;$('#spin').disabled=false;$('#randomize').disabled=false}}
setInterval(syncCommitment,1000);
function syncSegments(){$$('#timeMode button').forEach(b=>b.classList.toggle('active',b.dataset.value===state.timeMode));$$('#moodMode button').forEach(b=>b.classList.toggle('active',b.dataset.value===state.mood))}
function resetDecision(){state.timeMode='any';state.mood='any';$('#riskLevel').value='balanced';$('#specialMode').value='none';$('#recentProtection').value='10';$('#presetSelect').value='';$('#playFilter').value='under2';$('#ratingFilter').value='80';$('#tierFilter').value='all';$('#favoritesOnly').checked=false;$('#pinnedOnly').checked=false;$('#coopOnly').checked=false;syncSegments();updateWheel()}

$$('#timeMode button').forEach(b=>b.onclick=()=>{state.timeMode=b.dataset.value;syncSegments();updateWheel()});$$('#moodMode button').forEach(b=>b.onclick=()=>{state.mood=b.dataset.value;syncSegments();updateWheel()});
['playFilter','ratingFilter','tierFilter','wheelSize','favoritesOnly','pinnedOnly','coopOnly','weighted','riskLevel','specialMode','recentProtection'].forEach(id=>$('#'+id).addEventListener('change',updateWheel));
$('#ratingFilter').addEventListener('input',updateWheel);$('#themeSelect').onchange=()=>{document.body.dataset.theme=$('#themeSelect').value;drawWheel()};$('#presetSelect').onchange=()=>applyPreset($('#presetSelect').value);$('#search').addEventListener('input',renderList);
$('#spin').onclick=()=>spin();$('#randomize').onclick=()=>{if(controlsLocked())return;$('#result').classList.remove('show');$('#feedbackBar').classList.remove('show');drawWheel();updateStats()};$('#reroll').onclick=()=>{if(controlsLocked())return;dodge(state.result);drawWheel();spin()};$('#draftBtn').onclick=draft;$('#pinnedWheelBtn').onclick=()=>{$('#pinnedOnly').checked=true;updateWheel()};
$('#openSteam').onclick=()=>state.result&&window.open(`https://store.steampowered.com/app/${state.result.appid}/`,'_blank');$('#pinResult').onclick=()=>togglePin(state.result);$('#shareResult').onclick=shareResult;$('#statusSelect').onchange=()=>state.result&&setStatus(state.result,$('#statusSelect').value);$$('[data-feedback]').forEach(b=>b.onclick=()=>feedback(b.dataset.feedback));
$('#resetBtn').onclick=()=>{$('#search').value='';state.tab='must';resetDecision();renderTabs();renderList()};$('#historyBtn').onclick=()=>openModal('historyModal');$('#jailBtn').onclick=()=>{renderJail();openModal('jailModal')};$$('[data-close]').forEach(b=>b.onclick=()=>closeModal(b.dataset.close));$$('.modal').forEach(m=>m.onclick=e=>{if(e.target===m)closeModal(m.id)});$('#clearHistory').onclick=()=>{state.history=[];save('sbpHistory',[]);renderHistory();updateWheel()};$('#revealClose').onclick=()=>$('#reveal').classList.remove('show');
document.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))return;if(e.code==='Space'){e.preventDefault();spin()}else if(e.key.toLowerCase()==='r')$('#randomize').click();else if(e.key.toLowerCase()==='f'&&state.result){state.favs.has(state.result.appid)?state.favs.delete(state.result.appid):state.favs.add(state.result.appid);save('sbpFavs',[...state.favs]);renderList();updateWheel()}});

renderTabs();renderList();renderHistory();renderJail();syncSegments();syncCommitment();updateWheel();