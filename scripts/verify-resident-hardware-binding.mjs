import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const output=process.argv[2]??'artifacts/resident-hardware-binding';
const headed=process.argv.includes('--headed');
const files=['scripts/verify-resident-hardware-binding.mjs','web/sprite-frames.js','web/character-body-frames.js','web/character-contact-frame.js','web/character-contact-atlas.js','web/character-body-family.js','web/character-attachments.js','web/character-family-appearance.js','web/art/characters/relaxed-sleep-v1/bundle-v1.json'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const inputs=Object.fromEntries(await Promise.all(files.map(async file=>[file,sha(await readFile(file))])));
await mkdir(output,{recursive:true});const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:!headed});
 const cdp=await browser.newBrowserCDPSession(),gpu=(await cdp.send('SystemInfo.getInfo')).gpu;await cdp.detach();
 const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/resident-binding-check`);
 const result=await page.evaluate(async()=>{
  const {prepareBodyFamily}=await import('/character-body-family.js'),{loadCharacterImageSource}=await import('/character-image-source.js'),{canonical}=await import('/editor/journal.js');
  const data=await(await fetch('/art/characters/relaxed-sleep-v1/bundle-v1.json')).json(),sources={};
  for(const [id,file]of Object.entries(data.bodySources))sources[id]=await loadCharacterImageSource(data.sources[file].url);
  const family=await prepareBodyFamily({ownership:data.ownership,sources});let frames=0;
  try{for(const owner of Object.values(data.owners)){
   if(canonical(owner.body)!==canonical(family.binding))throw Error('Prepared body differs from immutable hair registration.');
   for(const sheet of ['base','idle','activities'])for(let i=0;i<16;i++){
    if(owner.body.frames[sheet][i]!==family.binding.frames[sheet][i])throw Error('Prepared pose identity changed.');frames++;
   }
  }}finally{family.dispose();for(const source of Object.values(sources))source.dispose?.();}
  const {prepareBundledSleepResidentFamily,prepareBundledSleepShirtResidentFamily}=await import('/character-sleep-family-bundle.js');let composed=0;
  for(const prepare of [prepareBundledSleepResidentFamily,prepareBundledSleepShirtResidentFamily]){
   const library=await prepare({maxEntries:1,maxConcurrent:1,maxQueued:1});
   try{const lease=await library.acquire({hair:'curls',hairColour:'chestnut',materials:{skin:'copper',shirt:'teal',shorts:'sage',shoes:'graphite'},hat:'straw-v1',facialHair:'short-chestnut-v1'});
    try{for(const sheet of ['base','idle','activities'])for(let i=0;i<16;i++){
     const frame=lease.provider.frameForPose(sheet,i);if(frame.width!==256||frame.height!==256)throw Error('Incomplete composed resident pose.');composed++;
    }}finally{lease.release();}
   }finally{await library.dispose();}
  }
  return {immutableHairPoseComparisons:frames,composedPoses:composed};
 });
 assert.equal(result.immutableHairPoseComparisons,96);assert.equal(result.composedPoses,96);assert.deepEqual(errors,[]);
 for(const file of files)assert.equal(sha(await readFile(file)),inputs[file]);
 const report={passed:true,headed,browserVersion:browser.version(),gpu,inputs,...result,errors,scope:'Exact immutable body/hair bindings and complete v5/v6 accessory-bearing composition on the recorded browser backend. Not visual approval or proof across every GPU/browser.'};
 await writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,headed,...result,gpu:gpu.devices}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
