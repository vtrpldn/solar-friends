import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const files=['scripts/verify-resident-artwork-disposal.mjs','web/appearance-cache.js','web/resident-parts.js','web/resident-appearance-library.js'],sha=b=>createHash('sha256').update(b).digest('hex'),inputs=Object.fromEntries(await Promise.all(files.map(async f=>[f,sha(await readFile(f))]))),server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/artwork-disposal-check`);
 const result=await page.evaluate(async()=>{
  const {createResidentAppearanceLibrary}=await import('/resident-appearance-library.js'),{residentPartRecipe}=await import('/resident-part-recipe.js');
  const check=(v,m)=>{if(!v)throw Error(m);},hash=async frame=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',frame.getContext('2d').getImageData(0,0,256,256).data))].map(n=>n.toString(16).padStart(2,'0')).join('');let frames=0,closedRefusals=0;
  for(const recipe of [{preset:'bento',version:1},residentPartRecipe({hair:'side-part-v1',hat:'straw-v1',facialHair:'short-chestnut-v1'}),{...residentPartRecipe({body:'relaxed-v1',hair:'side-part-v1',hat:'straw-v1',facialHair:'short-chestnut-v1'}),assetVersion:'resident-parts-v6'}]){
   const library=createResidentAppearanceLibrary(),provider=await library.prepare(recipe),before=[];
   for(const sheet of ['base','idle','activities'])for(let index=0;index<16;index++)before.push({sheet,index,hash:await hash(provider.frameForPose(sheet,index))});
   for(const index of [13,14])before.push({sheet:'activities',index,pose:{sequenceIndex:5},hash:await hash(provider.frameForPose('activities',index,{sequenceIndex:5}))});
   const undo=library.installPrepared([recipe],[provider]),closing=library.dispose();check(closing===library.dispose(),'Closing is not idempotent');await closing;check(library.isReady(recipe)===false&&library.partCacheInfo()===null,'Closed owner still retains ready caches');check(undo()===false,'A stale installation resurrected the closed owner');
   for(const {sheet,index,pose,hash:expected}of before){check(await hash(provider.frameForPose(sheet,index,pose))===expected,'Closing erased a borrowed prepared frame');frames++;}
   if(recipe.assetVersion==='resident-parts-v6')check(JSON.stringify(provider.contactForPose('base',15))==='[128,164]'&&provider.shadowForPose('base',15).radius[0]===110,'Closing erased borrowed ground metadata');
   for(const operation of [()=>library.prepare(recipe),()=>library.provider(recipe),()=>library.portraitFrame(recipe),()=>library.setActive([recipe]),()=>library.installPrepared([recipe],[provider])]){let denied=false;try{await operation();}catch{denied=true;}check(denied,'Closed library accepted new work');closedRefusals++;}
  }
  const immediate=createResidentAppearanceLibrary(),pending=immediate.prepare(residentPartRecipe({body:'relaxed-v1'})).then(()=>false,error=>/released/.test(error.message)),closing=immediate.dispose();check(await pending,'Close before module readiness published a provider');await closing;check(immediate.partCacheInfo()===null,'Close before module readiness created retained part resources');
  return {borrowedFramesPreserved:frames,closedOperationsRefused:closedRefusals,groundMetadataRetained:true,staleRollbackRefused:true,closeBeforePartImport:true};
 });assert.equal(result.borrowedFramesPreserved,150);assert.equal(result.closedOperationsRefused,15);
 let held;const blocked=new Promise(resolve=>{held=resolve;});await page.route('**/art/characters/relaxed-sleep-v1/bundle-v1.json',route=>held(route));
 await page.evaluate(async()=>{const {createResidentAppearanceLibrary}=await import('/resident-appearance-library.js'),{residentPartRecipe}=await import('/resident-part-recipe.js');window.disposalLibrary=createResidentAppearanceLibrary();window.disposalRecipe=residentPartRecipe({body:'relaxed-v1'});window.disposalPending=window.disposalLibrary.prepare(window.disposalRecipe).then(()=>({accepted:true}),error=>({accepted:false,error:error.message}));});
 const route=await blocked;
 await page.evaluate(()=>{window.disposalFinished=false;window.disposalClosing=window.disposalLibrary.dispose().then(()=>{window.disposalFinished=true;});});
 const rejected=await page.evaluate(()=>window.disposalPending);assert.equal(rejected.accepted,false);assert.match(rejected.error,/released/);assert.equal(await page.evaluate(()=>window.disposalFinished),false);
 await route.continue();await page.unroute('**/art/characters/relaxed-sleep-v1/bundle-v1.json');await page.evaluate(()=>window.disposalClosing);assert.equal(await page.evaluate(()=>window.disposalLibrary.partCacheInfo()),null);
 let holdClassic;const blockedClassic=new Promise(resolve=>{holdClassic=resolve;});
 await page.route('**/art/characters/prototype-v1/body-neutral-base.png',route=>holdClassic(route));
 await page.route('**/art/characters/prototype-v1/cook-equipment-pose-0-v3.json',route=>route.fulfill({contentType:'application/json',body:'{}'}));
 await page.evaluate(async()=>{const {createResidentAppearanceLibrary}=await import('/resident-appearance-library.js'),{residentPartRecipe}=await import('/resident-part-recipe.js');window.failedLibrary=createResidentAppearanceLibrary();window.failedPreparation=window.failedLibrary.prepare(residentPartRecipe()).then(()=>({accepted:true}),error=>({accepted:false,error:error.message}));});
 const classicRoute=await blockedClassic;
 await page.evaluate(()=>{window.failedCloseFinished=false;window.failedClosing=window.failedLibrary.dispose().then(()=>{window.failedCloseFinished=true;});});
 assert.equal((await page.evaluate(()=>window.failedPreparation)).accepted,false);assert.equal(await page.evaluate(()=>window.failedCloseFinished),false);
 await classicRoute.continue();await page.evaluate(()=>window.failedClosing);assert.equal(await page.evaluate(()=>window.failedLibrary.partCacheInfo()),null);
 let holdPreset;const blockedPreset=new Promise(resolve=>{holdPreset=resolve;});await page.route('**/art/animations/iara.png',route=>holdPreset(route));
 await page.evaluate(async()=>{const {createResidentAppearanceLibrary}=await import('/resident-appearance-library.js');window.presetLibrary=createResidentAppearanceLibrary();window.presetPreparation=window.presetLibrary.prepare({preset:'iara',version:1},{sheets:['base']}).then(()=>({accepted:true}),error=>({accepted:false,error:error.message}));});
 const presetRoute=await blockedPreset;
 await page.evaluate(()=>{window.presetCloseFinished=false;window.presetClosing=window.presetLibrary.dispose().then(()=>{window.presetCloseFinished=true;});});
 const presetResult=await page.evaluate(()=>window.presetPreparation);assert.equal(presetResult.accepted,false);assert.match(presetResult.error,/released/);assert.equal(await page.evaluate(()=>window.presetCloseFinished),false);
 await presetRoute.continue();await page.evaluate(()=>window.presetClosing);assert.equal(await page.evaluate(()=>window.presetLibrary.isReady({preset:'iara',version:1})),false);
 assert.deepEqual(errors,[]);for(const file of files)assert.equal(sha(await readFile(file)),inputs[file]);await writeFile('.github/builder-review/resident-artwork-disposal.json',JSON.stringify({...result,blockedPreparationDrained:true,failedParallelPreparationDrained:true,blockedPresetPreparationDrained:true,noLatePublication:true,inputs,scope:'Explicit appearance owner closure, active blocked preparation drain, closed API refusal, stale rollback isolation and preserved borrowed classic/v6 frames. Not total browser/GPU memory measurement or every mode transition.'},null,2)+'\n');console.log(JSON.stringify({...result,blockedPreparationDrained:true,failedParallelPreparationDrained:true,blockedPresetPreparationDrained:true,noLatePublication:true}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
