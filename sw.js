// 오프라인용: 인터넷이 되면 항상 새 버전을 받고, 안 되면 마지막으로 받은 걸 보여준다 (기록은 IndexedDB라 여기와 무관)
const C='donjusem-v1';
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>c.addAll(['./','./index.html','./manifest.json','./icon-180.png','./icon-192.png','./icon-512.png'])))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request; if(r.method!=='GET')return;
  const u=new URL(r.url);
  if(u.origin!==location.origin&&!u.hostname.startsWith('fonts.'))return;
  e.respondWith(fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(C).then(c=>c.put(r,cp))}return res})
    .catch(()=>caches.match(r).then(m=>m||(r.mode==='navigate'?caches.match('./index.html'):undefined))));
});
