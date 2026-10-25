import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const root='assets/art-direction/character-prototype-v1/body-family-relaxed-v1',reference=JSON.parse(await readFile(root+'/accessories-v1/review-materials-v11.json')),returns=JSON.parse(await readFile(root+'/complete-parts-v1/review-materials-v11.json')).returnHashes,server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port+'/retained-family-verification');
 const result=await page.evaluate(async({reference,returns})=>{
  const {createBundledPartComposer}=await import('/resident-family-parts.js'),composer=createBundledPartComposer(),hash=async frame=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',frame.getContext('2d').getImageData(0,0,256,256).data))].map(v=>v.toString(16).padStart(2,'0')).join(''),check=(ok,message)=>{if(!ok)throw Error(message);},palettes=[{skin:'warm',shirt:'cream',shorts:'cream',shoes:'brown'},{skin:'copper',shirt:'teal',shorts:'sage',shoes:'graphite'}],flags=[{},{hat:'straw-v1'},{facialHair:'short-chestnut-v1'},{hat:'straw-v1',facialHair:'short-chestnut-v1'}];let compared=0,recovered=0,first=null;
  try{
   for(const hair of ['curls','sidepart'])for(const [palette,materials]of palettes.entries())for(const [option,accessories]of flags.entries()){
    const provider=await composer.compose({body:'relaxed-v1',assetVersion:'resident-parts-v2',hair:hair==='curls'?'short-curls-v1':'side-part-v1',hairColour:palette?'silver':'chestnut',materials,...accessories});
    for(const record of reference.hashes.filter(r=>r.hair===hair&&r.palette===palette&&r.option===option)){check(await hash(provider.frameForPose(record.sheet,record.index))===record.sha256,'Retained frame changed reviewed pixels');compared++;}
    if(option===0)for(const record of returns.filter(r=>r.style===hair&&r.palette===palette)){check(await hash(provider.frameForPose('activities',record.index,{sequenceIndex:5}))===record.sha256,'Feeding recovery pixels changed');recovered++;}
    if(!first)first={provider,hash:await hash(provider.frameForPose('base',0))};
   }
   check(composer.info().entries===2&&composer.info().leases===0,'Internal leases/cache not bounded');
   let rejected=0;for(const [sheet,index]of [['other',0],['base',16],['base',0.5]])try{first.provider.frameForPose(sheet,index);}catch{rejected++;}check(rejected===3,'Invalid poses accepted');
   const closing=composer.dispose();check(closing===composer.dispose(),'Disposal not idempotent');await closing;
   check(await hash(first.provider.frameForPose('base',0))===first.hash,'A retained preview was erased by eviction/disposal');
   let closed=false;try{await composer.compose({});}catch{closed=true;}check(closed,'Closed composer accepted work');
   return {compared,recovered,retainedAfterEvictionAndDisposal:true,rejected};
  }finally{await composer.dispose();}
 },{reference,returns});assert.equal(result.compared,768);assert.equal(result.recovered,8);assert.deepEqual(errors,[]);console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
