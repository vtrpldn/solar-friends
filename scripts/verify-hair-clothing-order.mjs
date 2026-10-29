import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/clothing-order`);
 const result=await page.evaluate(async()=>{
  const {prepareHairFamily}=await import('/character-hair-family.js'),{attachmentBinding}=await import('/character-attachments.js');
  const create=document.createElement.bind(document),body=create('canvas'),hair=create('canvas'),shirt=create('canvas');for(const c of [body,hair,shirt]){c.width=c.height=256;Object.defineProperties(c,{naturalWidth:{get:()=>c.width},naturalHeight:{get:()=>c.height}});}
  body.getContext('2d').fillStyle='#a0522d';body.getContext('2d').fillRect(100,60,50,160);hair.getContext('2d').fillStyle='#008000';hair.getContext('2d').fillRect(110,50,30,30);shirt.getContext('2d').fillStyle='#eedaB4';shirt.getContext('2d').fillRect(90,65,70,80);
  const sheets=['base','idle','activities'],all=Object.fromEntries(sheets.map(s=>[s,Array(16).fill(body)])),binding=await attachmentBinding(all,Object.fromEntries(sheets.map(s=>[s,'a'.repeat(64)]))),family={binding,frameForPose:()=>body,contactForPose:()=>[128,228]},hash='b'.repeat(64),hand=70*256+110,leg=200*256+110;
  const mask=(sheet,index,p)=>({schema:2,body:binding,sheet,index,size:256,runs:[[p,1]]}),poses=sheets.flatMap(sheet=>Array.from({length:16},(_,index)=>({sheet,index,source:'hair',bodyFrameSha256:binding.frames[sheet][index],transform:{rect:[0,0,256,256],scale:1,offset:[0,0]},translation:[0,0],foreground:index%2?mask(sheet,index,hand):null}))),registration={schema:1,body:binding,sources:{hair:{sha256:hash,width:256,height:256}},poses};
  const atlas={registration:{schema:1,body:binding,scale:1,sources:{shirt:{sha256:hash,width:256,height:256}},poses:poses.map(({sheet,index})=>({sheet,index,parts:[{source:'shirt',rect:[0,0,256,256],offset:[0,0]}]}))},sources:{shirt:{sourceHash:hash,image:shirt}}};
  const clothingForPose=(sheet,index)=>({atlas,colour:'teal',ownership:{schema:1,body:binding,sheet,index,bodyFrameSha256:binding.frames[sheet][index],foreground:mask(sheet,index,hand),preservedBody:mask(sheet,index,leg)}}),made=[];let prepared=null,refusals=0;
  document.createElement=(tag,...args)=>{const c=create(tag,...args);if(tag==='canvas')made.push(c);return c;};
  const released=()=>{if(made.some(c=>c.width||c.height))throw Error('Hair/clothing preparation retained an owned surface');};
  const pixel=(frame,x,y)=>Array.from(frame.getContext('2d').getImageData(x,y,1,1).data),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  try{
   prepared=await prepareHairFamily({family,registration,sources:{hair:{sourceHash:hash,image:hair}},clothingForPose});let checked=0;
   for(const sheet of sheets)for(let i=0;i<16;i++){
    const frame=prepared.frameForPose(sheet,i);if(!same(pixel(frame,120,75),[0,128,0,255]))throw Error('Garment covered hair');
    if(!same(pixel(frame,110,70),i%2?[160,82,45,255]:[0,128,0,255]))throw Error('Foreground hand/hair order changed');
    if(!same(pixel(frame,110,200),[160,82,45,255]))throw Error('Lower garment ownership changed');
    if(!same(pixel(frame,100,100),[64,130,126,255]))throw Error('Shirt palette was not composed below hair');
    if(!same(prepared.contactForPose(sheet,i),[128,228]))throw Error('Clothing changed contact');checked++;
   }
   prepared.dispose();prepared=null;released();
   for(const fail of ['missing-first','missing-last','wrong-pose-last']){
    made.length=0;let rejected=false;try{const p=await prepareHairFamily({family,registration,sources:{hair:{sourceHash:hash,image:hair}},clothingForPose:(s,i)=>fail==='missing-first'&&s==='base'&&i===0||fail==='missing-last'&&s==='activities'&&i===15?null:fail==='wrong-pose-last'&&s==='activities'&&i===15?clothingForPose('base',0):clothingForPose(s,i)});p.dispose();}catch{rejected=true;}
    if(!rejected)throw Error('Incomplete or wrong-pose clothing was silently substituted');released();refusals++;
   }
   return {syntheticFixture:true,poses:checked,refusals,allOwnedSurfacesReleased:true,scope:'Composition order and complete-pose refusal contract only; synthetic shapes are not art acceptance'};
  }finally{prepared?.dispose();document.createElement=create;for(const c of [body,hair,shirt])c.width=c.height=0;}
 });assert.equal(result.poses,48);assert.equal(result.refusals,3);await writeFile('assets/art-direction/character-prototype-v1/body-broad-v1/shirt-standing-review-v2/hair-order-checks.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
