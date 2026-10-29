'use strict';
/* 林宇安 V2.0 — 繁體中文控制邏輯。頻譜只使用真實 Web Audio Analyser 數據。 */
const 找 = 識別 => document.getElementById(識別);
const 音訊 = 找('播放器音訊');
const 歌曲 = [
  {標題:'來安慰我吧',原檔:'來安慰我吧.mp3',副標:'給需要陪伴的深夜',封面:'影像/封面舞台.webp'},
  {標題:'把心門打開｜混音版',原檔:'把心門打開混音版.mp3',副標:'在節奏裡重新找到出口',封面:'影像/演唱近照.webp'},
  {標題:'把心門關起來',原檔:'把心門關起來_processed.mp3',副標:'留一點空白給此刻的自己',封面:'影像/質感特寫.webp'}
];
const 畫布 = 找('頻譜畫布');
const 繪圖 = 畫布.getContext('2d');
const 本機歌曲 = new Map();
const 減少動態 = window.matchMedia('(prefers-reduced-motion: reduce)');
const 標籤 = ['首頁','音樂','寫真','影像','關於'];
let 目前歌曲 = 0;
let 目前分類 = '全部';
let 目前照片 = -1;
let 開啟燈箱前的焦點 = null;
let 提示計時 = 0;
let 音源種類 = '同源串流';
let 自動嘗試失敗 = false;
let 音效環境 = null;
let 音訊來源節點 = null;
let 濾鏡陣列 = null;
let 分析器 = null;
let 頻譜資料 = null;
let 頻譜幀 = 0;
let 上次頻譜 = 0;
let 上次音量 = 80;

function 顯示訊息(訊息,停留=5700) {
  const 容器 = 找('訊息');
  容器.textContent = 訊息;
  容器.classList.add('顯示');
  clearTimeout(提示計時);
  提示計時 = window.setTimeout(()=>容器.classList.remove('顯示'),停留);
}
function 顯示頁面(名稱,寫入歷史=true) {
  if (!標籤.includes(名稱)) return;
  for(const 頁 of document.querySelectorAll('.頁面')){
    const 啟用 = 頁.id === 名稱;
    頁.hidden = !啟用;
    頁.classList.toggle('顯示',啟用);
  }
  for(const 導覽鍵 of document.querySelectorAll('[data-導覽]')){
    const 啟用 = 導覽鍵.dataset.導覽 === 名稱;
    導覽鍵.classList.toggle('選中',啟用);
    if(導覽鍵.closest('nav')){
      if(啟用) 導覽鍵.setAttribute('aria-current','page');
      else 導覽鍵.removeAttribute('aria-current');
    }
  }
  if(寫入歷史 && location.hash !== '#' + encodeURIComponent(名稱)) history.pushState({頁面:名稱},'', '#' + encodeURIComponent(名稱));
  window.scrollTo({top:0,behavior:'instant'});
  if (名稱 === '音樂' && !音訊.paused) 開始頻譜();
  else 停止頻譜();
}
document.querySelectorAll('[data-導覽]').forEach(按鈕=>按鈕.addEventListener('click',事件=>{
  事件.preventDefault();
  顯示頁面(按鈕.dataset.導覽);
}));
window.addEventListener('popstate',()=>{const 名稱=decodeURIComponent(location.hash.substring(1))||'首頁';顯示頁面(標籤.includes(名稱)?名稱:'首頁',false)});
window.addEventListener('hashchange',()=>{const 名稱=decodeURIComponent(location.hash.substring(1))||'首頁';顯示頁面(標籤.includes(名稱)?名稱:'首頁',false)});

