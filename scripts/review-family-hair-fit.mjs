// Rigid attachment hypothesis only. Existing paint is composited, never edited,
// stretched, trimmed, fitted to a silhouette or installed as a player recipe.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const root='assets/art-direction/character-prototype-v1/body-family-relaxed-v1',output=root+'/hair-fit-v1';await mkdir(output,{recursive:true});const ownership=JSON.parse(await readFile(root+'/ownership-v1.json','utf8')),files=JSON.parse(await readFile(root+'/source-files-v1.json','utf8')),sources={};
for(const [id,file]of Object.entries(files)){const bytes=await readFile(file),sourceHash=createHash('sha256').update(bytes).digest('hex');assert.equal(sourceHash,ownership.sources[id].sha256);sources[id]={sourceHash,data:bytes.toString('base64')};}
const offsets=[[-2,4],[-9,0],[3,5],[-5,3]],server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/family-hair-fit`);
 const result=await page.evaluate(async({ownership,sources,offsets})=>{
  const {prepareBodyFamily}=await import('/character-body-family.js'),{loadCharacterImageSource}=await import('/character-image-source.js');const loaded={};for(const [id,s]of Object.entries(sources)){const image=new Image();image.src='data:image/png;base64,'+s.data;await image.decode();loaded[id]={image,sourceHash:s.sourceHash};}
  const family=await prepareBodyFamily({ownership,sources:loaded}),caps=[],sourceRows=[];
  for(const name of ['curls','sidepart']){const owner=await(await fetch('/art/characters/prototype-v1/hair-'+name+'-all-v1-registration.json')).json(),pose=owner.poses.base[8],source=await loadCharacterImageSource('/art/characters/prototype-v1/'+pose.file);if(source.sourceHash!==pose.partSha256)throw Error('Reference hair changed');const cap=document.createElement('canvas');cap.width=cap.height=256;cap.getContext('2d').drawImage(source.image,0,0,256,256);caps.push(cap);sourceRows.push({name,file:pose.file,sha256:source.sourceHash,sourceBody:owner.body,sourceSheet:'base',sourceIndex:8});}
  const make=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.fillStyle='#e8dfbf';ctx.fillRect(0,0,w,h);return c;},heads=make(2000,420),fits=make(2000,840),bodies=make(1600,720),images=[family.frames.base[8],...family.frames.base.slice(0,4)];
  try{for(let i=0;i<5;i++){
   const head=heads.getContext('2d');head.drawImage(images[i],85,0,110,110,i*400,0,400,400);head.font='12px monospace';head.fillStyle='#483a27';head.fillText(i?'new base:'+String(i-1):'original base:8',i*400+8,416);
   for(let n=0;n<=110;n+=10){head.strokeStyle='rgba(30,70,70,.25)';head.beginPath();head.moveTo(i*400+n/110*400,0);head.lineTo(i*400+n/110*400,400);head.moveTo(i*400,n/110*400);head.lineTo(i*400+400,n/110*400);head.stroke();head.fillText(String(n+85),i*400+n/110*400+2,14);head.fillText(String(n),i*400+2,n/110*400+14);}
   for(let style=0;style<2;style++){const frame=document.createElement('canvas');frame.width=frame.height=256;const ctx=frame.getContext('2d');ctx.drawImage(images[i],0,0);const [dx,dy]=i?offsets[i-1]:[0,0];ctx.drawImage(caps[style],dx,dy);const f=fits.getContext('2d');f.drawImage(frame,85,0,110,110,i*400,style*420,400,400);f.fillStyle='#483a27';f.font='12px monospace';f.fillText(`${sourceRows[style].name} ${i?'base:'+String(i-1):'reference'} Δ${dx},${dy}`,i*400+8,style*420+416);const b=bodies.getContext('2d');b.drawImage(frame,i*320+10,style*360,300,300);b.fillStyle='#483a27';b.font='12px monospace';b.fillText(`${sourceRows[style].name} ${i?'walk:'+String(i-1):'standing'}`,i*320+8,style*360+330);frame.width=frame.height=0;}
  }return {scope:'Internal rigid translation hypothesis of existing standing hair onto four new walking heads. Offsets are preliminary alpha-centroid/top comparisons, not accepted anatomical sockets. No active changes or hair source edits.',offsets,sourceRows,head:heads.toDataURL('image/png').split(',')[1],fit:fits.toDataURL('image/png').split(',')[1],body:bodies.toDataURL('image/png').split(',')[1]};}
  finally{family.dispose();for(const cap of caps)cap.width=cap.height=0;}
 },{ownership,sources,offsets});
 for(const key of ['head','fit','body']){await writeFile(output+'/'+key+'.png',Buffer.from(result[key],'base64'));delete result[key];}await writeFile(output+'/report.json',JSON.stringify(result,null,2)+'\n');console.log('Prepared standing/walking head and rigid-cap comparisons. No acceptance asserted.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
