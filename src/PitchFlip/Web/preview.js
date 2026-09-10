import * as pdfjs from './pdfjs/pdf.mjs';
pdfjs.GlobalWorkerOptions.workerSrc='./pdfjs/pdf.worker.mjs';
const $=id=>document.getElementById(id);
let state=null,pdf=null,loadingTask=null,loading=false,rev=-1,selected=0,spread=0,epoch=0,animating=false,drag=null;
let cache=new Map(),thumbCache=new Map(),observer=null,thumbQueue=Promise.resolve();
let revealedSlot=null,overviewMode=false,overviewObserver=null,zoom=1;
const icons={page:'M14 3H5v18h14V8z M14 3v5h5 M16 15h6 M19 12v6',book:'M12 5C8 2 5 3 2 4v15c3-1 6-2 10 1 4-3 7-2 10-1V4c-3-1-6-2-10 1z M12 5v15 M6 4v14 M18 4v14',undo:'M9 5 3 11l6 6 M3 11h12a6 6 0 0 1 0 12',redo:'M15 5l6 6-6 6 M21 11H9a6 6 0 0 0 0 12',folder:'M3 8V4h6l3 3h9v3 M2 10h20l-3 11H2z',save:'M4 3h14l3 3v15H3V3z M7 3v7h10V3 M7 21v-8h10v8',shield:'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6z M8 11l3 3 5-6',trash:'M3 6h18 M8 6V3h8v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',left:'m15 4-8 8 8 8',right:'m9 4 8 8-8 8',minus:'M10 17a7 7 0 1 1 0-14 7 7 0 0 1 0 14 M15 15l6 6 M6 10h8',plus:'M10 17a7 7 0 1 1 0-14 7 7 0 0 1 0 14 M15 15l6 6 M6 10h8 M10 6v8',fit:'M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5 M8 8l8 8 M16 8l-8 8'};
document.querySelectorAll('[data-icon]').forEach(el=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS(svg.namespaceURI,'path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');path.setAttribute('d',icons[el.dataset.icon]);svg.append(path);el.prepend(svg);});
const send=(action,index=selected)=>window.chrome?.webview?.postMessage({action,index});
const error=e=>window.chrome?.webview?.postMessage({action:'error',message:String(e.message||e)});
const count=()=>Math.ceil(state.pages.length/2);
const slot=i=>state.pages[i] || (i===state.pages.length && i%2===1 ? {type:2,geometry:state.pages.at(-1).geometry}:null);
const typeText=p=>p.type===0?'原 PDF 页面':p.type===1?'插入空白':'物理补位空白';
const label=i=>{const p=slot(i);return p ? '第 '+(Math.floor(i/2)+1)+' 张纸 · '+(i%2?'背面':'正面')+'　|　'+(p.type===2?'物理补位空白':'输出 '+(i+1)+(p.type===0?' · 原 PDF '+p.originalPageNumber:' · 插入空白')):''};
async function renderOriginal(number,width,thumb=false){
 const owner=pdf,key=number+':'+width, map=thumb?thumbCache:cache;
 if(map.has(key))return map.get(key);
 const promise=(async()=>{const page=await owner.getPage(number);const base=page.getViewport({scale:1});const view=page.getViewport({scale:Math.min(width/base.width,4)});
 const canvas=document.createElement('canvas');canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);
 await page.render({canvasContext:canvas.getContext('2d'),viewport:view}).promise;return canvas;})();
 map.set(key,promise);if(map.size>(thumb?240:10))map.delete(map.keys().next().value);
 try{return await promise;}catch(e){map.delete(key);throw e;}
}
async function paint(target,index,width){
 target.replaceChildren();target.classList.remove('absent');
 const p=slot(index);
 if(!p){target.classList.add('absent');return;}
 if(p.type!==0){const e=document.createElement('div');e.className='placeholder';e.textContent=p.type===1?'空白页':'物理补位空白';const s=document.createElement('small');s.textContent=p.type===1?'导出为纯白页面':'仅预览 · 不写入 PDF';e.append(s);target.append(e);return;}
 const ticket=epoch;let c;
 try {c=await renderOriginal(p.originalPageNumber,width);} catch(e) {if(ticket!==epoch)return;throw e;}
 if(ticket!==epoch)return;
 const copy=document.createElement('canvas');copy.width=c.width;copy.height=c.height;copy.getContext('2d').drawImage(c,0,0);target.replaceChildren(copy);
}
function fit(){
 if(!state)return;
 const p=slot(spread*2)||slot(spread*2-1);const g=p.geometry;
 let w=g.cropX2-g.cropX1 || g.width,h=g.cropY2-g.cropY1 || g.height;if(g.rotation%180)[w,h]=[h,w];
 const maxW=$('workspace').clientWidth-150,maxH=$('workspace').clientHeight-168;
 const width=Math.max(100,Math.min(maxW,maxH*w/h/2))*zoom;
 $('book').style.width=width+'px';$('book').style.height=(width*h/w*2)+'px';
}
function revealSelection(){
 if(overviewMode)return;
 const item=document.querySelector('.slot.selected');
 if(!item||item===revealedSlot)return;
 revealedSlot=item;
 item.closest('.sheet-group')?.classList.remove('collapsed');
 const pane=$('sidebar'),viewport=pane.getBoundingClientRect(),bounds=item.getBoundingClientRect();
 // Leave the adjacent insert controls visible; scroll only the list, without
 // stealing keyboard focus from the preview or the flip buttons.
 if(bounds.top<viewport.top+95||bounds.bottom>viewport.bottom-28){
  pane.scrollTo({top:pane.scrollTop+bounds.top-viewport.top-95-(pane.clientHeight-95-bounds.height)/2,behavior:'instant'});
 }
}
function info(){
 const p=slot(selected);if(!p)return;
 $('filename').textContent=state.name+(state.dirty?' · 未导出':'');
 const g=p.geometry;let w=g.cropX2-g.cropX1||g.width,h=g.cropY2-g.cropY1||g.height;if(g.rotation%180)[w,h]=[h,w];
 const mm=v=>Math.round(v*25.4/72),landscape=w>=h,a4=Math.abs(Math.max(w,h)*25.4/72-297)<2&&Math.abs(Math.min(w,h)*25.4/72-210)<2;
 const values=[['输出页码',p.type===2?'不写入输出':selected+1],['原始页码',p.type===0?p.originalPageNumber:'—'],['所在纸张','第 '+(Math.floor(selected/2)+1)+' 张（共 '+count()+' 张）'],['正 / 反面',(selected%2?'背面':'正面')+(selected===spread*2-1?'（上页）':'（下页）')],['页面尺寸',mm(w)+' × '+mm(h)+' mm'+(a4?'（A4）':'')],['页面方向',landscape?'横向（Landscape）':'纵向（Portrait）'],['是否插入页',p.type===0?'否（原始页面）':p.type===1?'是（插入空白）':'物理补位 · 仅预览']];
 const dl=document.createElement('dl');for(const [k,v]of values){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=v;if(k==='当前面')dd.className='emphasis';dl.append(dt,dd);}$('details').replaceChildren(dl);
 $('standalone').disabled=p.type!==0;$('delete').disabled=p.type!==1;$('before').disabled=p.type===2;$('after').disabled=p.type===2;
 $('undo').disabled=!state.canUndo;$('redo').disabled=!state.canRedo;
 document.querySelectorAll('[data-command]').forEach(b=>b.disabled=$(b.dataset.command).disabled);
 document.querySelectorAll('.slot,.overview-page').forEach(e=>e.classList.toggle('selected',Number(e.dataset.index)===selected));
 revealSelection();
 $('upper').classList.toggle('selected',selected===spread*2-1);$('lower').classList.toggle('selected',selected===spread*2);
}
async function show(){
 if(!state||!pdf||loading)return;if(overviewMode){info();return;}const generation=rev;fit();epoch++;
 $('topLabel').textContent=slot(spread*2-1)?'上页（翻过后的背面） · 输出 '+(spread*2):'';$('bottomLabel').textContent=slot(spread*2)?'下页（当前正面） · 输出 '+(spread*2+1):'';
 $('topLabel').title=label(spread*2-1);$('bottomLabel').title=label(spread*2);
 if(slot(spread*2-1)?.type===2)$('topLabel').textContent='上页（物理补位空白 · 不导出）';
 $('position').textContent=spread===0?'封面':spread===count()?'封底':'已翻 '+spread+' / '+count()+' 张';
 $('prev').disabled=spread===0;$('next').disabled=spread===count();
 info();const width=Math.ceil($('book').clientWidth*devicePixelRatio);
 await Promise.all([paint($('upper'),spread*2-1,width),paint($('lower'),spread*2,width)]);
 if(generation!==rev)return;
 for(const i of [spread*2+1,spread*2+2,spread*2-2]){const p=slot(i);if(p?.type===0)renderOriginal(p.originalPageNumber,width).catch(()=>{});}
}
function select(i,navigate=true){
 if(loading||animating||!slot(i))return;selected=i;send('select',i);
 if(navigate){spread=i%2 ? (i+1)/2 : i/2;show().catch(error);}else info();
}
function rebuildList(){
 observer?.disconnect();$('list').replaceChildren();const ticket=rev;
 observer=new IntersectionObserver(entries=>{for(const en of entries){if(!en.isIntersecting)continue;observer.unobserve(en.target);const element=en.target,n=Number(element.dataset.original);
 thumbQueue=thumbQueue.then(async()=>{if(ticket!==rev||loading||!element.isConnected)return;const c=await renderOriginal(n,260,true);if(ticket!==rev||!element.isConnected)return;const copy=document.createElement('canvas');copy.width=c.width;copy.height=c.height;copy.getContext('2d').drawImage(c,0,0);element.replaceChildren(copy);}).catch(e=>{if(ticket===rev)error(e);});
 }},{root:$('sidebar'),rootMargin:'200px'});
 const fragment=document.createDocumentFragment();let group;
 for(let i=0;i<count()*2;i++){
  if(i===0||i%2===1){group=document.createElement('div');group.className='sheet-group';const view=Math.ceil(i/2);group.dataset.spread=view;const h=document.createElement('button');h.className='sheet-title';h.textContent=view===0?'封面':view===count()?'封底':'第 '+(i+1)+'–'+(i+2)+' 页';h.setAttribute('aria-expanded','true');const owner=group;h.onclick=()=>{owner.classList.toggle('collapsed');h.setAttribute('aria-expanded',String(!owner.classList.contains('collapsed')));};group.append(h);fragment.append(group);}
  if(i>0&&i%2===0){const binding=document.createElement('div');binding.className='navigation-binding';binding.textContent='顶部装订';group.append(binding);}
  const gap=document.createElement('button');gap.className='gap';gap.textContent='＋ 插入空白';gap.onclick=()=>{if(!animating)send('insert',Math.min(i,state.pages.length));};group.append(gap);
  const p=slot(i),b=document.createElement('button');b.className='slot '+(p.type===1?'blank':p.type===2?'virtual':'');b.dataset.index=i;
  const thumb=document.createElement('div');thumb.className='thumb';thumb.textContent=p.type===0?'正在加载…':typeText(p);
  if(p.type===0){thumb.dataset.original=p.originalPageNumber;observer.observe(thumb);}
  const title=document.createElement('span');title.textContent=(i%2?'上页':'下页')+' '+(p.type===2?'补位':i+1);b.title=title.textContent+' · '+label(i);b.setAttribute('aria-label',b.title);
  const sub=document.createElement('small');sub.textContent=p.type===0?'原 PDF 第 '+p.originalPageNumber+' 页':p.type===1?'用户插入 · 将写入 PDF':'仅预览 · 不导出';
  b.append(thumb,title,sub);b.onclick=()=>select(i);b.oncontextmenu=e=>{e.preventDefault();select(i);context(e,i);};group.append(b);
 }
 const end=document.createElement('button');end.className='gap';end.textContent='＋ 末尾插入空白';end.onclick=()=>send('insert',state.pages.length);fragment.append(end);$('list').append(fragment);
}
function rebuildOverview(){
 overviewObserver?.disconnect();$('overviewGrid').replaceChildren();
 if(!overviewMode||!pdf||loading)return;
 const ticket=rev;
 $('overviewCount').textContent=state.pages.length+' 个输出页 · '+count()+' 张纸';
 overviewObserver=new IntersectionObserver(entries=>{for(const en of entries){
  if(!en.isIntersecting)continue;overviewObserver.unobserve(en.target);
  const element=en.target,n=Number(element.dataset.original);
  thumbQueue=thumbQueue.then(async()=>{
   if(ticket!==rev||loading||!element.isConnected)return;
   const c=await renderOriginal(n,520,true);
   if(ticket!==rev||!element.isConnected)return;
   const copy=document.createElement('canvas');copy.width=c.width;copy.height=c.height;
   copy.getContext('2d').drawImage(c,0,0);element.replaceChildren(copy);
  }).catch(e=>{if(ticket===rev)error(e);});
 }},{root:$('overviewScroll'),rootMargin:'300px'});
 const fragment=document.createDocumentFragment();
 for(let view=0;view<=count();view++){
  const card=document.createElement('div');card.className='overview-card';card.dataset.spread=view;
  const heading=document.createElement('strong');heading.textContent=view===0?'封面':view===count()?'封底':'翻开第 '+view+' 张纸';card.append(heading);
  for(const [position,i] of [['上',view*2-1],['下',view*2]]){
   if(position==='下'){const binding=document.createElement('div');binding.className='overview-binding';binding.textContent='顶部装订';card.append(binding);}
   const p=slot(i),b=document.createElement(p?'button':'div');b.className='overview-page '+(!p?'absent':p.type===1?'blank':p.type===2?'virtual':'')+(i===selected?' selected':'');
   const thumb=document.createElement('div');thumb.className='thumb';
   if(!p){thumb.textContent='';b.append(thumb);const caption=document.createElement('small');caption.textContent='此处无页面';b.append(caption);card.append(b);continue;}
   b.dataset.index=i;thumb.textContent=p.type===0?'正在加载…':typeText(p);
   if(p.type===0){thumb.dataset.original=p.originalPageNumber;overviewObserver.observe(thumb);}
   const title=document.createElement('small');title.textContent=(p.type===2?'补位空白':'输出 '+(i+1))+' · '+(i%2?'背面':'正面')+(p.type===0?' · 原页 '+p.originalPageNumber:p.type===2?' · 不导出':' · 插入空白');
   b.append(thumb,title);b.onclick=()=>{select(i);setOverview(false);};
   b.oncontextmenu=e=>{e.preventDefault();select(i);context(e,i);};card.append(b);
  }
  fragment.append(card);
 }
 $('overviewGrid').append(fragment);
}
function setOverview(enabled){
 if(!state||loading||animating)return;
 overviewMode=enabled;document.body.classList.toggle('overview-mode',enabled);
 $('overview').hidden=!enabled;$('overviewToggle').textContent=enabled?'返回翻页':'页面总览';
 $('overviewToggle').setAttribute('aria-pressed',String(enabled));$('context').hidden=true;
 if(enabled){rebuildOverview();$('overviewScroll').focus();}
 else{revealedSlot=null;overviewObserver?.disconnect();$('overviewGrid').replaceChildren();show().catch(error);$('overviewToggle').focus({preventScroll:true});}
}
$('overviewToggle').onclick=()=>setOverview(!overviewMode);
$('physicalTab').onclick=()=>setOverview(false);$('overviewBack').onclick=()=>setOverview(false);
$('overviewSize').oninput=()=>{$('overviewGrid').style.setProperty('--tile-size',$('overviewSize').value+'px');};
async function prepare(direction){
 if(overviewMode||loading||animating||!state||!pdf||direction>0&&spread>=count()||direction<0&&spread<=0)return false;
 const generation=rev;
 animating=true;epoch++;const base=direction>0?spread*2:(spread-1)*2;const w=Math.ceil($('book').clientWidth*devicePixelRatio);
 try{await Promise.all([paint($('front'),base,w),paint($('back'),base+1,w)]);
 if(generation!==rev)return false;
 if(direction>0)await paint($('lower'),base+2,w);else await paint($('upper'),base-1,w);
 if(generation!==rev)return false;
 $('flipper').style.display='block';$('flipper').style.transform='rotateX('+(direction>0?0:180)+'deg)';return true;
 }catch(e){if(generation===rev){animating=false;error(e);}return false;}
}
async function settle(direction,complete,from){
 const generation=rev;
 const end=complete?(direction>0?180:0):(direction>0?0:180);
 if($('animation').checked){const a=$('flipper').animate([{transform:'rotateX('+from+'deg)'},{transform:'rotateX('+end+'deg)'}],{duration:Math.max(100,Math.abs(end-from)*2.5),easing:'cubic-bezier(.2,.7,.25,1)',fill:'forwards'});try{await a.finished;}catch(e){if(generation!==rev)return;throw e;}a.cancel();}
 if(generation!==rev)return;
 if(complete){spread+=direction;selected=Math.max(0,spread*2-1);send('select',selected);}
 $('flipper').style.display='none';animating=false;await show();
}
async function flip(d){if(await prepare(d))await settle(d,true,d>0?0:180);}
function action(a){if(!state||loading||animating)return; if(a==='before'&&slot(selected)?.type!==2)send('insert',selected);else if(a==='after'&&slot(selected)?.type!==2)send('insert',selected+1);else if(a==='standalone'&&slot(selected)?.type===0)send(a);else if(['delete','undo','redo'].includes(a))send(a);}
for(const a of ['before','after','standalone','delete','undo','redo'])$(a).onclick=()=>action(a);
document.querySelectorAll('[data-command]').forEach(b=>b.onclick=()=>action(b.dataset.command));
$('openToolbar').onclick=()=>send('open');$('saveToolbar').onclick=()=>send('save');
function setZoom(value){if(!state||loading||animating)return;zoom=Math.max(.75,Math.min(2,value));$('zoomLevel').value=String(zoom);$('zoomOut').disabled=zoom<=.75;$('zoomIn').disabled=zoom>=2;show().catch(error);}
$('zoomLevel').onchange=()=>setZoom(Number($('zoomLevel').value));
const zoomSteps=[.75,1,1.25,1.5,2];
$('zoomOut').onclick=()=>setZoom(zoomSteps[Math.max(0,zoomSteps.indexOf(zoom)-1)]);
$('zoomIn').onclick=()=>setZoom(zoomSteps[Math.min(zoomSteps.length-1,zoomSteps.indexOf(zoom)+1)]);
$('fitWindow').onclick=()=>{setZoom(1);$('bookArea').scrollTo(0,0);};
$('prev').onclick=()=>flip(-1).catch(error);$('next').onclick=()=>flip(1).catch(error);$('open').onclick=()=>send('open');
function context(e,i){const menu=$('context');menu.querySelector('[data-action="standalone"]').disabled=slot(i).type!==0;menu.hidden=false;menu.style.left=Math.min(e.clientX,innerWidth-220)+'px';menu.style.top=Math.min(e.clientY,innerHeight-180)+'px';menu.querySelector('[data-action="delete"]').disabled=slot(i).type!==1;for(const a of ['before','after'])menu.querySelector('[data-action="'+a+'"]').disabled=slot(i).type===2;}
document.querySelectorAll('#context button').forEach(b=>b.onclick=()=>{action(b.dataset.action);$('context').hidden=true;});document.addEventListener('click',()=>$('context').hidden=true);
function jumpDialog(){if(!state)return;$('jumpError').textContent='';$('jumpDialog').showModal();$('jumpNumber').focus();}
$('jump').onclick=jumpDialog;$('jumpCancel').onclick=()=>$('jumpDialog').close();
$('jumpGo').onclick=()=>{const n=Number($('jumpNumber').value),type=$('jumpType').value;let i=type==='original'?state.pages.findIndex(p=>p.originalPageNumber===n):type==='sheet'?(n-1)*2:n-1;if(!Number.isInteger(n)||n<1||i<0||i>=state.pages.length){$('jumpError').textContent='请输入有效范围内的整数。';return;}$('jumpDialog').close();select(i);};
document.addEventListener('keydown',e=>{
 if(e.target.matches('input,select,textarea')||e.target.isContentEditable||$('jumpDialog').open)return;
 const k=e.key.toLowerCase();let handled=true;
 if(overviewMode&&!e.ctrlKey&&!e.altKey&&!e.metaKey){
  if(k==='escape'){setOverview(false);e.preventDefault();return;}
  if(['arrowdown','arrowup','pagedown','pageup',' '].includes(k)){
   const pane=$('overviewScroll'),distance=k.startsWith('arrow')?90:pane.clientHeight*.85;
   pane.scrollBy({top:(k==='arrowup'||k==='pageup'?-1:1)*distance});e.preventDefault();return;
  }
 }

 if(e.ctrlKey&&k==='o')send('open');else if(e.ctrlKey&&k==='s')send('save');else if(e.ctrlKey&&k==='g')jumpDialog();else if(e.ctrlKey&&k==='z')action('undo');else if(e.ctrlKey&&k==='y')action('redo');else if(!e.ctrlKey&&k==='b')action(e.shiftKey?'after':'before');else if(k==='delete')action('delete');else if(!e.ctrlKey&&!e.altKey&&!e.metaKey&&(k==='pagedown'||k==='arrowdown'||k===' '))flip(1).catch(error);else if(!e.ctrlKey&&!e.altKey&&!e.metaKey&&(k==='pageup'||k==='arrowup'))flip(-1).catch(error);else handled=false;
 if(handled)e.preventDefault();
});
for(const [id,d]of [['lower',1],['upper',-1]]){
 $(id).addEventListener('pointerdown',async e=>{
  if(e.button!==0||animating||!state)return;const index=spread*2+(d===1?0:-1);if(!slot(index))return;
  select(index,false);const candidate={id:e.pointerId,y:e.clientY,d,angle:d===1?0:180,released:false};drag=candidate;$(id).setPointerCapture(e.pointerId);
  if(!await prepare(d)){drag=null;return;}if(candidate.released){await settle(d,false,candidate.angle);drag=null;}
 });
 $(id).addEventListener('pointermove',e=>{if(!drag||!animating||e.pointerId!==drag.id)return;const delta=(drag.y-e.clientY)/Math.max(100,$('book').clientHeight/2)*180;drag.angle=Math.max(0,Math.min(180,(drag.d===1?0:180)+delta));$('flipper').style.transform='rotateX('+drag.angle+'deg)';});
 const release=async e=>{if(!drag||e.pointerId!==drag.id)return;drag.released=true;if($('flipper').style.display!=='block')return;const item=drag;drag=null;await settle(item.d,e.type!=='pointercancel'&&(item.d===1?item.angle>65:item.angle<115),item.angle);};
 $(id).addEventListener('pointerup',e=>release(e).catch(error));$(id).addEventListener('pointercancel',e=>release(e).catch(error));
 $(id).oncontextmenu=e=>{e.preventDefault();const i=spread*2+(d===1?0:-1);if(slot(i)){select(i,false);context(e,i);}};
}
let resizeTimer;new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(!animating)show().catch(error);},150);}).observe($('workspace'));
async function receive(data){
 if(data.kind!=='state')return;
 const changed=rev!==data.revision||!pdf;state=data;selected=data.selected;spread=selected%2?(selected+1)/2:selected/2;
 if(changed){
  rev=data.revision;epoch++;loading=true;pdf=null;
  overviewObserver?.disconnect();$('overviewGrid').replaceChildren();$('overviewScroll').scrollTop=0;cache=new Map();thumbCache=new Map();observer?.disconnect();thumbQueue=Promise.resolve();
  drag=null;animating=false;
  $('flipper').getAnimations().forEach(a=>a.cancel());$('flipper').style.display='none';
  $('context').hidden=true;if($('jumpDialog').open)$('jumpDialog').close();
  $('bookArea').hidden=true;$('list').replaceChildren();$('details').replaceChildren();$('filename').textContent=data.name;
  try {
   // PDF.js 6 exposes destroy() on PDFDocumentLoadingTask, not PDFDocumentProxy.
   const previousTask=loadingTask;loadingTask=null;if(previousTask)await previousTask.destroy();
   loadingTask=pdfjs.getDocument({url:'https://document.local/source.pdf?v='+rev,cMapUrl:'pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'pdfjs/standard_fonts/',wasmUrl:'pdfjs/wasm/',iccUrl:'pdfjs/iccs/',isEvalSupported:false,enableXfa:false});
   pdf=await loadingTask.promise;
  } finally {loading=false;}
 }
 $('empty').hidden=true;$('bookArea').hidden=false;$('counts').textContent=(count()+1)+' 组视图 · '+state.pages.length+' 个输出页';
 for(const id of ['saveToolbar','zoomLevel','fitWindow'])$(id).disabled=false;
 $('zoomOut').disabled=zoom<=.75;$('zoomIn').disabled=zoom>=2;
 $('overviewToggle').disabled=false;rebuildList();rebuildOverview();await show();
}
let receiveQueue=Promise.resolve();
window.chrome?.webview?.addEventListener('message',e=>{receiveQueue=receiveQueue.then(()=>receive(e.data)).catch(error);});
for(const id of ['before','after','standalone','delete','undo','redo','prev','next','jump'])$(id).disabled=true;
$('jump').disabled=false;
send('ready');
document.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';});
document.addEventListener('drop',e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)window.chrome?.webview?.postMessageWithAdditionalObjects({action:'drop'},[f]);});
