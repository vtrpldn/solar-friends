import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const evidence='assets/art-direction/character-prototype-v1/short-sleeve-relaxed-feed-motion-v1';
const verification=JSON.parse(await readFile(evidence+'/verification-v1.json'));
const keys=Object.keys(verification.inputs),slots=keys.map((key,slot)=>{const match=key.match(/-(base|idle|activities)-(\d+)-/);return {sheet:match?.[1]??'base',index:match?Number(match[2]):Number(key.match(/-(?:walk|single)-(\d+)-/)[1]),slot};});
const reference=await readFile(evidence+'/curls-0-true.png');
const server=await serve(0,{handle(req,res,path){if(path!=='/shirt-reference.png')return false;res.writeHead(200,{'Content-Type':'image/png'}).end(reference);return true;}});let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/shirt-verification');
 const result=await page.evaluate(async slots=>{
  const check=(value,message)=>{if(!value)throw Error(message);};
  const {prepareBundledShirtResidentFamily}=await import('/character-family-bundle.js');
  const library=await prepareBundledShirtResidentFamily({maxEntries:1,maxConcurrent:1,maxQueued:1});
  try{
   const lease=await library.acquire({hair:'curls',hairColour:'chestnut',materials:{skin:'warm',shirt:'cream',shorts:'cream',shoes:'brown'},hat:'straw-v1',facialHair:'short-chestnut-v1'});
   let channels=0;
   try{
    const image=new Image();image.src='/shirt-reference.png';await image.decode();
    const board=document.createElement('canvas');board.width=image.width;board.height=image.height;board.getContext('2d').drawImage(image,0,0);
    for(const {sheet,index,slot}of slots){
     const frame=lease.provider.frameForPose(sheet,index),surface=document.createElement('canvas');surface.width=surface.height=256;const ctx=surface.getContext('2d');ctx.fillStyle='#e8dfbf';ctx.fillRect(0,0,256,256);ctx.drawImage(frame,0,0);
     // The reviewed board has labels only in its top 20 rows.
     const actual=ctx.getImageData(0,20,256,236).data,expected=board.getContext('2d').getImageData(slot%6*256,Math.floor(slot/6)*256+20,256,236).data;
     check(actual.every((value,i)=>value===expected[i]),'Bundled shirt differs from reviewed '+sheet+':'+index);channels+=actual.length;surface.width=surface.height=0;
    }
    board.width=board.height=0;
   }finally{lease.release();}
   check(library.info().clothingPoses===48&&library.info().leases===0,'Missing shirt poses or leaked lease');
   return {poses:slots.length,comparedChannels:channels};
  }finally{const closing=library.dispose();check(closing===library.dispose(),'Non-idempotent shirt disposal');await closing;check(library.info().closed&&library.info().clothingPoses===0,'Shirt disposal retained registrations');}
 },slots);
 assert.equal(result.poses,48);assert.deepEqual(errors,[]);
 await page.route('**/relaxed-shirt-v1/bundle-v1.json',route=>route.fulfill({status:200,body:'{}',contentType:'application/json'}));
 const refusal=await page.evaluate(async()=>{try{await (await import('/character-shirt-bundle.js')).loadBundledShirtDefinition();return false;}catch(error){return error.message==='The bundled shirt revision changed.';}});assert(refusal,'Changed bundle was accepted');
 console.log(JSON.stringify({...result,changedBundleRefused:refusal}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
