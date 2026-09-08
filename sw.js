const CACHE='game-picker-v3';
const RUNTIME='game-picker-runtime-v1';
const CORE=[
  './','./index.html','./styles.css','./mobile.css','./mode-visuals.css','./meta-features.css',
  './app.js','./meta-features.js','./stats.js','./manifest.webmanifest','./icon.svg',
  './data-01.js','./data-02.js','./data-03.js','./data-04.js','./data-05.js','./data-06.js','./data-07.js',
  './data-08.js','./data-09.js','./data-10.js','./data-11.js','./data-12.js','./data-13.js'
];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>![CACHE,RUNTIME].includes(k)).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin===location.origin){
    event.respondWith(caches.match(req).then(cached=>{
      const fresh=fetch(req).then(res=>{if(res&&res.ok){const clone=res.clone();caches.open(CACHE).then(c=>c.put(req,clone));}return res;}).catch(()=>cached);
      return cached||fresh;
    }));
    return;
  }
  if(url.hostname.includes('steamstatic.com')){
    event.respondWith(caches.open(RUNTIME).then(async cache=>{
      const cached=await cache.match(req);
      if(cached)return cached;
      try{const res=await fetch(req,{mode:'no-cors'});cache.put(req,res.clone());return res}catch{return new Response('',{status:504,statusText:'Offline'})}
    }));
  }
});
