import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const files=['scripts/verify-public-sleep-family.mjs','src/resident_appearance/parts.rs','web/resident-part-recipe.js','web/resident-parts.js','web/resident-family-parts.js','web/character-sleep-family-bundle.js','web/character-sleep-family-bundle-index.js','web/resident-family-provider.js','web/editor/character-creator.js'],sha=b=>createHash('sha256').update(b).digest('hex'),inputs=Object.fromEntries(await Promise.all(files.map(async f=>[f,sha(await readFile(f))]))),server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/public-sleep-check`);
 const result=await page.evaluate(async()=>{
  const {createResidentPartLibrary}=await import('/resident-parts.js'),{residentPartRecipe}=await import('/resident-part-recipe.js'),{changeAppearanceField,appearanceFields}=await import('/resident-appearance-fields.js'),{prepareBundledSleepResidentFamily,prepareBundledSleepShirtResidentFamily}=await import('/character-sleep-family-bundle.js');
  const check=(v,m)=>{if(!v)throw Error(m);},hash=async frame=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',frame.getContext('2d').getImageData(0,0,256,256).data))].map(n=>n.toString(16).padStart(2,'0')).join(''),library=createResidentPartLibrary(),held=[];let poses=0,returns=0,metadata=0;
  for(const clothed of [false,true]){const expected=await (clothed?prepareBundledSleepShirtResidentFamily:prepareBundledSleepResidentFamily)({maxEntries:1});try{
   for(const hair of ['short-curls-v1','side-part-v1']){let recipe=residentPartRecipe({body:'relaxed-v1',hair,hairColour:'black',hat:'straw-v1',facialHair:'short-chestnut-v1',materials:{skin:'copper',shirt:'teal',shorts:'sage',shoes:'graphite'}});check(recipe.assetVersion==='resident-parts-v5','Fresh relaxed appearance selected an older bundle');if(clothed)recipe=changeAppearanceField(recipe,'appearance:top','resident-parts-v6');
    const [a,b]=await Promise.all([library.prepare(recipe),library.prepare(structuredClone(recipe))]);check(a===b&&library.provider(recipe)===a,'Public recipe work duplicated');
    const lease=await expected.acquire({hair:hair==='side-part-v1'?'sidepart':'curls',hairColour:'black',hat:'straw-v1',facialHair:'short-chestnut-v1',materials:recipe.materials});try{
     for(const sheet of ['base','idle','activities'])for(let index=0;index<16;index++){check(await hash(a.frameForPose(sheet,index))===await hash(lease.provider.frameForPose(sheet,index)),'Public frame differs from reviewed bundle');poses++;}
     for(const index of [13,14]){check(await hash(a.frameForPose('activities',index,{sequenceIndex:5}))===await hash(lease.provider.frameForPose('activities',index,{sequenceIndex:5})),'Public feeding return changed');returns++;}
     check(JSON.stringify(a.contactForPose('base',15))==='[128,164]'&&a.shadowForPose('base',15).radius[0]===110,'Public recipe lost sleeping ground metadata');metadata++;held.push({provider:a,hash:await hash(a.frameForPose('base',15))});
    }finally{lease.release();}
   }
  }finally{await expected.dispose();}}
  const host=document.createElement('div');let selectors=0;
  for(const version of ['resident-parts-v3','resident-parts-v4','resident-parts-v5','resident-parts-v6']){const recipe={...residentPartRecipe({body:'relaxed-v1'}),assetVersion:version};host.innerHTML=appearanceFields(recipe,[]);check(host.querySelector('[data-resident-field="appearance:top"]').value===version,'Opening an old/new recipe misrepresents its selected top');selectors++;}
  for(const {provider,hash:expected}of held)check(await hash(provider.frameForPose('base',15))===expected,'Public preview was erased by internal eviction');const cache=library.cacheInfo();check(cache.entries===4&&cache.sleepFamilyCache.leases===0&&cache.sleepShirtFamilyCache.leases===0,'Public sleep caches/leases escaped bounds');
  return {poseComparisons:poses,feedingReturns:returns,groundMetadataChecks:metadata,topSelectorsPreserved:selectors,sharedPreparation:true,retainedAfterPrivateEviction:true,publicEntries:cache.entries};
 });assert.equal(result.poseComparisons,192);assert.equal(result.feedingReturns,8);assert.deepEqual(errors,[]);for(const file of files)assert.equal(sha(await readFile(file)),inputs[file]);await writeFile('assets/art-direction/character-prototype-v1/sleep-body-study-v2/family-v2/public-renderer-verification-v1.json',JSON.stringify({...result,inputs,scope:'Public v5/v6 recipe dispatch, exact reviewed frames and returns, retained ground metadata, shared work, cache/lease bounds and accurate old/new top selectors. Creator/files/native saves are checked separately.'},null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
