import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {serve} from './serve.mjs';
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/editor.html`);await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');await page.locator('[data-preset=camp]').click();
 await page.evaluate(async()=>{
  const {CharacterCreator}=await import('/editor/character-creator.js'),open=CharacterCreator.prototype.open;
  CharacterCreator.prototype.open=function(...args){
   window.creator=this;if(!this.failureProbe){this.failureProbe=true;const prepare=this.art.appearances.prepare.bind(this.art.appearances);window.previewAttempts=0;this.art={...this.art,appearances:{...this.art.appearances,prepare:async appearance=>{window.previewAttempts++;if(window.previewAttempts===1)throw Error('Controlled artwork preparation failure');return prepare(appearance);}}};}
   return open.apply(this,args);
  };
 });
 await page.locator('#creator-residents > summary').click();const person=page.locator('[data-resident="resident-iara"]');await person.locator(':scope > summary').click();await person.locator('[data-open-character]').click();
 const dialog=page.locator('#character-creator'),retry=dialog.getByRole('button',{name:'Retry preview',exact:true});await retry.waitFor({state:'visible'});
 await mkdir('artifacts/character-preview-retry',{recursive:true});await page.screenshot({path:'artifacts/character-preview-retry/failure.png'});
 const before=await page.evaluate(()=>({person:structuredClone(window.creator.person()),history:window.creator.history()}));assert.equal(await page.evaluate(()=>window.creator.sheets),null);assert.equal(await page.evaluate(()=>window.creator.frame),null);
 await retry.click();await page.waitForFunction(()=>window.creator.sheets!==null&&document.querySelector('[data-character-preview]').dataset.look==='iara');assert.equal(await retry.isVisible(),false);await page.screenshot({path:'artifacts/character-preview-retry/recovered.png'});assert.equal(await page.evaluate(()=>window.previewAttempts),2);
 assert.deepEqual(await page.evaluate(()=>({person:structuredClone(window.creator.person()),history:window.creator.history()})),before,'Retry must not edit the character or history');
 // A late rejected preparation from a closed dialog must not install an error.
 await page.evaluate(()=>{window.creator.art.appearances.prepare=()=>new Promise((_,reject)=>{window.rejectPreview=reject;});void window.creator.load(window.creator.appearance);});
 await dialog.getByRole('button',{name:'Done',exact:true}).click();await page.waitForFunction(()=>window.creator.id===null);await page.evaluate(()=>window.rejectPreview(Error('Late closed-dialog failure')));await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
 assert.equal(await page.evaluate(()=>window.creator.retry.hidden),true);assert.equal(await page.evaluate(()=>window.creator.frame),null);assert.equal(await page.evaluate(()=>window.creator.sheets),null);assert.deepEqual(errors,[]);
 console.log('PASS visible retry after controlled preview failure, successful real artwork reload, unchanged character/history, and ignored late closed-dialog failure.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
