// 林宇安網站／雲端正式 MP3 串流中繼
// 僅接受固定的三首歌曲白名單，禁止自訂 URL，避免 SSRF。
// Google Drive 提供可公開讀取的原始檔；本站不儲存任何 OAuth 令牌。
import { Readable } from 'node:stream';

const 歌曲 = {
  '0': { 編號: '1BRLERb96A_NniaT5NyjntRmszpt5iS0z', 名稱: '來安慰我吧.mp3' },
  '1': { 編號: '1ED5bgS4HnJbQrh88pKxn85pDawtw7fw5', 名稱: '把心門打開混音版.mp3' },
  '2': { 編號: '1xel9dinrUjJafD4cEGtK3eDvjRBVxVVH', 名稱: '把心門關起來_processed.mp3' }
};


/* 三首新歌以公開 GitHub 靜態分段供應，保留完整的原始 MP3 位元組。
   伺服器以 HTTP Range 精確擷取所需位元組，不修改原始音質。
   用戶端音效仍由同一個「一鍵天籟」 Web Audio 處理。 */
const 新歌來源=Object.freeze({
  '3':{名稱:'就是這種感覺.mp3',目錄:'就是這種感覺',大小:8830432,分段:9},
  '4':{名稱:'這樣的相遇.mp3',目錄:'這樣的相遇',大小:8732212,分段:9},
  '5':{名稱:'已失去.mp3',目錄:'已失去',大小:11960640,分段:12}
});
const 分段長度=1048575;
function 解讀位元組範圍(值,總量){
  if(!值)return {開始:0,結束:總量-1,部分:false};
  const 符合=/^bytes=(\d*)-(\d*)$/i.exec(String(值).trim());
  if(!符合||(!符合[1]&&!符合[2]))return null;
  let 開始,結束;
  if(!符合[1]){
    const 後綴=Number(符合[2]);
    if(!Number.isSafeInteger(後綴)||後綴<=0)return null;
    開始=Math.max(0,總量-後綴);結束=總量-1;
  }else{
    開始=Number(符合[1]);
    if(!Number.isSafeInteger(開始)||開始>=總量)return null;
    結束=符合[2]?Number(符合[2]):總量-1;
    if(!Number.isSafeInteger(結束)||結束<開始)return null;
    結束=Math.min(結束,總量-1);
  }
  return {開始,結束,部分:true};
}
async function 讀取分段(曲目,索引){
  if(!Number.isInteger(索引)||索引<0||索引>=曲目.分段)throw new Error('分塊索引不在允許範圍');
  const 網址='https://raw.githubusercontent.com/qhero70/aurora-audio/main/林宇安網站/音訊片段/'+encodeURIComponent(曲目.目錄)+'/'+String(索引).padStart(2,'0')+'.bin';
  const 控制器=new AbortController();
  const 計時=setTimeout(()=>控制器.abort(),18000);
  try{
    const 來源=await fetch(網址,{headers:{'Accept':'application/octet-stream','User-Agent':'LinYuAnMusic/2.3'},redirect:'follow',signal:控制器.signal});
    if(!來源.ok)throw new Error('分段來源 HTTP '+來源.status);
    const 資料=Buffer.from(await 來源.arrayBuffer());
    const 正確大小=Math.min(分段長度,曲目.大小-索引*分段長度);
    if(資料.byteLength!==正確大小)throw new Error('分段長度不符 '+索引+' '+資料.byteLength+' / '+正確大小);
    return 資料;
  }finally{clearTimeout(計時)}
}
async function 處理新歌串流(要求,回應,曲目,偵測){
  const 範圍=解讀位元組範圍(要求.headers.range,曲目.大小);
  回應.setHeader('Accept-Ranges','bytes');
  回應.setHeader('Cache-Control','public, max-age=300, s-maxage=300, no-transform');
  if(!範圍){
    回應.setHeader('Content-Range','bytes */'+曲目.大小);
    return 回應.status(416).end();
  }
  if(偵測){
    try{
      const 首段=await 讀取分段(曲目,0);
      const 判斷=(首段[0]===73&&首段[1]===68&&首段[2]===51)||(首段[0]===255&&(首段[1]&224)===224);
      return 回應.status(200).json({來源可存取:true,是否MP3:判斷,狀態:206,名稱:曲目.名稱,來源:'本站分段串流',偵測位元組:Math.min(512,首段.byteLength),總位元組:曲目.大小});
    }catch(錯誤){
      console.warn('音源健康檢查失敗',曲目.名稱,String(錯誤));
      return 回應.status(502).json({來源可存取:false,名稱:曲目.名稱,原因:'分段原檔讀取失敗'});
    }
  }
  const {開始,結束,部分}=範圍;
  const 開始索引=Math.floor(開始/分段長度),結束索引=Math.floor(結束/分段長度);
  try{
    // 第一段在發送回應標頭前驗證，避免把讀取失敗誤報為 HTTP 206。
    const 第一段=await 讀取分段(曲目,開始索引);
    回應.status(部分?206:200);
    回應.setHeader('Content-Type','audio/mpeg');
    回應.setHeader('Content-Disposition','inline; filename="Lin-Yu-An.mp3"');
    回應.setHeader('Content-Length',String(結束-開始+1));
    if(部分)回應.setHeader('Content-Range','bytes '+開始+'-'+結束+'/'+曲目.大小);
    if(要求.method==='HEAD')return 回應.end();
    for(let 批次=開始索引;批次<=結束索引;批次+=3){
      const 索引組=Array.from({length:Math.min(3,結束索引-批次+1)},(_,i)=>批次+i);
      const 資料組=await Promise.all(索引組.map(i=>i===開始索引?Promise.resolve(第一段):讀取分段(曲目,i)));
      for(let j=0;j<索引組.length;j++){
        if(回應.destroyed)return;
        const i=索引組[j],資料=資料組[j];
        const 左=Math.max(0,開始-i*分段長度);
        const 右=Math.min(資料.length,結束-i*分段長度+1);
        if(右>左&&!回應.write(資料.subarray(左,右))){
          await new Promise((完成,失敗)=>{
            回應.once('drain',完成);
            回應.once('error',失敗);
          });
        }
      }
    }
    return 回應.end();
  }catch(錯誤){
    console.warn('音訊分段串流失敗',曲目.名稱,String(錯誤));
    if(回應.headersSent)return 回應.destroy(錯誤);
    return 回應.status(502).json({錯誤:'音源分段暫時無法讀取',歌曲:曲目.名稱});
  }
}

