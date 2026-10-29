import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/editor.html`);await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
 await page.evaluate(async()=>{
  const {EditorMap}=await import('/editor/map-view.js'),set=EditorMap.prototype.set;
  EditorMap.prototype.set=function(...args){
   if(!this.preview&&!this.failureProbe){
    this.failureProbe=true;window.observedMap=this;const appearances=this.art.appearances;window.artworkAttempts=0;
    this.art={...this.art,appearances:{...appearances,isReady:()=>false,prepare:async appearance=>{window.artworkAttempts++;if(window.artworkAttempts===1)throw Error('Controlled editor artwork failure');return appearances.prepare(appearance);}}};
   }
   return set.apply(this,args);
  };
 });
 await page.locator('[data-preset=camp]').click();const retry=page.getByRole('button',{name:'Retry resident artwork',exact:true});await retry.waitFor({state:'visible'});
 const canvas=page.locator('#creator-map');assert.equal(await canvas.getAttribute('aria-busy'),'false');assert.equal(await canvas.evaluate(c=>c.style.pointerEvents),'none');
 const before=await page.evaluate(()=>({definition:structuredClone(window.observedMap.document),view:window.observedMap.state}));
 await mkdir('artifacts/editor-artwork-retry',{recursive:true});await page.screenshot({path:'artifacts/editor-artwork-retry/failure.png'});
 // Keyboard activation is a real public button interaction.
 await retry.focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>window.observedMap.artLoading===false&&window.observedMap.terrainLoading===false);
 assert.equal(await retry.isVisible(),false);assert.equal(await canvas.evaluate(c=>c.style.pointerEvents),'');assert.equal(await canvas.getAttribute('aria-busy'),'false');
 assert.deepEqual(await page.evaluate(()=>({definition:structuredClone(window.observedMap.document),view:window.observedMap.state})),before,'Retry changed authored data or camera');
 assert(await page.evaluate(()=>window.artworkAttempts)>5,'Retry did not invoke artwork preparation');await page.screenshot({path:'artifacts/editor-artwork-retry/recovered.png'});// An older rejected preparation must not replace a newer successful map.
 await page.evaluate(()=>{const map=window.observedMap,prepare=map.art.appearances.prepare;let pending=true;map.art.appearances.prepare=appearance=>pending?new Promise((_,reject)=>{(window.staleRejects??=[]).push(reject);}):prepare(appearance);map.set(map.document,map.snapshot,null);pending=false;map.set(map.document,map.snapshot,null);});
 await page.waitForFunction(()=>window.observedMap.artLoading===false);await page.evaluate(()=>window.staleRejects.forEach(reject=>reject(Error('Stale previous artwork failure'))));await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));assert.equal(await retry.isVisible(),false);assert.equal(await page.evaluate(()=>window.observedMap.artError),null);assert.deepEqual(errors,[]);
 console.log('PASS failed artwork exposes keyboard-operable recovery, settled busy status, blocked placement until real artwork readiness, unchanged definition/camera, restored map and ignored stale preparation failures.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
