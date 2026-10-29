/* 林宇安 V2.0 離線基本殼與更新策略，音訊串流及 Range 由網路直接處理。 */
const 版本='林宇安離線介面_v2.0.0';
const 必要資源=[
  './',
  './index.html',
  './樣式.css?v=2.0.0',
  './功能.js?v=2.0.0',
  './manifest.json',
  './圖示.svg',
  './影像/封面舞台.webp',
  './影像/演唱近照.webp'
];
self.addEventListener('install',事件=>{
  事件.waitUntil(
    caches.open(版本)
      .then(快取=>快取.addAll(必要資源))
      .then(()=>self.skipWaiting())
  );
});
self.addEventListener('activate',事件=>{
  事件.waitUntil((async()=>{
    const 快取名稱=await caches.keys();
    await Promise.all(快取名稱.filter(名稱=>名稱.startsWith('林宇安離線介面_')&&名稱!==版本).map(名稱=>caches.delete(名稱)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',事件=>{
  const 請求=事件.request;
  if(請求.method!=='GET')return;
  const 路徑=new URL(請求.url);
  if(路徑.origin!==self.location.origin)return;
  if(請求.destination==='audio'||請求.destination==='video'||請求.headers.has('range')||路徑.pathname.includes('/api/')||/\.(mp3|m4a|mp4|wav)$/i.test(路徑.pathname))return;
  if(請求.mode==='navigate'){
    事件.respondWith((async()=>{
      try{
        const 回應=await fetch(請求);
        if(回應.ok){
          const 快取=await caches.open(版本);
          await 快取.put('./index.html',回應.clone());
        }
        return 回應;
      }catch(錯誤){return (await caches.match('./index.html'))||Response.error()}
    })());
    return;
  }
  事件.respondWith((async()=>{
    const 快取=await caches.open(版本);
    const 舊值=await 快取.match(請求);
    if(舊值)return 舊值;
    const 回應=await fetch(請求);
    if(回應.ok&&回應.type==='basic')await 快取.put(請求,回應.clone());
    return 回應;
  })());
});