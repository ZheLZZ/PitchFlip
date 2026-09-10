// Real PDF.js/browser integration test; only the native WebView2 bridge is mocked.
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const web = process.env.PITCHFLIP_WEB || path.join(root, 'src/PitchFlip/Web');
const geometry = {x1:0,y1:0,x2:960,y2:540,cropX1:0,cropY1:0,cropX2:960,cropY2:540,rotation:0,width:960,height:540};
const message = (revision, n) => ({kind:'state', revision, name:`PitchFlip-${n}pages.pdf`, selected:0,
  dirty:false,canUndo:false,canRedo:false,pages:Array.from({length:n},(_,i)=>({id:`${revision}-${i}`,type:0,originalPageNumber:i+1,geometry}))});
const sources = new Map();
const mime = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm'};
const server = http.createServer((req,res)=>{
  const file=path.resolve(web,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(web+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try {
    const context=await browser.newContext();
    await context.route('https://document.local/**',async route=>{
      const revision=Number(new URL(route.request().url()).searchParams.get('v'));
      await route.fulfill({status:200,contentType:'application/pdf',headers:{'Access-Control-Allow-Origin':origin},
        body:sources.get(revision)||Buffer.from('invalid PDF')});
    });
    const page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{
      window.__messages=[];window.__listeners=[];
      window.chrome ||= {};window.chrome.webview={
        postMessage:m=>window.__messages.push(m),
        addEventListener:(name,fn)=>{if(name==='message')window.__listeners.push(fn);}
      };
      window.__deliver=data=>window.__listeners.forEach(fn=>fn({data}));
    });
    await page.goto(origin+'/index.html');
    await page.waitForFunction(()=>window.__messages.some(m=>m.action==='ready'));
    async function load(revision,n){
      sources.set(revision,fs.readFileSync(path.join(root,`samples/PitchFlip-${n}pages.pdf`)));
      await page.evaluate(data=>window.__deliver(data),message(revision,n));
      await page.waitForFunction(n=>document.getElementById('counts').textContent.includes(n+' 个输出页')&&
        document.getElementById('lower').querySelector('canvas')?.width>0,n,{timeout:10000});
      assert.equal(await page.locator('.slot').count(),n);
      assert.match(await page.locator('#filename').textContent(),new RegExp(`${n}pages`));
    }
    await load(1,6);
    assert.deepEqual(await page.locator('.sheet-group').evaluateAll(groups=>groups.map(g=>Array.from(g.querySelectorAll('.slot'),s=>Number(s.dataset.index)))),[[0],[1,2],[3,4],[5]]);
    assert.deepEqual(await page.locator('.sheet-group[data-spread="1"] .slot>span').allTextContents(),['上页 2','下页 3']);
    try { await load(2,10); } catch(e) {
      throw new Error('Second PDF failed: '+JSON.stringify(await page.evaluate(()=>window.__messages.filter(m=>m.action==='error'))),{cause:e});
    }
    // Jump beyond the old document's bounds, proving the new PDF renderer is used.
    await page.locator('#jump').click();await page.locator('#jumpNumber').fill('10');await page.locator('#jumpGo').click();
    await page.waitForFunction(()=>document.getElementById('topLabel').textContent.includes('输出 10')&&document.querySelector('#upper canvas')?.width>0);
    await load(3,200);await load(4,6);
    // A switch during an in-progress physical flip must leave navigation usable.
    await page.locator('#next').click();await load(5,10);
    await page.waitForTimeout(600);
    assert.equal(await page.locator('#position').textContent(),'封面');
    await page.locator('#next').click();await page.waitForFunction(()=>document.getElementById('position').textContent==='已翻 1 / 5 张');
    assert.deepEqual(errors,[]);
    assert.deepEqual(await page.evaluate(()=>window.__messages.filter(m=>m.action==='error')),[]);
    // Failed loads must not poison the queue or prevent retrying the same revision.
    await page.evaluate(data=>window.__deliver(data),message(6,6));
    await page.waitForFunction(()=>window.__messages.some(m=>m.action==='error'));
    await page.evaluate(()=>{window.__messages=[];});
    await load(6,6);await load(7,10);
    // Main-preview navigation must reveal the current thumbnail, including its
    // nearby insert controls, without moving keyboard focus into the sidebar.
    await load(8,200);await page.locator('#animation').uncheck();
    await page.locator('#jump').click();await page.locator('#jumpNumber').fill('121');await page.locator('#jumpGo').click();
    async function visibleSelection(index){
      await page.waitForFunction(index=>{
        const item=document.querySelector('.slot.selected'),pane=document.getElementById('sidebar');
        if(Number(item?.dataset.index)!==index)return false;
        const r=item.getBoundingClientRect(),v=pane.getBoundingClientRect();
        return r.top>=v.top+24&&r.bottom<=v.bottom-20;
      },index,{timeout:10000}).catch(async e=>{throw new Error(JSON.stringify(await page.evaluate(()=>({selected:document.querySelector(".slot.selected")?.dataset.index,position:document.getElementById("position").textContent,item:document.querySelector(".slot.selected")?.getBoundingClientRect().toJSON(),pane:document.getElementById("sidebar").getBoundingClientRect().toJSON()}))),{cause:e});});
    }
    await visibleSelection(120);
    await page.locator('#sidebar').evaluate(el=>{el.scrollTop=0;});
    await page.locator('#next').click();await visibleSelection(121);
    assert.equal(await page.evaluate(()=>document.activeElement.id),'next');
    await page.keyboard.press('ArrowDown');await visibleSelection(123);
    await page.keyboard.press('ArrowUp');await visibleSelection(121);
    await page.keyboard.press('b');
    assert.deepEqual(await page.evaluate(()=>window.__messages.filter(m=>m.action==='insert').at(-1)),{action:'insert',index:121});
    assert.equal(await page.locator('#upper').getAttribute('class'),'paper upper selected');
    await page.locator('#standalone').click();
    assert.deepEqual(await page.evaluate(()=>window.__messages.filter(m=>m.action==='standalone').at(-1)),{action:'standalone',index:121});
    await page.locator('.slot.selected').click({button:'right'});
    await page.locator('[data-action="standalone"]').click();
    assert.deepEqual(await page.evaluate(()=>window.__messages.filter(m=>m.action==='standalone').at(-1)),{action:'standalone',index:121});
    // Up/down inside the page-number input should edit the number, not flip.
    const position=await page.locator('#position').textContent();
    await page.locator('#jump').click();await page.locator('#jumpNumber').fill('10');await page.keyboard.press('ArrowUp');
    assert.equal(await page.locator('#jumpNumber').inputValue(),'11');
    assert.equal(await page.locator('#position').textContent(),position);await page.locator('#jumpCancel').click();
    // A physical drag uses the same sidebar selection/reveal path.
    const paper=await page.locator('#lower').boundingBox();
    await page.mouse.move(paper.x+paper.width/2,paper.y+paper.height*.85);await page.mouse.down();
    await page.waitForFunction(()=>document.getElementById('flipper').style.display==='block');
    await page.mouse.move(paper.x+paper.width/2,paper.y-paper.height*.25,{steps:12});await page.mouse.up();await visibleSelection(123);
    assert.deepEqual(await page.evaluate(()=>window.__messages.filter(m=>m.action==='error')),[]);
    await load(9,6);await page.locator('#animation').uncheck();
    await page.locator('#next').click();await visibleSelection(1);
    await page.locator('#prev').click();await visibleSelection(0);
    for(const i of [1,3,5]){await page.locator('#next').click();await visibleSelection(i);}
    assert.equal(await page.locator('#next').isDisabled(),true);
    const odd=message(10,6);odd.pages.pop();sources.set(10,fs.readFileSync(path.join(root,'samples/PitchFlip-6pages.pdf')));
    await page.evaluate(data=>window.__deliver(data),odd);
    await page.waitForFunction(()=>document.getElementById('counts').textContent.includes('5 个输出页'));
    for(const i of [1,3,5]){await page.locator('#next').click();await visibleSelection(i);}
    assert.equal(await page.locator('#standalone').isDisabled(),true);
    await load(11,200);await page.locator('#overviewToggle').click();
    assert.equal(await page.locator('.overview-card').count(),101);
    await page.waitForFunction(()=>document.querySelector('#overviewGrid canvas')?.width>0);
    const row=await page.locator('.overview-card').evaluateAll(items=>items.slice(0,3).map(e=>e.getBoundingClientRect().top));
    assert.equal(row[0],row[2]);
    const flipPosition=await page.locator('#position').textContent();
    await page.keyboard.press('PageDown');
    assert.ok(await page.locator('#overviewScroll').evaluate(e=>e.scrollTop)>0);
    assert.equal(await page.locator('#position').textContent(),flipPosition);
    await page.locator('#overviewSize').fill('160');
    await page.locator('#overviewScroll').evaluate(e=>e.scrollTop=0);
    assert.deepEqual(await page.locator('.overview-card[data-spread="1"] .overview-page').evaluateAll(items=>items.map(e=>e.dataset.index)),['1','2']);
    assert.deepEqual(await page.locator('.overview-card[data-spread="2"] .overview-page').evaluateAll(items=>items.map(e=>e.dataset.index)),['3','4']);
    assert.equal(await page.locator('.overview-binding').count(),101);
    await page.waitForFunction(()=>document.querySelector('.overview-page[data-index="8"] canvas')?.width>0);
    await page.screenshot({path:path.join(root,'artifacts/overview-preview.png')});
    await page.locator('.overview-page[data-index="150"]').click();
    assert.equal(await page.locator('#overview').isVisible(),false);await visibleSelection(150);
    await page.locator('#overviewToggle').click();
    const updated=message(11,200);updated.pages.splice(1,0,{id:'blank',type:1,geometry});updated.selected=1;
    await page.evaluate(data=>window.__deliver(data),updated);
    await page.waitForFunction(()=>document.querySelectorAll('.overview-page[data-index]').length===202);
    assert.equal(await page.locator('.overview-page.blank').count(),1);
    assert.equal(await page.locator('.overview-page.virtual').count(),1);
    await page.locator('.overview-page[data-index="2"]').click({button:'right'});
    await page.locator('[data-action="standalone"]').click();
    assert.deepEqual(await page.evaluate(()=>window.__messages.filter(m=>m.action==='standalone').at(-1)),{action:'standalone',index:2});
    sources.set(12,fs.readFileSync(path.join(root,'samples/PitchFlip-6pages.pdf')));
    await page.evaluate(data=>window.__deliver(data),message(12,6));
    await page.waitForFunction(()=>document.querySelectorAll('.overview-card').length===4&&document.querySelector('#overviewGrid canvas')?.width>0);
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>document.querySelector('#lower canvas')?.width>0);
    assert.equal(await page.locator('#overview').isVisible(),false);
    assert.deepEqual(await page.evaluate(()=>window.__messages.filter(m=>m.action==='error')),[]);
    // Verify the redesigned toolbar bridge, duplicate action controls and zoom.
    await page.locator('#openToolbar').click();
    assert.equal(await page.evaluate(()=>window.__messages.at(-1).action),'open');
    await page.locator('#saveToolbar').click();
    assert.equal(await page.evaluate(()=>window.__messages.at(-1).action),'save');
    await page.locator('[data-command="before"]').click();
    assert.deepEqual(await page.evaluate(()=>window.__messages.at(-1)),{action:'insert',index:0});
    assert.equal(await page.locator('#delete').isDisabled(),true);
    const fitWidth=await page.locator('#book').evaluate(e=>e.clientWidth);
    await page.locator('#zoomIn').click();
    await page.waitForFunction(w=>document.getElementById('book').clientWidth>w,fitWidth);
    await page.locator('#fitWindow').click();
    assert.equal(await page.locator('#book').evaluate(e=>e.clientWidth),fitWidth);
    await page.locator('#next').click();await visibleSelection(1);
    await page.setViewportSize({width:1400,height:800});
    await page.waitForTimeout(350);
    await page.screenshot({path:path.join(root,'artifacts/interface-redesign.png')});
    await page.setViewportSize({width:960,height:560});
    await page.waitForTimeout(350);
    await page.screenshot({path:path.join(root,'artifacts/interface-compact.png')});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    for(const id of ['saveToolbar','delete','fitWindow','next']){
      const box=await page.locator('#'+id).boundingBox();assert.ok(box.x>=0&&box.x+box.width<=960&&box.y+box.height<=560,id+' must stay in the viewport: '+JSON.stringify(box));
    }
    await page.screenshot({path:path.join(root,'artifacts/interface-compact.png')});
    if(process.env.PITCHFLIP_UPDATE_SCREENSHOTS==='1'){
      await page.setViewportSize({width:1400,height:800});
      await load(13,10);await load(14,6);await page.locator('#animation').uncheck();
      await page.locator('#next').click();await visibleSelection(1);
      await page.waitForFunction(()=>document.querySelector('#upper canvas')?.width>0&&document.querySelector('#lower canvas')?.width>0);
      await page.waitForTimeout(400);
      await page.screenshot({path:path.join(root,'docs/images/binding-preview.png')});
      const inserted=message(14,6);inserted.pages.splice(4,0,{id:'readme-blank',type:1,geometry});inserted.selected=5;inserted.dirty=true;inserted.canUndo=true;
      await page.evaluate(data=>window.__deliver(data),inserted);
      await visibleSelection(5);
      await page.waitForFunction(()=>document.querySelector('#upper canvas')?.width>0&&document.querySelector('#counts').textContent.includes('7 个输出页'));
      await page.waitForTimeout(400);
      await page.screenshot({path:path.join(root,'docs/images/insert-blank.png')});
      await page.locator('#overviewToggle').click();
      await page.locator('#overviewSize').fill('220');
      await page.waitForFunction(()=>document.querySelectorAll('#overviewGrid canvas').length===6);
      await page.screenshot({path:path.join(root,'docs/images/page-overview.png')});
    }
    console.log('PASS: PDF switching/recovery; sidebar follows button, arrow and drag navigation; insertion targets selection; input arrows do not flip.');
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
