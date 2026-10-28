// Internal full-pose ownership only. No public recipe or fitted-part fallback.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const root='assets/art-direction/character-prototype-v1/body-broad-v1',hash=b=>createHash('sha256').update(b).digest('hex');
const read=async path=>JSON.parse(await readFile(root+'/'+path));
const ownership={schema:1,family:'broad-body-prototype-v1',sources:{},poses:{base:[],idle:[],activities:[]}},sources={},expected={base:[],idle:[],activities:[]},inputs={};
async function add(id,file,registrationFile,method,reviewFile,indices,targetSheet){
 const bytes=await readFile(root+'/'+file),registration=await read(registrationFile),report=await read(reviewFile),sha256=hash(bytes),{width,height}=registration.source;
 assert.equal(registration.source.sha256,sha256);assert.equal(registration.family,ownership.family);assert.equal(registration.sheet,targetSheet);
 sources[id]={path:root+'/'+file,sourceHash:sha256,data:bytes.toString('base64')};
 ownership.sources[id]={sha256,width,height,sheet:targetSheet,transform:{method,registration}};
 for(const index of indices){ownership.poses[targetSheet].push({source:id,index});const frame=report.normalized?.find(f=>f.index===index)?.sha256??report.measurements?.[id]?.[index]?.frameSha256??(id==='sleep'?report.measurements.candidate.normalizedSha256:undefined);assert.match(frame??'',/^[a-f0-9]{64}$/,id+':'+index+' lacks prior exact frame evidence');expected[targetSheet].push(frame);}
 for(const path of [file,registrationFile,reviewFile])inputs[root+'/'+path]=hash(await readFile(root+'/'+path));
}
await add('walk','walk-candidate-v3.png','walk-registration-v3-contacts.json','contact-atlas-v1','base-review-walk-v3-contacts.json',[0,1,2,3],'base');
await add('work','work-candidate-v2.png','work-registration-v2.json','contact-atlas-v1','work-native-review-v2.json',[0,1,2,3],'base');
await add('standing','breathe-candidate-v1.png','breathe-registration-v1.json','contact-atlas-v1','base-review-breathe-v1.json',[0,1,2,3],'base');
await add('seated','seated-candidate-v1.png','seated-registration-v1.json','waist-v1','base-review-seated-v1.json',[0,1,2],'base');
await add('sleep','sleep-candidate-v5.png','sleep-registration-candidate-v5.json','contact-v1','sleep-native-review-v5.json',[0],'base');
for(const [id,file,indices]of [['look','idle-look-candidate-v3.png',[0,1,2,3]],['stretch','idle-stretch-candidate-v1.png',[0,1,2,3]],['wave','idle-wave-candidate-v2.png',[0,1]],['wave-lower','idle-wave-candidate-v3.png',[2,3]],['relax','idle-relax-candidate-v2.png',[0,1,2,3]]])await add(id,file,'idle-review-v1/'+id+'-registration.json','contact-atlas-v1','idle-review-v1/report.json',indices,'idle');
for(const clip of ['cook','water','tend','feed']){const version=clip==='cook'?'v3':'v1';await add(clip,`activity-${clip}-candidate-${version}.png`,`activity-${clip}-registration-${version}.json`,'contact-atlas-v1',`activity-${clip}-native-review-${version}.json`,[0,1,2,3],'activities');}
assert.equal(Object.keys(sources).length,14);for(const sheet of Object.keys(expected))assert.equal(expected[sheet].length,16);
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/broad-family-review`);
 const result=await page.evaluate(async({ownership,sources,expected})=>{
  const {prepareBodyFamily}=await import('/character-body-family.js');
  const {validateBodyOwnership}=await import('/character-body-ownership.js');
  const {validateAttachmentBinding}=await import('/character-attachments.js');
  const {drawResidentAnimation}=await import('/resident-animation.js');
  const loaded={};for(const [id,s]of Object.entries(sources)){const image=new Image();image.src='data:image/png;base64,'+s.data;await image.decode();loaded[id]={image,sourceHash:s.sourceHash};}
  const created=[],create=document.createElement;document.createElement=function(tag,...rest){const el=create.call(this,tag,...rest);if(tag==='canvas')created.push(el);return el;};let family;
  try{family=await prepareBodyFamily({ownership,sources:loaded});}finally{document.createElement=create;}
  validateAttachmentBinding(family.binding);let exactFrames=0;
  for(const sheet of ['base','idle','activities'])for(let index=0;index<16;index++){if(family.binding.frames[sheet][index]!==expected[sheet][index])throw Error(`Assembled pixels changed: ${sheet}:${index}`);if(family.frameForPose(sheet,index)!==family.frames[sheet][index])throw Error('Provider ownership mismatch');exactFrames++;}
  const live=created.filter(c=>c.width&&c.height);if(live.length!==53||live.some(c=>c.width!==256||c.height!==256))throw Error('Unexpected owned frame count');
  const logicalFrames=new Set(Object.values(family.frames).flat());if(logicalFrames.size!==48)throw Error('Do not substitute a body pose');
  const scratch=document.createElement('canvas');scratch.width=scratch.height=256;const boards=[];
  for(const sheet of ['base','idle','activities']){const board=document.createElement('canvas');board.width=1200;board.height=1280;const b=board.getContext('2d');b.fillStyle='#93a653';b.fillRect(0,0,1200,1280);
   for(let index=0;index<16;index++){const x=index%4*300,y=Math.floor(index/4)*320;drawResidentAnimation(b,scratch,{...family,animationProfile:'neutral-v1',interpolation:'keyframes'},{layers:[{sheet,row:Math.floor(index/4),frame:index%4,weight:1}],facing:1,breath:1},x+150,y+230,200);b.fillStyle='#fff';b.font='15px monospace';b.fillText(`${sheet}:${index} ${ownership.poses[sheet][index].source}`,x+8,y+310);}
   boards.push({sheet,pixels:board.toDataURL('image/png').split(',')[1]});board.width=board.height=0;
  }
  const mutations=[];for(const sheet of ['base','idle','activities']){const missing=structuredClone(ownership);missing.poses[sheet].pop();mutations.push(missing);const duplicate=structuredClone(ownership);duplicate.poses[sheet][1]=duplicate.poses[sheet][0];mutations.push(duplicate);const wrong=structuredClone(ownership);wrong.poses[sheet][0].source=sheet==='base'?'look':'walk';mutations.push(wrong);}
  let ownershipRefusals=0;for(const m of mutations){try{validateBodyOwnership(m);}catch{ownershipRefusals++;}}if(ownershipRefusals!==mutations.length)throw Error('Invalid complete-body ownership accepted');
  let sourceRefusals=0;for(const id of Object.keys(loaded)){const allocated=[],original=document.createElement;document.createElement=function(tag,...rest){const el=original.call(this,tag,...rest);if(tag==='canvas')allocated.push(el);return el;};try{await prepareBodyFamily({ownership,sources:{...loaded,[id]:{...loaded[id],sourceHash:'0'.repeat(64)}}});throw Error('Changed source accepted');}catch(error){if(error.message==='Changed source accepted')throw error;sourceRefusals++;}finally{document.createElement=original;}if(allocated.some(c=>c.width||c.height))throw Error('Partial family preparation leaked a canvas');}
  const binding=family.binding;family.dispose();family.dispose();if(live.some(c=>c.width||c.height))throw Error('Family disposal retained selected or unused frames');let disposedRefusals=0;for(const method of ['frameForPose','contactForPose','shadowForPose']){try{family[method]('base',0);}catch{disposedRefusals++;}}if(disposedRefusals!==3)throw Error('Disposed provider remains usable');if(Object.values(loaded).some(s=>!s.image.complete||!s.image.naturalWidth))throw Error('Borrowed source image changed');validateAttachmentBinding(binding);scratch.width=scratch.height=0;
  return {exactFrames,sourceCount:Object.keys(loaded).length,ownedFrames:live.length,unusedSourceFrames:live.length-logicalFrames.size,ownershipRefusals,sourceRefusals,disposedRefusals,binding,boards};
 },{ownership,sources,expected});
 assert.deepEqual(errors,[]);assert.equal(result.exactFrames,48);assert.equal(result.sourceRefusals,14);
 await writeFile(root+'/body-ownership-v1.json',JSON.stringify(ownership,null,2)+'\n');await writeFile(root+'/body-sources-v1.json',JSON.stringify(Object.fromEntries(Object.entries(sources).map(([id,s])=>[id,{path:s.path,sha256:s.sourceHash}])),null,2)+'\n');
 await writeFile(root+'/body-binding-v1.json',JSON.stringify(result.binding,null,2)+'\n');delete result.binding;
 for(const b of result.boards){b.path=root+`/body-${b.sheet}-comparison-v1.png`;await writeFile(b.path,Buffer.from(b.pixels,'base64'));delete b.pixels;}
 for(const path of ['scripts/assemble-broad-body.mjs','web/character-body-family.js','web/character-body-ownership.js','web/character-contact-atlas.js','web/character-contact-frame.js','web/character-body-frames.js','web/character-attachments.js','web/resident-animation.js'])inputs[path]=hash(await readFile(path));
 await writeFile(root+'/body-assembly-review-v1.json',JSON.stringify({schema:1,status:'Complete internal pose ownership; assembled visual review pending; no fitted parts or public availability',why:'Bind all48 authored body poses and future attachments to exact source anatomy instead of another-body fallback',...result,inputs,errors},null,2)+'\n');console.log(JSON.stringify({...result,boards:result.boards.map(b=>b.path)}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
