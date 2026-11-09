import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
/* 林宇安官方寫真球：沿用相簿原圖、14 張，無任何第三方隨機人物照片。 */
const 找=名稱=>document.getElementById(名稱);
const 低動態=matchMedia('(prefers-reduced-motion:reduce)').matches;
let 場景=null,相機,渲染,控制,球,射線,指標,相片=[],照片=[],畫格=0,開著=false,目前=0,上次焦點=null,按下=null;
function 調整畫面(){
 if(!渲染)return;
 const 寬=Math.max(1,innerWidth),高=Math.max(1,innerHeight);
 相機.aspect=寬/高;相機.updateProjectionMatrix();渲染.setSize(寬,高,false);
}
function 停止畫面(){if(畫格){cancelAnimationFrame(畫格);畫格=0}}
function 動畫(){
 if(畫格||!開著||document.hidden)return;
 const 每幀=()=>{
  if(!開著||document.hidden){畫格=0;return}
  控制.update();渲染.render(場景,相機);畫格=requestAnimationFrame(每幀);
 };
 畫格=requestAnimationFrame(每幀);
}
function 顯示大圖(索引){
 目前=(索引+照片.length)%照片.length;
 const 圖=照片[目前];找('立體大圖').src=圖.網址;找('立體大圖').alt=圖.說明;
 找('立體大圖說明').textContent=圖.標題+' · '+(目前+1)+' / '+照片.length;
 找('立體圖片框').hidden=false;控制.autoRotate=false;找('關閉立體照片').focus();
}
function 關大圖(){
 找('立體圖片框').hidden=true;找('立體大圖').removeAttribute('src');
 控制.autoRotate=!低動態;找('關閉立體視窗').focus();
}
function 關立體(){
 if(!開著)return;
 if(!找('立體圖片框').hidden)關大圖();
 開著=false;停止畫面();找('立體視窗').hidden=true;
 document.body.classList.remove('禁止捲動');上次焦點?.focus();
}
function 鍵盤(事件){
 if(!開著)return;
 if(事件.key==='Escape'){事件.preventDefault();if(!找('立體圖片框').hidden)關大圖();else 關立體()}
 if(!找('立體圖片框').hidden&&事件.key==='ArrowLeft'){事件.preventDefault();顯示大圖(目前-1)}
 if(!找('立體圖片框').hidden&&事件.key==='ArrowRight'){事件.preventDefault();顯示大圖(目前+1)}
 if(事件.key==='Tab'){
   const 順序=找('立體圖片框').hidden?[找('關閉立體視窗')]:[找('關閉立體照片'),找('立體照片前'),找('立體照片後')];
   const 位置=順序.indexOf(document.activeElement),下一=(位置+(事件.shiftKey?-1:1)+順序.length)%順序.length;
   事件.preventDefault();順序[位置<0?0:下一].focus();
 }
}
function 建立(){
 照片=[...document.querySelectorAll('.相片卡')].map(卡=>{const img=卡.querySelector('img');return {網址:new URL(img.getAttribute('src'),document.baseURI).href,說明:img.alt,標題:卡.querySelector('span')?.textContent||'官方寫真'}});
 if(!照片.length)throw Error('照片為空');
 const 容器=找('立體畫面');
 場景=new THREE.Scene();場景.background=new THREE.Color('#101b32');場景.fog=new THREE.Fog('#101b32',650,1500);
 相機=new THREE.PerspectiveCamera(48,innerWidth/innerHeight,.1,2200);相機.position.set(0,0,680);
 渲染=new THREE.WebGLRenderer({antialias:true,powerPreference:'low-power'});
 渲染.setPixelRatio(Math.min(devicePixelRatio||1,innerWidth<750?1.5:2));渲染.outputColorSpace=THREE.SRGBColorSpace;
 渲染.toneMapping=THREE.ACESFilmicToneMapping;渲染.toneMappingExposure=1.08;
 容器.appendChild(渲染.domElement);
 控制=new OrbitControls(相機,渲染.domElement);控制.enableDamping=true;控制.enablePan=false;
 控制.dampingFactor=.055;控制.minDistance=430;控制.maxDistance=1100;
 控制.autoRotate=!低動態;控制.autoRotateSpeed=.55;
 控制.minPolarAngle=Math.PI*.17;控制.maxPolarAngle=Math.PI*.83;
 場景.add(new THREE.AmbientLight(0xffffff,1.9));
 const 暖光=new THREE.DirectionalLight(0xffeacf,2.1);暖光.position.set(260,260,400);場景.add(暖光);
 const 粉光=new THREE.DirectionalLight(0xd36582,.9);粉光.position.set(-250,-80,-150);場景.add(粉光);
 球=new THREE.Group();場景.add(球);射線=new THREE.Raycaster();指標=new THREE.Vector2();
 const 載圖=new THREE.TextureLoader(),半徑=280,黃金角=Math.PI*(3-Math.sqrt(5));
 for(let i=0;i<照片.length;i++){
   const y=照片.length===1?0:1-2*i/(照片.length-1),橫面=Math.sqrt(Math.max(0,1-y*y)),theta=黃金角*i;
   const 材質=new THREE.MeshStandardMaterial({side:THREE.DoubleSide,roughness:.75,color:0xffffff});
   const 卡=new THREE.Mesh(new THREE.PlaneGeometry(115,152),材質);
   卡.position.set(Math.cos(theta)*橫面*半徑,y*半徑,Math.sin(theta)*橫面*半徑);
   卡.lookAt(卡.position.clone().multiplyScalar(2));卡.userData.索引=i;球.add(卡);相片.push(卡);
   載圖.load(照片[i].網址,圖=>{
    圖.colorSpace=THREE.SRGBColorSpace;
    const 寬=Math.min(1.55,Math.max(.55,(圖.image?.width||3)/(圖.image?.height||4)));
    卡.geometry.dispose();卡.geometry=new THREE.PlaneGeometry(148*寬,148);
    材質.map=圖;材質.needsUpdate=true;
   },undefined,錯誤=>console.warn('立體照片載入失敗',錯誤));
 }
 渲染.domElement.addEventListener('pointerdown',e=>{按下={x:e.clientX,y:e.clientY}});
 渲染.domElement.addEventListener('pointercancel',()=>{按下=null});
 渲染.domElement.addEventListener('pointerup',e=>{
   if(!開著||!按下||!找('立體圖片框').hidden)return;
   const 位移=Math.hypot(e.clientX-按下.x,e.clientY-按下.y);按下=null;
   if(位移>9)return;
   const b=渲染.domElement.getBoundingClientRect();
   指標.set((e.clientX-b.left)/b.width*2-1,-(e.clientY-b.top)/b.height*2+1);
   射線.setFromCamera(指標,相機);
   const 結果=射線.intersectObjects(相片,false);
   if(結果.length)顯示大圖(結果[0].object.userData.索引);
 });
 window.addEventListener('resize',調整畫面);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)停止畫面();else 動畫()});
 document.addEventListener('keydown',鍵盤);
 找('關閉立體視窗').addEventListener('click',關立體);
 找('關閉立體照片').addEventListener('click',關大圖);
 找('立體照片前').addEventListener('click',()=>顯示大圖(目前-1));
 找('立體照片後').addEventListener('click',()=>顯示大圖(目前+1));
 調整畫面();
}
export async function 開啟立體寫真(){
 if(開著)return;
 上次焦點=document.activeElement;
 找('立體視窗').hidden=false;document.body.classList.add('禁止捲動');
 開著=true;找('關閉立體視窗').focus();
 try{if(!場景)建立();調整畫面();控制.autoRotate=!低動態;動畫();找('立體訊息').textContent=照片.length+' 張官方寫真'}
 catch(錯誤){開著=false;停止畫面();找('立體視窗').hidden=true;document.body.classList.remove('禁止捲動');throw 錯誤}
}