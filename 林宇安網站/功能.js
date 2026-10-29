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
  window.scrollTo({top:0,behavior:'auto'});
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
const 天籟參數=Object.freeze({等化:Object.freeze([7,5,2,0,1.5,3.5,4.5,3,1,-3]),頻率:Object.freeze([32,64,125,250,500,1000,2000,4000,8000,16000]),空間:.75,殘響:.35,諧波:45});
let 工作站音效圖=null;
function 天籟諧波曲線(驅動){
 const n=8192,曲線=new Float32Array(n),倍率=1+驅動/100*3,標準=Math.atan(倍率);
 for(let i=0;i<n;i++){let x=i*2/(n-1)-1;曲線[i]=Math.atan(x*倍率)/標準}
 return 曲線;
}
function 天籟空間殘響(環境){
 const 時長=2.4,長度=Math.floor(環境.sampleRate*時長),衝擊=環境.createBuffer(2,長度,環境.sampleRate);
 for(let channel=0;channel<2;channel++){const 資料=衝擊.getChannelData(channel);let 前=0;
  for(let i=0;i<長度;i++){前=(Math.random()*2-1+前*.78)/1.78;資料[i]=前*Math.pow(1-i/長度,2.5)}
 }
 return 衝擊;
}
function 初始化音效(){
 if(音效環境)return;
 const 建構=window.AudioContext||window.webkitAudioContext;
 if(!建構){顯示訊息('目前瀏覽器不支援天籟 DSP 音效');return}
 try{
  const 環境=new 建構(),來源=環境.createMediaElementSource(音訊);
  const 前級=環境.createGain();前級.gain.value=.63;
  const 直通=環境.createGain();直通.gain.value=.72;
  const 諧波濕聲=環境.createGain();諧波濕聲.gain.value=.28;
  const 諧波合聲=環境.createGain();
  const 諧波=環境.createWaveShaper();諧波.curve=天籟諧波曲線(天籟參數.諧波);諧波.oversample='2x';
  const 低通=環境.createBiquadFilter();低通.type='lowpass';低通.frequency.value=14000;
  // 真正的音場擴寬使用 Mid/Side 矩陣，避免將聲像偏向單側。
  const 空間=環境.createGain();
  const 濾鏡組=[];
  for(let i=0;i<天籟參數.頻率.length;i++){
   const 濾波=環境.createBiquadFilter();濾波.type=i===0?'lowshelf':i===9?'highshelf':'peaking';
   濾波.frequency.value=天籟參數.頻率[i];濾波.Q.value=.8;濾波.gain.value=天籟參數.等化[i];
   濾鏡組.push(濾波);
  }
  const 殘響=環境.createConvolver();殘響.buffer=天籟空間殘響(環境);
  const 乾=環境.createGain(),濕=環境.createGain();乾.gain.value=1-天籟參數.殘響*.5;濕.gain.value=天籟參數.殘響;
  const 壓縮=環境.createDynamicsCompressor();壓縮.threshold.value=-13;壓縮.knee.value=6;壓縮.ratio.value=8;壓縮.attack.value=.003;壓縮.release.value=.19;
  const 預留=環境.createGain();預留.gain.value=.84;
  const 音量增益=環境.createGain();音量增益.gain.value=Math.pow(上次音量/100,2);
  const 觀測=環境.createAnalyser();觀測.fftSize=2048;觀測.smoothingTimeConstant=.83;
  來源.connect(前級);前級.connect(直通);前級.connect(諧波);
  直通.connect(諧波合聲);諧波.connect(諧波濕聲);諧波濕聲.connect(諧波合聲);
  諧波合聲.connect(低通);低通.connect(空間);
  let 末端=空間;for(const 濾波 of 濾鏡組){末端.connect(濾波);末端=濾波}
  // 左右聲道 Mid/Side 擴寬，75% 設定對應 1.3 倍側向訊號。
  const 分流=環境.createChannelSplitter(2),合流=環境.createChannelMerger(2);
  const 寬度=1+天籟參數.空間*.4,同側=(1+寬度)/2,交叉=(1-寬度)/2;
  const 混音=Array.from({length:4},()=>環境.createGain());
  [同側,交叉,交叉,同側].forEach((數值,i)=>混音[i].gain.value=數值);
  末端.connect(分流);
  分流.connect(混音[0],0);混音[0].connect(合流,0,0);
  分流.connect(混音[1],1);混音[1].connect(合流,0,0);
  分流.connect(混音[2],0);混音[2].connect(合流,0,1);
  分流.connect(混音[3],1);混音[3].connect(合流,0,1);
  末端=合流;
  末端.connect(乾);末端.connect(殘響);殘響.connect(濕);
  乾.connect(壓縮);濕.connect(壓縮);壓縮.connect(預留);預留.connect(音量增益);音量增益.connect(觀測);觀測.connect(環境.destination);
  音效環境=環境;濾鏡陣列=濾鏡組;分析器=觀測;頻譜資料=new Uint8Array(觀測.frequencyBinCount);
  工作站音效圖={來源,前級,直通,諧波,諧波濕聲,諧波合聲,低通,空間,濾鏡組,分流,合流,混音,殘響,乾,濕,壓縮,預留,音量增益};
  try{音訊.volume=1}catch(錯誤){console.debug('音量改由音訊引擎管理',錯誤)}
  找('天籟模式狀態').querySelector('small').textContent='專屬固定音色 · 已啟用';
 }catch(錯誤){console.error('天籟 DSP 初始化失敗',錯誤);顯示訊息('天籟音效無法啟動，請重新整理網站後再播放。')}
}
function 設定音效數值(){/* 音效已由固定十段天籟預設鎖定，禁止動態改變。 */}
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
/* 十段天籟 EQ 固定顯示，不讓前端滑桿覆蓋預設值。 */
function 建立固定等化顯示(){
 const 容器=找('天籟等化顯示');
 天籟參數.頻率.forEach((頻率,i)=>{
  const 值=天籟參數.等化[i],欄=document.createElement('div');欄.className='天籟頻段';
  const 數值=document.createElement('span');數值.className='天籟頻段值';數值.textContent=(值>0?'+':'')+值+' dB';
  const 軌道=document.createElement('div');軌道.className='天籟頻段軌道';軌道.setAttribute('role','img');軌道.setAttribute('aria-label',頻率+'赫茲，'+數值.textContent);
  const 游標=document.createElement('div');游標.className='天籟頻段游標';游標.style.top=(50-值/12*44)+'%';軌道.appendChild(游標);
  const 標籤=document.createElement('span');標籤.className='天籟頻段名稱';標籤.textContent=頻率>=1000?(頻率/1000+'k'):String(頻率);
  欄.append(數值,軌道,標籤);容器.append(欄);
 });
}
建立固定等化顯示();
function 同步音量(數值){
  const 安全值=Math.max(0,Math.min(100,Number(數值)));
  if(工作站音效圖&&音效環境){
    音訊.volume=1;
    工作站音效圖.音量增益.gain.setTargetAtTime(Math.pow(安全值/100,2),音效環境.currentTime,.05);
  }else{try{音訊.volume=安全值/100}catch(錯誤){console.debug('請使用系統音量鍵',錯誤)}}
  音訊.muted=安全值===0;
  找('音量').value=安全值;
  找('手機音量範圍').value=安全值;
  找('天籟音量').value=安全值;
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
找('靜音切換').addEventListener('click',()=>同步音量(音訊.muted||Number(找('音量').value)===0?上次音量:0));
同步音量(80);
找('天籟音量').value=80;

let 頻譜樣式='柱狀',工作站頁籤='控制',循環歌曲=false;
function 頻譜可見(){return !找('音樂').hidden&&工作站頁籤==='控制'}
function 繪製頻譜(){
 const 寬=畫布.clientWidth,高=畫布.clientHeight,比例=Math.min(2,window.devicePixelRatio||1);
 if(!寬||!高)return;
 if(畫布.width!==Math.round(寬*比例)||畫布.height!==Math.round(高*比例)){畫布.width=Math.round(寬*比例);畫布.height=Math.round(高*比例)}
 繪圖.setTransform(比例,0,0,比例,0,0);繪圖.clearRect(0,0,寬,高);
 if(!分析器||音訊.paused||!頻譜可見())return;
 if(頻譜樣式==='波形'){
  const 波形=new Uint8Array(分析器.fftSize);分析器.getByteTimeDomainData(波形);
  繪圖.strokeStyle='#EA638C';繪圖.lineWidth=2.5;繪圖.beginPath();
  for(let i=0;i<波形.length;i++){const x=i/(波形.length-1)*寬,y=高/2+(波形[i]-128)/128*高*.43;if(i===0)繪圖.moveTo(x,y);else 繪圖.lineTo(x,y)}
  繪圖.stroke();return;
 }
 分析器.getByteFrequencyData(頻譜資料);
 const 讀取=(i,n)=>頻譜資料[Math.min(頻譜資料.length-1,Math.max(1,Math.floor(Math.pow(i/n,1.7)*頻譜資料.length*.6)))]/255;
 if(頻譜樣式==='柱狀'){
  const n=55,間=2,寬度=(寬-間*(n-1))/n;
  for(let i=0;i<n;i++){let h=Math.pow(讀取(i,n),1.25)*高*.92;if(h<1)continue;繪圖.fillStyle=i>n*.7?'#FCA17D':'#EA638C';繪圖.fillRect(i*(寬度+間),高-h,Math.max(1,寬度),h)}
 }else if(頻譜樣式==='圓環'){
  const n=72,r=Math.min(寬,高)*.23;
  for(let i=0;i<n;i++){const t=i/n*Math.PI*2,h=讀取(i,n)*r;繪圖.beginPath();繪圖.moveTo(寬/2+Math.cos(t)*r,高/2+Math.sin(t)*r);繪圖.lineTo(寬/2+Math.cos(t)*(r+h),高/2+Math.sin(t)*(r+h));繪圖.lineWidth=3;繪圖.strokeStyle=i%3===0?'#FCA17D':'#EA638C';繪圖.stroke()}
 }else if(頻譜樣式==='矩陣'){
  const n=32,m=14,cw=寬/n,ch=高/m;
  for(let i=0;i<n;i++)for(let j=0;j<Math.floor(讀取(i,n)*m);j++){繪圖.fillStyle=j>m*.7?'#FCA17D':'#EA638C';繪圖.fillRect(i*cw+2,高-(j+1)*ch+2,Math.max(1,cw-4),Math.max(1,ch-4))}
 }else if(頻譜樣式==='光譜'){
  const n=40,cw=寬/n;
  for(let i=0;i<n;i++){const h=Math.pow(讀取(i,n),1.2)*高;if(h<1)continue;const g=繪圖.createLinearGradient(0,高,0,高-h);g.addColorStop(0,'rgba(137,2,62,0)');g.addColorStop(1,'#36C9C6');繪圖.fillStyle=g;繪圖.beginPath();繪圖.moveTo(i*cw,高);繪圖.lineTo((i+.5)*cw,高-h);繪圖.lineTo((i+1)*cw,高);繪圖.fill()}
 }
}
function 頻譜迴圈(時間){
  if(音訊.paused||!頻譜可見()){頻譜幀=0;return}
  if(時間-上次頻譜>=(減少動態.matches?120:35)){
    繪製頻譜();上次頻譜=時間;
  }
  頻譜幀=requestAnimationFrame(頻譜迴圈);
}
function 開始頻譜(){
  if(頻譜幀||音訊.paused||!頻譜可見())return;
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
/* 工作站與既有底部播放器共用同一音訊元素 */
function 設定工作站頁籤(名稱){
 工作站頁籤=名稱;
 document.querySelectorAll('[data-工作站]').forEach(鈕=>{let 啟用=鈕.dataset.工作站===名稱;鈕.classList.toggle('天籟選中',啟用);鈕.setAttribute('aria-pressed',String(啟用))});
 document.querySelectorAll('[data-工作站內容]').forEach(面板=>面板.hidden=面板.dataset.工作站內容!==名稱);
 if(名稱==='控制'&&!音訊.paused)開始頻譜();else 停止頻譜();
}
document.querySelectorAll('[data-工作站]').forEach(鈕=>鈕.addEventListener('click',()=>設定工作站頁籤(鈕.dataset.工作站)));
document.querySelectorAll('[data-頻譜]').forEach(鈕=>鈕.addEventListener('click',()=>{
 頻譜樣式=鈕.dataset.頻譜;
 document.querySelectorAll('[data-頻譜]').forEach(按=>{const 啟用=按===鈕;按.classList.toggle('天籟選中',啟用);按.setAttribute('aria-pressed',String(啟用))});
 if(!音訊.paused)繪製頻譜();
}));
function 同步天籟工作站(){
 const 播放中=!音訊.paused&&!音訊.ended;
 找('天籟歌名').textContent=歌曲[目前歌曲].標題;
 找('天籟封面').src='./'+歌曲[目前歌曲].封面;
 找('天籟播放').textContent=播放中?'❚❚':'▶';
 找('天籟播放').setAttribute('aria-label',播放中?'暫停':'播放');
 找('天籟唱片').classList.toggle('唱片運作',播放中);
 const 狀態=找('天籟模式狀態');狀態.classList.toggle('正在運作',播放中&&!!工作站音效圖);
 狀態.querySelector('small').textContent=播放中&&工作站音效圖?'固定預設 · 音效運作中':工作站音效圖?'固定預設 · 已啟用':'固定音效 · 播放啟動';
}
function 同步天籟時間(){
 找('天籟目前時間').textContent=時間顯示(音訊.currentTime);
 找('天籟總時間').textContent=時間顯示(音訊.duration);
 找('天籟進度').value=Number.isFinite(音訊.duration)&&音訊.duration>0?Math.round(音訊.currentTime/音訊.duration*1000):0;
}
找('天籟播放').addEventListener('click',播放切換);
找('天籟上一首').addEventListener('click',()=>跳至歌曲(目前歌曲-1));
找('天籟下一首').addEventListener('click',()=>跳至歌曲(目前歌曲+1));
找('天籟進度').addEventListener('input',事件=>{if(Number.isFinite(音訊.duration)&&音訊.duration>0)音訊.currentTime=Number(事件.target.value)/1000*音訊.duration});
找('天籟音量').addEventListener('input',事件=>同步音量(事件.target.value));
找('天籟循環').addEventListener('click',()=>{
 循環歌曲=!循環歌曲;音訊.loop=循環歌曲;
 找('天籟循環').classList.toggle('啟用循環',循環歌曲);
 找('天籟循環').setAttribute('aria-pressed',String(循環歌曲));
});
for(const 名稱 of ['play','pause','ended','loadedmetadata','durationchange'])音訊.addEventListener(名稱,()=>{同步天籟工作站();同步天籟時間()});
音訊.addEventListener('timeupdate',同步天籟時間);
new MutationObserver(()=>同步天籟工作站()).observe(找('播放標題'),{childList:true,characterData:true,subtree:true});
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
    if(索引<3)首頁容器.appendChild(首頁鈕);
  });
  設定播放狀態();
}
/* 支援正式三首同名音檔替換與臨時本機音檔，無需另外建立雲端歌曲。 */
找('本機檔案').addEventListener('change',事件=>{
  let 已載入=0;
  const 清理=檔名=>檔名.toLowerCase().replace(/\.(mp3|m4a|wav|mp4)$/,'').replace(/[\s｜_\-]/g,'');
  for(const 檔 of Array.from(事件.target.files||[])){
    if(!/\.(mp3|wav|m4a|mp4)$/i.test(檔.name)||檔.size===0)continue;
    const 同名歌曲=歌曲.slice(0,3).findIndex(曲=>清理(曲.原檔)===清理(檔.name));
    const 索引=同名歌曲>=0?同名歌曲:歌曲.length;
    const 舊連結=本機歌曲.get(索引);
    if(舊連結)URL.revokeObjectURL(舊連結);
    本機歌曲.set(索引,URL.createObjectURL(檔));
    if(同名歌曲<0)歌曲.push({
      標題:檔.name.replace(/\.[^/.]+$/,''),
      原檔:檔.name,
      副標:'本機 '+檔.name.split('.').pop().toUpperCase()+' · 不上傳',
      封面:'影像/封面舞台.webp'
    });
    已載入++;
  }
  if(已載入){
    找('歌曲列表').replaceChildren();
    找('首頁歌曲').replaceChildren();
    建立曲目列表();
    顯示訊息('已載入 '+已載入+' 首本機音樂。可從播放清單選取；目前播放不會中斷。');
  }else 顯示訊息('未選到可支援的 MP3／WAV／M4A／MP4 音檔。');
  事件.target.value='';
});
window.addEventListener('pagehide',()=>{
  for(const 網址 of 本機歌曲.values())URL.revokeObjectURL(網址);
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
