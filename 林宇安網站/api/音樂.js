// 林宇安網站／雲端正式 MP3 串流中繼
// 僅接受固定的三首歌曲白名單，禁止自訂 URL，避免 SSRF。
// Google Drive 提供可公開讀取的原始檔；本站不儲存任何 OAuth 令牌。
import { Readable } from 'node:stream';

const 歌曲 = {
  '0': { 編號: '1BRLERb96A_NniaT5NyjntRmszpt5iS0z', 名稱: '來安慰我吧.mp3' },
  '1': { 編號: '1ED5bgS4HnJbQrh88pKxn85pDawtw7fw5', 名稱: '把心門打開混音版.mp3' },
  '2': { 編號: '1xel9dinrUjJafD4cEGtK3eDvjRBVxVVH', 名稱: '把心門關起來_processed.mp3' }
};

export default async function 處理歌曲請求(要求, 回應) {
  if (!['GET','HEAD'].includes(要求.method)) {
    回應.setHeader('Allow','GET, HEAD');
    return 回應.status(405).send('不支援的請求');
  }
  const 曲目 = 歌曲[String(要求.query.track ?? '0')];
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
