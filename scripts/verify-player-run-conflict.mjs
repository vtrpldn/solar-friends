import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {closeValidationBrowser} from './close-validation-browser.mjs';
const frozenRelease=process.argv.includes('--frozen');
const output=process.argv[2]??'artifacts/player-run-conflict';await mkdir(output,{recursive:true});
const paths=['scripts/verify-player-run-conflict.mjs','web/player-session.js','web/content-library.js','web/main.js'];const sha=b=>createHash('sha256').update(b).digest('hex'),inputs=Object.fromEntries(await Promise.all(paths.map(async p=>[p,sha(await readFile(p))])));
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1600,height:1000}}),a=await context.newPage(),b=await context.newPage(),errors=[];
 for(const p of [a,b]){p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());}
 const ready=p=>p.waitForFunction(()=>window.solarDev),snapshot=p=>p.evaluate(()=>window.solarDev.snapshot()),pause=async p=>{if(await p.locator('#pause').getAttribute('aria-label')==='Pause simulation')await p.locator('#pause').click();},save=async p=>{const button=p.getByRole('button',{name:'Save checkpoint',exact:true});await button.click();await button.waitFor({state:'visible'});await p.waitForFunction(()=>[...document.querySelectorAll('.creation-session button')].find(b=>b.textContent==='Save checkpoint')?.disabled===false);};
 const read=(p,id)=>p.evaluate(async id=>{const {ContentLibrary}=await import('/content-library.js'),l=new ContentLibrary(undefined,{broadcast:false});try{return await l.getRun(id);}finally{l.close();}},id);
 await a.goto(`http://127.0.0.1:${server.address().port}/editor.html`);await a.waitForFunction(()=>document.body.dataset.creatorReady==='true');await a.locator('[data-example=first-clearing]').click();await a.waitForFunction(()=>document.querySelector('#creator-save-status').textContent.startsWith('Saved'));const projectId=new URL(a.url()).searchParams.get('project');
 let frozenId=null;
 if(frozenRelease){
  const release=async author=>{await a.locator('#creator-release').click();await a.locator('#creator-release-author').fill(author);await a.locator('#creator-release-confirm').click();await a.locator('#creator-release-dialog').waitFor({state:'hidden'});await a.locator('#creator-library-dialog').waitFor({state:'visible'});};
  const releases=()=>a.evaluate(async()=>{const {ContentLibrary}=await import('/content-library.js'),l=new ContentLibrary(undefined,{broadcast:false});try{return await l.listReleases();}finally{l.close();}});
  await release('Original storytellers');const source=(await releases())[0];await a.locator(`[data-copy-release="${source.id}"]`).click();await a.waitForFunction(()=>document.querySelector('#creator-save-status').textContent.startsWith('Saved'));await release('Our friends');frozenId=(await releases()).find(r=>r.id!==source.id).id;
  await a.locator(`[data-play-release="${frozenId}"]`).click();
 }else{await a.locator('#creator-library').click();await a.locator(`[data-play-project="${projectId}"]`).click();}
 await a.waitForURL(/\?run=/);await ready(a);await pause(a);await save(a);const id=new URL(a.url()).searchParams.get('run'),runURL=a.url();
 if(frozenRelease){
  const c=await context.newPage();c.on('dialog',d=>d.accept());await c.goto(`http://127.0.0.1:${server.address().port}/editor.html?library=1`);await c.waitForFunction(()=>document.body.dataset.creatorReady==='true');await c.locator(`[data-remove-release="${frozenId}"]`).click();await c.locator('#creator-delete-confirm').click();await c.locator(`[data-remove-release="${frozenId}"]`).waitFor({state:'detached'});await c.close();
 }
 await b.goto(runURL);await ready(b);await pause(b);await b.locator('#pause').click();await b.waitForTimeout(250);await pause(b);await save(b);const winner=await read(b,id);
 await a.locator('#pause').click();await a.waitForTimeout(150);await pause(a);const local=await snapshot(a);await save(a);const copyButton=a.getByRole('button',{name:'Save independent copy',exact:true});await copyButton.waitFor({state:'visible'});
 assert.deepEqual(await read(a,id),winner,'Stale run overwrote the newer checkpoint');assert.deepEqual(await snapshot(a),local);const recovery=await a.evaluate(id=>JSON.parse(sessionStorage.getItem('solar-friends-run-recovery:'+id)),id);assert.deepEqual(JSON.parse(recovery.snapshot),local);
 await a.screenshot({path:output+'/conflict.png'});
 // A failed copy must not change run identity or discard the local state.
 await a.evaluate(()=>{window.originalRunPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='runs')throw new DOMException('Injected copy storage full','QuotaExceededError');return window.originalRunPut.apply(this,args);};});
 await copyButton.click();await a.waitForFunction(()=>[...document.querySelectorAll('.creation-session button')].find(b=>b.textContent==='Save independent copy')?.disabled===false);assert.equal(new URL(a.url()).searchParams.get('run'),id);assert.deepEqual(await snapshot(a),local);assert.deepEqual(await read(a,id),winner);
 await a.evaluate(()=>{IDBObjectStore.prototype.put=window.originalRunPut;delete window.originalRunPut;});await copyButton.click();await a.waitForURL(u=>u.searchParams.get('run')!==id);const copyId=new URL(a.url()).searchParams.get('run'),copy=await read(a,copyId);
 assert.deepEqual(JSON.parse(copy.snapshot),local);assert.deepEqual(copy.definition,winner.definition);assert.deepEqual(copy.release,winner.release??null);if(frozenRelease){assert.equal(copy.release.author,'Our friends');assert.equal(copy.release.content_revision,1);assert(copy.release.credits.some(c=>c.author==='Original storytellers'));}assert.equal(copy.sessionKind,'scenario');assert.equal(copy.projectId,null);assert.match(copy.title,/ · copy$/);assert.deepEqual(await read(a,id),winner);assert(await a.getByRole('button',{name:'Save independent copy',exact:true}).isHidden());
 await a.screenshot({path:output+'/independent-copy.png'});
 // Hold first animation callbacks only for observing the installed checkpoint
 // before normal scenario time can advance. Pause still uses the real control.
 await a.addInitScript(()=>{const raf=window.requestAnimationFrame.bind(window),pending=[];window.requestAnimationFrame=callback=>{if(callback.name!=='frame')return raf(callback);pending.push(callback);return pending.length;};window.releaseCheckpointFrames=()=>{window.requestAnimationFrame=raf;for(const callback of pending)raf(callback);};});
 await a.reload();await ready(a);await pause(a);assert.deepEqual(await snapshot(a),local,'Independent checkpoint did not reload exactly');assert.deepEqual(await read(a,id),winner);await a.evaluate(()=>window.releaseCheckpointFrames());assert.deepEqual(errors,[]);
 for(const p of paths)assert.equal(sha(await readFile(p)),inputs[p]);await writeFile(output+'/report.json',JSON.stringify({completed:true,inputs,frozenRelease,checks:{publicScenarioStart:true,realTwoTabRunConflict:true,newerRunExact:true,localRecoveryExact:true,copyQuotaFailurePreservesIdentityAndState:true,independentCopySnapshotExact:true,frozenDefinitionPreserved:true,...(frozenRelease?{sourceReleaseDeleted:true,embeddedReleaseAuthorVersionCreditsExact:true}:{}),newRunId:true,copyReloadExact:true,browserErrors:errors},scope:'Two real paused scenario run tabs with ordinary time controls, checkpoint Save, independent-copy quota failure/retry and reload. Reload first-animation callbacks held until public Pause to observe exact installed checkpoint before time advances. No direct game mutation or run record writes.'},null,2)+'\n');console.log('PASS stale scenario checkpoint preserves newer run; independent copy survives quota retry and reload with exact local snapshot and frozen definition.');
}finally{await closeValidationBrowser(browser,server);}