function 時間顯示(秒) {
  if(!Number.isFinite(秒)||秒<0) return '0:00';
  return Math.floor(秒/60)+':'+String(Math.floor(秒%60)).padStart(2,'0');
}
function 設定播放狀態(){
  const 正在播放 = !音訊.paused && !音訊.ended;
  找('播放切換').textContent = 正在播放?'❚❚':'▶';
  找('播放切換').setAttribute('aria-label',正在播放?'暫停':'播放');
  找('播放狀態').textContent = 正在播放?'正在播放 · LIN YU-AN':'林宇安 · LIN YU-AN';
  document.querySelectorAll('.歌曲列').forEach((行,索引)=>{
    const 啟用=索引===目前歌曲;
    行.classList.toggle('正在聽',啟用);
    const 鍵=行.querySelector('button');
    鍵.textContent=啟用&&正在播放?'❚❚':'▶';
    鍵.setAttribute('aria-label',啟用&&正在播放?'暫停'+歌曲[索引].標題:'播放'+歌曲[索引].標題);
  });
}
function 歌曲網址(索引) {
  const 自選 = 本機歌曲.get(索引);
  if(自選){音源種類='本機';return 自選;}
  音源種類='同源串流';
  return './api/音樂?track='+索引;
}
function 載入歌曲(索引) {
  目前歌曲 = (索引 + 歌曲.length) % 歌曲.length;
  const 曲目=歌曲[目前歌曲];
  自動嘗試失敗=false;
  音訊.pause();
  音訊.removeAttribute('src');
  音訊.src=歌曲網址(目前歌曲);
  音訊.load();
  找('播放標題').textContent=曲目.標題;
  找('播放封面').src='./'+曲目.封面;
  找('播放封面').alt=曲目.標題+' 封面';
  找('現在時間').textContent='0:00';
  找('歌曲時間').textContent='0:00';
  找('進度條').value=0;
  設定播放狀態();
  if('mediaSession' in navigator){
    try{navigator.mediaSession.metadata=new MediaMetadata({
      title:曲目.標題,artist:'林宇安',album:'晨霧微光',artwork:[{src:new URL('./'+曲目.封面,location.href).href,sizes:'512x512',type:'image/webp'}]
    })}catch(錯誤){console.debug('媒體資訊不支援',錯誤)}
  }
}
function 初始化音效(){
  if(音效環境)return;
  const 建構 = window.AudioContext || window.webkitAudioContext;
  if(!建構)return;
  try{
    const 環境 = new 建構();
    const 來源 = 環境.createMediaElementSource(音訊);
    const 低 = 環境.createBiquadFilter();
    低.type='lowshelf';低.frequency.value=190;
    const 中 = 環境.createBiquadFilter();
    中.type='peaking';中.frequency.value=1150;中.Q.value=.85;
    const 高 = 環境.createBiquadFilter();
    高.type='highshelf';高.frequency.value=4900;
    const 觀測 = 環境.createAnalyser();
    觀測.fftSize=2048;
    觀測.smoothingTimeConstant=.82;
    來源.connect(低);低.connect(中);中.connect(高);高.connect(觀測);觀測.connect(環境.destination);
    音效環境=環境;音訊來源節點=來源;濾鏡陣列=[低,中,高];分析器=觀測;
    頻譜資料 = new Uint8Array(觀測.frequencyBinCount);
    設定音效數值();
  }catch(錯誤){console.warn('音效處理無法初始化；使用原生播放器',錯誤)}
}
function 設定音效數值(){
  for(const [索引,名稱] of ['低音','中音','高音'].entries()){
    const 數值=Number(找(名稱).value);
    找(名稱+'值').textContent=(數值>0?'+':'')+數值+' dB';
    if(濾鏡陣列&&音效環境)濾鏡陣列[索引].gain.setTargetAtTime(數值,音效環境.currentTime,.035);
  }
}
function 準備播放(){
  // iPhone Safari 要求在使用者的點擊事件內呼叫 play() 與 resume()。
  if(!音訊.src)載入歌曲(目前歌曲);
  初始化音效();
  if(音效環境 && 音效環境.state === 'suspended')音效環境.resume().catch(()=>{});
  const 播放承諾=音訊.play();
  if(播放承諾 && typeof 播放承諾.catch === 'function'){
    播放承諾.catch(錯誤=>{
      console.warn('歌曲播放受阻',錯誤);
      顯示訊息('無法播放歌曲。請確認網路，或進入音樂頁載入本機 MP3。');
      設定播放狀態();
    });
  }
}
function 播放切換(){
  if(音訊.paused)準備播放();
  else 音訊.pause();
}
function 跳至歌曲(索引){
  載入歌曲(索引);
  準備播放();
}
找('播放切換').addEventListener('click',播放切換);
找('上一首').addEventListener('click',()=>跳至歌曲(目前歌曲-1));
找('下一首').addEventListener('click',()=>跳至歌曲(目前歌曲+1));
找('開啟音樂').addEventListener('click',()=>顯示頁面('音樂'));
音訊.addEventListener('play',()=>{
  設定播放狀態();開始頻譜();
});
音訊.addEventListener('pause',()=>{設定播放狀態();停止頻譜()});
音訊.addEventListener('ended',()=>跳至歌曲(目前歌曲+1));
音訊.addEventListener('loadedmetadata',()=>{找('歌曲時間').textContent=時間顯示(音訊.duration)});
音訊.addEventListener('durationchange',()=>{找('歌曲時間').textContent=時間顯示(音訊.duration)});
音訊.addEventListener('timeupdate',()=>{
  找('現在時間').textContent=時間顯示(音訊.currentTime);
  找('進度條').value=Number.isFinite(音訊.duration)&&音訊.duration>0?Math.round(音訊.currentTime/音訊.duration*1000):0;
});
找('進度條').addEventListener('input',()=>{
  if(Number.isFinite(音訊.duration)&&音訊.duration>0)音訊.currentTime=Number(找('進度條').value)/1000*音訊.duration;
});
音訊.addEventListener('error',()=>{
  if(!音訊.currentSrc)return;
  if(音訊.error?.code===1)return;
  if(自動嘗試失敗)return;
  自動嘗試失敗=true;
  const 代碼=音訊.error?.code;
  const 原因=代碼===2?'網路連線中斷':代碼===3?'音訊解碼失敗':代碼===4?'音樂來源無法取得':'未知錯誤';
  顯示訊息(原因+'：請稍後重試，或在音樂頁載入原始 MP3。',7600);
});
['低音','中音','高音'].forEach(名稱=>找(名稱).addEventListener('input',()=>{初始化音效();設定音效數值()}));
找('重設音效').addEventListener('click',()=>{
  ['低音','中音','高音'].forEach(名稱=>找(名稱).value=0);
  設定音效數值();顯示訊息('已恢復原始音色');
});
function 同步音量(數值){
  const 安全值=Math.max(0,Math.min(100,Number(數值)));
  音訊.volume=安全值/100;
  音訊.muted=安全值===0;
  找('音量').value=安全值;
  找('手機音量範圍').value=安全值;
  找('靜音切換').textContent=安全值===0?'♩':'♪';
  找('靜音切換').setAttribute('aria-label',安全值===0?'恢復音量':'靜音');
  if(安全值>0)上次音量=安全值;
}
找('手機音量鈕').addEventListener('click',()=>{
  const 面板=找('手機音量面板');
  const 開啟=面板.hidden;
  面板.hidden=!開啟;
  找('手機音量鈕').setAttribute('aria-expanded',String(開啟));
});
document.addEventListener('click',事件=>{
  const 面板=找('手機音量面板');
  if(!面板.hidden&&!事件.target.closest('#手機音量面板')&&!事件.target.closest('#手機音量鈕')){
    面板.hidden=true;
    找('手機音量鈕').setAttribute('aria-expanded','false');
  }
});
找('音量').addEventListener('input',事件=>同步音量(事件.target.value));
找('手機音量範圍').addEventListener('input',事件=>同步音量(事件.target.value));
找('靜音切換').addEventListener('click',()=>同步音量(音訊.muted||音訊.volume===0?上次音量:0));
同步音量(80);

