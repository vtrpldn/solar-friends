// Internal body-source comparison; no public appearance or source pixel edits.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const root='assets/art-direction/character-prototype-v1/body-broad-v1';
const compact=process.argv.includes('--compact'),suffix=compact?'v4':'v1';
const files={candidate:root+`/sleep-candidate-${suffix}.png`,standing:root+'/breathe-candidate-v1.png',reference:'web/art/characters/relaxed-sleep-v1/sleep-body-v2.png'};
const hash=b=>createHash('sha256').update(b).digest('hex');
const sources=Object.fromEntries(await Promise.all(Object.entries(files).map(async([key,path])=>{const b=await readFile(path);return[key,{path,sha256:hash(b),data:b.toString('base64')}];})));
const standing=JSON.parse(await readFile(root+'/breathe-registration-v1.json'));
const bundle=JSON.parse(await readFile('web/art/characters/relaxed-sleep-v1/bundle-v1.json'));
const reference=bundle.ownership.sources.sleep.transform.registration;
const bytes=await readFile(files.candidate);
const registration={schema:1,family:'broad-body-prototype-v1',sheet:'base',source:{sha256:sources.candidate.sha256,width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)},uniformScale:compact?.155:.16,sourceContact:compact?[820,700]:[760,680],nativeContact:[128,164]};
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/sleep-review`);
 const result=await page.evaluate(async({sources,standing,reference,registration})=>{
  const {prepareContactBodyFrame}=await import('/character-contact-frame.js');
  const {prepareContactAtlasFrames}=await import('/character-contact-atlas.js');
  const {drawResidentAnimation}=await import('/resident-animation.js');
  const {unlitFilter}=await import('/power.js');
  const frames={},contacts={},measurements={};
  for(const [key,s]of Object.entries(sources)){
   const image=new Image();image.src='data:image/png;base64,'+s.data;await image.decode();
   if(key==='standing'){const prepared=prepareContactAtlasFrames({image,sourceHash:s.sha256},standing);frames[key]=prepared.frames[0];contacts[key]=prepared.contacts[0];for(const f of prepared.frames.slice(1))f.width=f.height=0;}
   else{const p=prepareContactBodyFrame({image,sourceHash:s.sha256},key==='candidate'?registration:reference);frames[key]=p.frame;contacts[key]=p.contact;measurements[key]={sourceBounds:p.bounds};}
   const rgba=frames[key].getContext('2d').getImageData(0,0,256,256).data;const digest=await crypto.subtle.digest('SHA-256',rgba);measurements[key]={...measurements[key],normalizedSha256:[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join(''),contact:contacts[key]};
  }
  const board=document.createElement('canvas');board.width=1800;board.height=800;const ctx=board.getContext('2d'),scratch=document.createElement('canvas');scratch.width=scratch.height=256;
  const keys=['standing','reference','candidate'];
  for(let row=0;row<2;row++)for(let col=0;col<3;col++){
   const x=col*600,y=row*400;ctx.fillStyle=row?'#233b47':'#93a653';ctx.fillRect(x,y,600,400);ctx.fillStyle='#fff';ctx.font='16px sans-serif';ctx.fillText(`${keys[col]} / ${row?'mirrored night':'day'}`,x+12,y+24);
   const key=keys[col],provider={frameForPose(sheet,index){if(sheet!=='base'||index!==15)throw Error('Only explicit review slot exists');return frames[key];},contactForPose(){return contacts[key];}};
   ctx.save();ctx.filter=unlitFilter(row);
   for(const [width,dx,dy]of [[256,280,290],[48,500,345]])drawResidentAnimation(ctx,scratch,provider,{layers:[{sheet:'base',row:3,frame:3,weight:1}],facing:row?-1:1,breath:1},x+dx,y+dy,width);
   ctx.restore();ctx.strokeStyle='#ecdb99';ctx.beginPath();ctx.moveTo(x+20,y+290);ctx.lineTo(x+450,y+290);ctx.stroke();
  }
  const pixels=board.toDataURL('image/png').split(',')[1];for(const f of Object.values(frames))f.width=f.height=0;scratch.width=scratch.height=0;
  return {measurements,pixels};
 },{sources,standing,reference,registration});
 assert.deepEqual(errors,[]);
 await writeFile(root+`/sleep-native-comparison-${suffix}.png`,Buffer.from(result.pixels,'base64'));
 await writeFile(root+`/sleep-registration-candidate-${suffix}.json`,JSON.stringify(registration,null,2)+'\n');
 await writeFile(root+`/sleep-native-review-${suffix}.json`,JSON.stringify({schema:1,status:'Native comparison awaiting visual verdict; no public integration',why:'Check genuine sleep anatomy and body scale using the existing explicit contact transform and native resident painter',measurements:result.measurements,inputs:Object.fromEntries(Object.entries(sources).map(([k,v])=>[v.path,v.sha256])),errors},null,2)+'\n');
 console.log('Prepared exact sleep sources, complete silhouette fit and six native-painter comparisons; no browser errors.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
