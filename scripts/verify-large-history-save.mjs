import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import init,{Game} from '../web/pkg/solar_friends.js';
import {serve} from './serve.mjs';

const output=process.argv[2]??'/tmp/solar-large-history-save';await mkdir(output,{recursive:true});
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const game=new Game(),definition=JSON.parse(game.scenario_template('sandbox'));
definition.map.terrain=JSON.parse(game.terrain_template());game.free();
const baselinePath=process.argv.find(arg=>arg.startsWith('--baseline-document='))?.slice(20);
const baselineSource=baselinePath?await readFile(baselinePath):null;
const baselineEditorPath=process.argv.find(arg=>arg.startsWith('--baseline-editor='))?.slice(18);
const baselineEditor=baselineEditorPath?await readFile(baselineEditorPath):null;
const server=await serve(0,{handle:(_req,res,path)=>{const source=path==='/editor/document.js'?baselineSource:path==='/editor/index.js'?baselineEditor:null;if(!source)return false;res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'}).end(source);return true;}});let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/`);
 const fixture=await page.evaluate(async definition=>{
  const {EditorDocument}=await import('/editor/document.js'),{ContentLibrary}=await import('/content-library.js');
  const doc=new EditorDocument(definition);
  for(let n=0;n<96;n++)doc.transact('Whole-property fertility '+n,d=>{for(const cell of d.map.terrain)cell.fertility=.2+n*.005;});
  const checkpoint=doc.checkpoint(),bytes=new TextEncoder().encode(JSON.stringify(checkpoint.history)).length;
  const library=new ContentLibrary();await library.saveProject({id:'large-history',checkpoint});
  return {bytes,steps:checkpoint.history.past.length,revision:checkpoint.revision,definition:checkpoint.definition};
 },definition);
 assert(fixture.bytes>7*1024*1024&&fixture.bytes<8*1024*1024,`Expected near-limit journal, got ${fixture.bytes}`);
 const validator=new Game();try{assert.equal(JSON.parse(validator.validate_scenario(JSON.stringify(fixture.definition))).ok,true);}finally{validator.free();}
 await page.addInitScript(()=>{
  window.checkpointStarts=0;window.historySaveProbe=[];window.savePhaseProbe=[];window.trackSavePhases=false;
  const measure=(name,fn)=>function(...args){const start=performance.now();try{return fn.apply(this,args);}finally{const ms=performance.now()-start;if(window.trackSavePhases&&ms>=1)window.savePhaseProbe.push({name,ms});}};
  JSON.stringify=measure('JSON.stringify',JSON.stringify);window.structuredClone=measure('structuredClone',window.structuredClone);Storage.prototype.setItem=measure('storage.setItem',Storage.prototype.setItem);Storage.prototype.getItem=measure('storage.getItem',Storage.prototype.getItem);IDBObjectStore.prototype.put=measure('indexedDB.put',IDBObjectStore.prototype.put);
  window.historySaveWrites=[];window.largeRecoveryParses=0;const parse=JSON.parse;JSON.parse=function(raw,...args){if(typeof raw==='string'&&raw.length>7*1024*1024&&raw.startsWith('{"storageRevision":'))window.largeRecoveryParses++;return parse.call(this,raw,...args);};
  window.historyProbeReady=Promise.all([import('/editor/document.js').then(({EditorDocument})=>{
   for(const name of ['checkpoint','markSaved']){const original=EditorDocument.prototype[name];EditorDocument.prototype[name]=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{window.historySaveProbe.push({name,ms:performance.now()-start});}};}
   if(EditorDocument.prototype.checkpointAsync){const original=EditorDocument.prototype.checkpointAsync;EditorDocument.prototype.checkpointAsync=async function(...args){
    window.checkpointStarts++;const start=performance.now();
    if(window.failNextCheckpoint){window.failNextCheckpoint=false;throw Error('Injected checkpoint preparation failure');}
    if(window.holdNextCheckpoint){window.holdNextCheckpoint=false;let first=true;args=[{yieldControl:async()=>{if(first){first=false;window.checkpointHeld=true;await new Promise(resolve=>window.releaseCheckpoint=resolve);}await new Promise(resolve=>setTimeout(resolve,0));}}];}
    try{return await original.apply(this,args);}finally{window.historySaveProbe.push({name:'checkpointAsyncElapsed',ms:performance.now()-start});}
   };}
  }),import('/content-library.js').then(({ContentLibrary})=>{for(const name of ['saveProject','savePreparedProject']){const original=ContentLibrary.prototype[name];if(!original)continue;ContentLibrary.prototype[name]=async function(...args){const record=await original.apply(this,args),checkpoint=record.checkpoint??args[0].checkpoint;window.historySaveWrites.push({revision:checkpoint.revision,funds:checkpoint.definition.start.funds});return record;};}})]);
 });
 const openStart=Date.now();await page.goto(`http://127.0.0.1:${server.address().port}/editor.html?project=large-history`);
 await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');await page.waitForFunction(()=>document.querySelector('#creator-map').getAttribute('aria-busy')==='false');
 const openElapsedMs=Date.now()-openStart;
 await page.locator('#creator-funds').fill('9001');await page.locator('#creator-funds').dispatchEvent('change');
 const sample=await page.evaluate(async()=>{
  await window.historyProbeReady;window.historySaveProbe=[];window.savePhaseProbe=[];window.trackSavePhases=true;let maxTimerGapMs=0,last=performance.now();
  const timer=setInterval(()=>{const now=performance.now();maxTimerGapMs=Math.max(maxTimerGapMs,now-last);last=now;},5);
  await new Promise(resolve=>setTimeout(resolve,10));const start=performance.now();document.querySelector('#creator-save').click();const synchronousMs=performance.now()-start;
  await new Promise((resolve,reject)=>{const deadline=performance.now()+30000;const check=()=>{if(document.querySelector('#creator-save-status').textContent==='Saved on this device')return resolve();if(performance.now()>deadline)return reject(Error('Save did not finish'));setTimeout(check,5);};check();});
  const saveElapsedMs=performance.now()-start;
  await new Promise(resolve=>setTimeout(resolve,10));clearInterval(timer);window.trackSavePhases=false;
  const {ContentLibrary}=await import('/content-library.js'),library=new ContentLibrary(),record=await library.getProject('large-history');
  return {synchronousMs,saveElapsedMs,elapsedWithDurableReadMs:performance.now()-start,maxTimerGapMs,calls:window.historySaveProbe,phases:window.savePhaseProbe,checkpoint:record.checkpoint};
 });
 assert.equal(sample.checkpoint.definition.start.funds,900100);
 const expected=structuredClone(fixture.definition);expected.start.funds=900100;assert.deepEqual(sample.checkpoint.definition,expected);
 const persisted=JSON.stringify(sample.checkpoint);delete sample.checkpoint;
 await page.reload();await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
 await page.waitForFunction(()=>document.querySelector('#creator-map').getAttribute('aria-busy')==='false');
 assert.equal(await page.locator('#creator-funds').inputValue(),'9001');
 const restored=await page.evaluate(async()=>{const {ContentLibrary}=await import('/content-library.js'),{EditorDocument}=await import('/editor/document.js');const record=await new ContentLibrary().getProject('large-history');const doc=EditorDocument.restore(record.checkpoint);return {recovered:doc.historyRecovered,checkpoint:JSON.stringify(doc.checkpoint())};});
 assert(!restored.recovered);assert.equal(restored.checkpoint,persisted);assert.deepEqual(errors,[]);
 await page.locator('#creator-undo').click();await page.waitForFunction(value=>document.querySelector('#creator-funds').value===String(value),fixture.definition.start.funds/100);
 await page.locator('#creator-redo').click();assert.equal(await page.locator('#creator-funds').inputValue(),'9001');
 let concurrentSave=null,preparationFailure=null,coalescedRequests=null;
 if(await page.evaluate(async()=>{const {EditorDocument}=await import('/editor/document.js');return typeof EditorDocument.prototype.checkpointAsync==='function';})){
  await page.locator('#creator-funds').fill('9002');await page.locator('#creator-funds').dispatchEvent('change');
  await page.evaluate(()=>{window.historySaveWrites=[];window.holdNextCheckpoint=true;});
  await page.locator('#creator-save').click();await page.waitForFunction(()=>window.checkpointHeld);
  coalescedRequests=await page.evaluate(()=>{const before=window.checkpointStarts;document.querySelector('#creator-save').click();document.querySelector('#creator-save').click();return {extraClicks:2,extraPreparations:window.checkpointStarts-before};});if(!baselineEditor)assert.equal(coalescedRequests.extraPreparations,0,'Identical pending saves repeated checkpoint preparation');
  await page.locator('#creator-funds').fill('9003');await page.locator('#creator-funds').dispatchEvent('change');
  await page.evaluate(()=>window.releaseCheckpoint());
  await page.waitForFunction(()=>window.historySaveWrites.some(w=>w.funds===900200));
  assert.equal(await page.locator('#creator-funds').inputValue(),'9003');
  await page.waitForFunction(()=>window.historySaveWrites.some(w=>w.funds===900300)&&document.querySelector('#creator-save-status').textContent==='Saved on this device');
  concurrentSave=await page.evaluate(async()=>{const {ContentLibrary}=await import('/content-library.js');const record=await new ContentLibrary().getProject('large-history');return {writes:window.historySaveWrites,current:record.checkpoint.definition.start.funds,previous:record.previous.checkpoint.definition.start.funds};});
  assert.equal(concurrentSave.current,900300);assert.equal(concurrentSave.previous,900200);
  assert(concurrentSave.writes.find(w=>w.funds===900300).revision>concurrentSave.writes.find(w=>w.funds===900200).revision);
  await page.locator('#creator-funds').fill('9004');await page.locator('#creator-funds').dispatchEvent('change');
  await page.evaluate(()=>{window.failNextCheckpoint=true;});await page.locator('#creator-save').click();
  await page.waitForFunction(()=>document.querySelector('#creator-save-status').textContent==='Could not save · export a copy');
  assert.equal(await page.locator('#creator-funds').inputValue(),'9004');
  const preserved=await page.evaluate(async()=>{const {ContentLibrary}=await import('/content-library.js');return (await new ContentLibrary().getProject('large-history')).checkpoint.definition.start.funds;});assert.equal(preserved,900300);
  await page.locator('#creator-save').click();await page.waitForFunction(()=>document.querySelector('#creator-save-status').textContent==='Saved on this device');
  const retried=await page.evaluate(async()=>{const {ContentLibrary}=await import('/content-library.js');return (await new ContentLibrary().getProject('large-history')).checkpoint.definition.start.funds;});assert.equal(retried,900400);
  preparationFailure={preservedFunds:preserved,retriedFunds:retried,liveEditPreserved:true};
 }
 assert.deepEqual(errors,[]);const largeRecoveryParses=await page.evaluate(()=>window.largeRecoveryParses);if(!baselineEditor)assert.equal(largeRecoveryParses,0,'Saving parsed the unchanged near-limit recovery envelope');
 await page.screenshot({path:output+'/editor.png'});
 const sources=['web/editor/document.js','web/editor/index.js','web/content-library.js','web/save-project-prepared.js','web/project-save-worker.js','web/pkg/solar_friends_bg.wasm'];
 const report={scope:'Isolated Chromium: native-validated property with near-limit fertility-edit history, seeded through ContentLibrary; public Save, reload, Undo and Redo. Timer gap is an instrumented local responsiveness sample, not sustained frame pacing.',largeRecoveryParses,historyBytes:fixture.bytes,historySteps:fixture.steps,openElapsedMs,sample,exactCheckpointReload:true,coalescedRequests,concurrentSave,preparationFailure,errors,sourceHashes:Object.fromEntries(await Promise.all(sources.map(async file=>[file,createHash('sha256').update(file==='web/editor/document.js'&&baselineSource?baselineSource:file==='web/editor/index.js'&&baselineEditor?baselineEditor:await readFile(file)).digest('hex')])))};
 await writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
