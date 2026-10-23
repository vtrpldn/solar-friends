// Exercise actual source registration and synthetic geometry independently of art quality.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const root='assets/art-direction/character-prototype-v1/body-walk-cycle-v3',registration=JSON.parse(await readFile(root+'/registration-v1.json','utf8')),data=(await readFile(root+'/candidate-v1.png')).toString('base64');
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/registered-body-verification`);
 const result=await page.evaluate(async({data,registration})=>{
  const {prepareRegisteredBodyFrames}=await import('/character-body-frames.js');
  const load=async src=>{const image=new Image();image.src=src;await image.decode();return image;},image=await load('data:image/png;base64,'+data),source={image,sourceHash:registration.source.sha256};
  const valid=prepareRegisteredBodyFrames(source,registration),digest=async frame=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',frame.getContext('2d').getImageData(0,0,256,256).data))].map(n=>n.toString(16).padStart(2,'0')).join('');
  const hashes=await Promise.all(valid.map(digest));if(new Set(hashes).size!==4)throw Error('Expected distinct body poses');
  let refused=0;
  const bad=(edit,which=source)=>{const r=structuredClone(registration);edit(r);let rejected=false;try{const frames=prepareRegisteredBodyFrames(which,r);for(const frame of frames)frame.width=frame.height=0;}catch{rejected=true;}if(!rejected)throw Error('Malformed registration accepted');refused++;};
  bad(r=>r.schema=2);bad(r=>r.source.sha256='0'.repeat(64));bad(r=>r.source.width=1253);bad(r=>r.source.columns=3);bad(r=>r.frames.pop());bad(r=>r.frames[1].index=0);bad(r=>[r.frames[0].index,r.frames[1].index]=[1,0]);bad(r=>r.frames[0].index=16);bad(r=>r.uniformScale=NaN);bad(r=>r.uniformScale=-1);bad(r=>r.uniformScale=1);bad(r=>r.frames[0].waist=[0,0]);bad(r=>r.frames[0].waist=r.frames[1].waist);bad(r=>r.frames[0].scale=.5);bad(r=>r.source.extra=true);bad(r=>r.extra=true);bad(r=>r.frames[0].waist=[361.5,319]);bad(()=>{},{...source,sourceHash:'incorrect'});
  // Failure after frame 0 must release the already-created output and scratch canvases.
  const created=[],create=document.createElement.bind(document);let failureReleased=false;
  document.createElement=function(name,...args){const element=create(name,...args);if(name==='canvas')created.push(element);return element;};
  try{bad(r=>r.frames[1].waist=[0,0]);if(created.length<3||created.some(c=>c.width!==0||c.height!==0))throw Error('Failed preparation retained an owned canvas');failureReleased=true;}finally{document.createElement=create;}
  const repeated=prepareRegisteredBodyFrames(source,registration);if(JSON.stringify(hashes)!==JSON.stringify(await Promise.all(repeated.map(digest))))throw Error('Registration output changed');for(const frame of [...valid,...repeated])frame.width=frame.height=0;
  // Synthetic bodies: identical torsos with different leg spans, no painted asset edits.
  const geometry=document.createElement('canvas');geometry.width=geometry.height=512;const ctx=geometry.getContext('2d'),waists=[];
  for(let i=0;i<4;i++){const ox=i%2*256,oy=Math.floor(i/2)*256;ctx.fillStyle='#2277aa';ctx.fillRect(ox+100,oy+40,56,90);ctx.fillStyle='#885533';ctx.beginPath();ctx.moveTo(ox+118,oy+120);ctx.lineTo(ox+80-i*8,oy+220);ctx.moveTo(ox+138,oy+120);ctx.lineTo(ox+160+i*10,oy+220);ctx.strokeStyle='#885533';ctx.lineWidth=16;ctx.stroke();ctx.fillRect(ox+50,oy+215,170,13);waists.push([ox+128,oy+120]);}
  const synthetic=await load(geometry.toDataURL('image/png')),r={schema:1,family:'synthetic-geometry-check',sheet:'base',source:{sha256:'a'.repeat(64),width:512,height:512,columns:2,rows:2},uniformScale:.8,frames:waists.map((waist,index)=>({waist,index}))},frames=prepareRegisteredBodyFrames({image:synthetic,sourceHash:'a'.repeat(64)},r);
  // The top half is identical despite deliberately unequal lower-leg extents.
  const top=frame=>Array.from(frame.getContext('2d').getImageData(0,0,256,140).data),first=JSON.stringify(top(frames[0]));if(frames.some(frame=>JSON.stringify(top(frame))!==first))throw Error('Leg spread moved or resized the shared torso');for(const frame of frames)frame.width=frame.height=0;geometry.width=geometry.height=0;
  return {poses:hashes,refused,failureReleased,syntheticTorsoComparisons:3};
 },{data,registration});
 assert.equal(result.refused,19);assert.equal(result.failureReleased,true);assert.equal(result.syntheticTorsoComparisons,3);await writeFile(root+'/registration-verification-v1.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