function 繪製頻譜(){
  const 寬=畫布.clientWidth;
  const 高=畫布.clientHeight;
  const 像素比例=Math.min(2,window.devicePixelRatio||1);
  const 目標寬=Math.max(1,Math.floor(寬*像素比例));
  const 目標高=Math.max(1,Math.floor(高*像素比例));
  if(畫布.width!==目標寬||畫布.height!==目標高){
    畫布.width=目標寬;畫布.height=目標高;
  }
  繪圖.setTransform(像素比例,0,0,像素比例,0,0);
  繪圖.clearRect(0,0,寬,高);
  if(!分析器||音訊.paused||找('音樂').hidden)return;
  分析器.getByteFrequencyData(頻譜資料);
  const 欄數=Math.max(12,Math.min(58,Math.floor(寬/9)));
  const 間距=3;
  const 欄寬=(寬-(欄數-1)*間距)/欄數;
  for(let 欄=0;欄<欄數;欄++){
    const 比例=欄/欄數;
    const 取樣=Math.min(頻譜資料.length-1,Math.floor(Math.pow(比例,1.7)*(頻譜資料.length*.6)));
    const 強度=頻譜資料[取樣]/255;
    const 高度=強度<.015?0:Math.max(2,Math.pow(強度,.82)*(高-10));
    if(高度<=0)continue;
    繪圖.fillStyle=欄%3===0?'rgba(255,238,207,.83)':欄%3===1?'rgba(211,101,130,.79)':'rgba(191,183,238,.78)';
    繪圖.fillRect(欄*(欄寬+間距),高-高度,欄寬,高度);
  }
}
function 頻譜迴圈(時間){
  if(音訊.paused||找('音樂').hidden){頻譜幀=0;return}
  if(時間-上次頻譜>=(減少動態.matches?120:35)){
    繪製頻譜();上次頻譜=時間;
  }
  頻譜幀=requestAnimationFrame(頻譜迴圈);
}
function 開始頻譜(){
  if(頻譜幀||音訊.paused||找('音樂').hidden)return;
  頻譜幀=requestAnimationFrame(頻譜迴圈);
}
function 停止頻譜(){
  if(頻譜幀)cancelAnimationFrame(頻譜幀);
  頻譜幀=0;繪製頻譜();
}
document.addEventListener('visibilitychange',()=>{
  if(document.hidden)停止頻譜();
  else if(!音訊.paused)開始頻譜();
});
function 建立曲目列表(){
  const 容器=找('歌曲列表');
  const 首頁容器=找('首頁歌曲');
  歌曲.forEach((曲目,索引)=>{
    const 行=document.createElement('div');行.className='歌曲列';
    const 編號=document.createElement('span');編號.className='序號';編號.textContent=String(索引+1).padStart(2,'0');
    const 詳情=document.createElement('div');
    const 標題=document.createElement('strong');標題.textContent=曲目.標題;
    const 說明=document.createElement('small');說明.textContent=曲目.副標;
    詳情.append(標題,說明);
    const 人名=document.createElement('span');人名.className='時長';人名.textContent='LIN YU-AN';
    const 播放鈕=document.createElement('button');播放鈕.type='button';播放鈕.textContent='▶';
    播放鈕.addEventListener('click',()=>索引===目前歌曲&&!音訊.paused?音訊.pause():跳至歌曲(索引));
    行.append(編號,詳情,人名,播放鈕);容器.appendChild(行);
    const 首頁鈕=document.createElement('button');首頁鈕.type='button';
    const 小序=document.createElement('span');小序.textContent=String(索引+1).padStart(2,'0');
    const 名稱=document.createElement('span');名稱.textContent=曲目.標題;
    const 箭頭=document.createElement('span');箭頭.textContent='↗';
    首頁鈕.append(小序,名稱,箭頭);
    首頁鈕.addEventListener('click',()=>{顯示頁面('音樂');跳至歌曲(索引)});
    首頁容器.appendChild(首頁鈕);
  });
  設定播放狀態();
}
找('本機檔案').addEventListener('change',事件=>{
  let 已配對=0;
  const 清理=檔名=>檔名.toLowerCase().replace(/\.(mp3|m4a|wav)$/,'').replace(/[\s｜_\-]/g,'');
  for(const 檔 of Array.from(事件.target.files||[])){
    const 索引=歌曲.findIndex(曲=>清理(檔.name)===清理(曲.原檔));
    if(索引<0)continue;
    const 舊連結=本機歌曲.get(索引);
    if(舊連結)URL.revokeObjectURL(舊連結);
    本機歌曲.set(索引,URL.createObjectURL(檔));
    已配對++;
  }
  if(已配對){
    載入歌曲(目前歌曲);
    顯示訊息('已載入 '+已配對+' 首本機歌曲，可直接播放。');
  }else 顯示訊息('歌曲檔名未符合三首正式作品，請選擇原始 MP3。');
  event.target.value='';
});
if('mediaSession' in navigator){
  try{
    navigator.mediaSession.setActionHandler('play',()=>{if(音訊.paused)準備播放()});
    navigator.mediaSession.setActionHandler('pause',()=>音訊.pause());
    navigator.mediaSession.setActionHandler('previoustrack',()=>跳至歌曲(目前歌曲-1));
    navigator.mediaSession.setActionHandler('nexttrack',()=>跳至歌曲(目前歌曲+1));
    navigator.mediaSession.setActionHandler('seekto',事件=>{if(Number.isFinite(音訊.duration))音訊.currentTime=事件.seekTime});
  }catch(錯誤){console.debug('系統媒體控制未提供此功能',錯誤)}
}