export default async function 處理歌曲請求(要求, 回應) {
  if (!['GET','HEAD'].includes(要求.method)) {
    回應.setHeader('Allow','GET, HEAD');
    return 回應.status(405).send('不支援的請求');
  }
  const 編號=String(要求.query.track ?? '0');
  const 新曲目=新歌來源[編號];
  if(新曲目)return 處理新歌串流(要求,回應,新曲目,String(要求.query.probe||'')==='1');
  const 曲目 = 歌曲[編號];
  if (!曲目) return 回應.status(404).send('找不到指定歌曲');
  const 偵測 = String(要求.query.probe || '') === '1';
  const 範圍 = 偵測 ? 'bytes=0-511' : 要求.headers.range;
  const 標頭 = { 'User-Agent': 'Mozilla/5.0 (compatible; LinYuAnMusic/1.0)', 'Accept':'*/*' };
  if (範圍) 標頭.Range = 範圍;
  const 候選來源 = [
    'https://drive.usercontent.google.com/download?id=' + encodeURIComponent(曲目.編號) + '&export=download&confirm=t',
    'https://drive.google.com/uc?export=download&id=' + encodeURIComponent(曲目.編號)
  ];
  for (const 網址 of 候選來源) {
    try {
      const 控制器 = new AbortController();
      const 超時 = setTimeout(()=>控制器.abort(), 20000);
      let 來源;
      try {來源 = await fetch(網址, {headers: 標頭, redirect:'follow', signal: 控制器.signal});}
      finally {clearTimeout(超時);}
      const 格式 = (來源.headers.get('content-type') || '').toLowerCase();
      if (!來源.ok || 格式.includes('text/html') || 格式.includes('text/plain')) {
        await 來源.body?.cancel().catch(()=>{});
        continue;
      }
      if (偵測) {
        const 資料 = new Uint8Array(await 來源.arrayBuffer());
        const 是MP3 = (資料[0] === 73 && 資料[1] === 68 && 資料[2] === 51) || (資料[0] === 255 && (資料[1] & 224) === 224);
        return 回應.status(200).json({來源可存取: true, 格式, 是否MP3: 是MP3, 狀態: 來源.status, 名稱: 曲目.名稱, 偵測位元組: 資料.byteLength});
      }
      回應.status(來源.status === 206 ? 206 : 200);
      回應.setHeader('Content-Type','audio/mpeg');
      回應.setHeader('Content-Disposition','inline; filename="music.mp3"');
      回應.setHeader('Cache-Control','public, max-age=3600, s-maxage=86400');
      回應.setHeader('Accept-Ranges','bytes');
      for (const 項目 of ['content-length','content-range','etag','last-modified']) {
        const 值=來源.headers.get(項目);
        if (值) 回應.setHeader(項目, 值);
      }
      if (要求.method === 'HEAD') {
        await 來源.body?.cancel().catch(()=>{});
        return 回應.end();
      }
      if (!來源.body) return 回應.status(502).send('來源沒有串流');
      const 串流 = Readable.fromWeb(來源.body);
      串流.on('error',()=>{if(!回應.headersSent)回應.status(502).end();else 回應.destroy()});
      return 串流.pipe(回應);
    } catch (錯誤) {
      console.warn('歌曲上游讀取失敗',曲目.名稱, String(錯誤));
    }
  }
  if(偵測)return 回應.status(502).json({來源可存取:false,名稱:曲目.名稱});
  return 回應.status(502).send('雲端歌曲無法讀取。請改用本機 MP3 或網站自有音檔。');
}