/** 相簿分類與可鍵盤操作的全螢幕燈箱。 */
const 照片元素=Array.from(document.querySelectorAll('.相片卡'));
function 可見相片(){return 照片元素.filter(照片=>!照片.hidden)}
function 變更分類(分類){
  目前分類=分類;
  for(const 照片 of 照片元素)照片.hidden=分類!=='全部'&&照片.dataset.類型!==分類;
  for(const 按鈕 of document.querySelectorAll('[data-分類]')){
    const 啟用=按鈕.dataset.分類===分類;
    按鈕.classList.toggle('分類中',啟用);
    按鈕.setAttribute('aria-pressed',String(啟用));
  }
}
document.querySelectorAll('[data-分類]').forEach(按鈕=>按鈕.addEventListener('click',()=>變更分類(按鈕.dataset.分類)));
function 打開相片(元素){
  const 可見=可見相片();const 索引=可見.indexOf(元素);
  if(索引<0)return;
  目前照片=索引;
  開啟燈箱前的焦點=document.activeElement;
  找('照片燈箱').hidden=false;
  document.body.classList.add('禁止捲動');
  切換燈箱(0);
  找('關閉燈箱').focus();
}
function 切換燈箱(差值){
  const 可見=可見相片();
  if(!可見.length)return;
  目前照片=(目前照片+差值+可見.length)%可見.length;
  const 元件=可見[目前照片];const 圖片=元件.querySelector('img');
  找('燈箱圖片').src=圖片.currentSrc||圖片.src;
  找('燈箱圖片').alt=圖片.alt;
  找('燈箱文字').textContent=元件.querySelector('span').textContent+'　'+(目前照片+1)+' / '+可見.length;
}
function 關閉燈箱(){
  找('照片燈箱').hidden=true;
  document.body.classList.remove('禁止捲動');
  目前照片=-1;
  開啟燈箱前的焦點?.focus();
}
照片元素.forEach(元素=>元素.addEventListener('click',()=>打開相片(元素)));
找('照片前一張').addEventListener('click',()=>切換燈箱(-1));
找('照片下一張').addEventListener('click',()=>切換燈箱(1));
找('關閉燈箱').addEventListener('click',關閉燈箱);
找('照片燈箱').addEventListener('click',事件=>{if(事件.target===找('照片燈箱'))關閉燈箱()});
document.addEventListener('keydown',事件=>{
  if(找('照片燈箱').hidden)return;
  if(事件.key==='Escape'){事件.preventDefault();關閉燈箱()}
  else if(事件.key==='ArrowLeft'){事件.preventDefault();切換燈箱(-1)}
  else if(事件.key==='ArrowRight'){事件.preventDefault();切換燈箱(1)}
  else if(事件.key==='Tab'){
    const 按鈕=[找('關閉燈箱'),找('照片前一張'),找('照片下一張')];
    const 目前位置=按鈕.indexOf(document.activeElement);
    const 下一個=(目前位置+(事件.shiftKey?-1:1)+按鈕.length)%按鈕.length;
    事件.preventDefault();按鈕[下一個].focus();
  }
});
const 影片=找('影片播放器');
影片.addEventListener('play',()=>{if(!音訊.paused)音訊.pause()});
/** 當影片檔真正存在時，由站內設定提供 MP4 路徑；未公開時絕不顯示假播放按鈕。 */
const 已公開影片 = '';
if(已公開影片){
  影片.src=已公開影片;影片.hidden=false;
  找('預告封面').hidden=true;找('影片提示').hidden=true;
}
找('分享').addEventListener('click',async()=>{
  try{
    if(navigator.share)await navigator.share({title:'林宇安｜官方音樂網站',url:location.href});
    else if(navigator.clipboard){await navigator.clipboard.writeText(location.href);顯示訊息('網站連結已複製')}
    else 顯示訊息('請複製網址列連結分享');
  }catch(錯誤){if(錯誤.name!=='AbortError')顯示訊息('分享未完成，請直接複製網址')}
});
建立曲目列表();
載入歌曲(0);
const 開始頁名=decodeURIComponent(location.hash.slice(1))||'首頁';
顯示頁面(標籤.includes(開始頁名)?開始頁名:'首頁',false);
if('serviceWorker' in navigator && location.protocol==='https:'){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js',{scope:'./',updateViaCache:'none'}).catch(錯誤=>console.warn('離線功能暫不可用',錯誤)));
}
