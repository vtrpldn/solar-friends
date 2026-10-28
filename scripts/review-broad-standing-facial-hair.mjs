import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const subject='facial-standing',revision=process.argv.includes('--refined')?'v3':process.argv.includes('--revised')?'v2':'v1',sourceRevision=revision==='v3'?'v2':revision;
const root='assets/art-direction/character-prototype-v1/body-broad-v1';
const hash=b=>createHash('sha256').update(b).digest('hex');
const read=async n=>JSON.parse(await readFile(`${root}/${n}`));
const definition=await read('composed-family-draft-v2.json'),binding=await read('body-binding-v1.json'),registration=await read(`${subject}-atlas-draft-${revision}.json`),sources={};
for(const [id,s]of Object.entries(definition.sources)){const bytes=await readFile(s.path);assert.equal(hash(bytes),s.sha256);sources[id]={data:bytes.toString('base64'),sourceHash:s.sha256};}
const bytes=await readFile(`${root}/facial-standing-candidate-${sourceRevision}.png`);assert.equal(hash(bytes),registration.sources.beard.sha256);const source={data:bytes.toString('base64'),sourceHash:hash(bytes)},server=await serve(0);let browser;
try{browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/facial-fit`);
 const result=await page.evaluate(async({definition,binding,registration,sources,source})=>{
  const {prepareComposedResidentFamily}=await import('/character-composed-family.js'),{paintRegisteredEquipmentAtlas}=await import('/character-equipment-atlas.js'),{drawResidentAnimation}=await import('/resident-animation.js');const loaded={};for(const [id,s]of Object.entries(sources)){const image=new Image();image.src='data:image/png;base64,'+s.data;await image.decode();loaded[id]={image,sourceHash:s.sourceHash};}const beard=new Image();beard.src='data:image/png;base64,'+source.data;await beard.decode();
  const bundle=await prepareComposedResidentFamily({definition,sources:loaded,recipe:{schema:2,family:definition.id,hair:'side-part-v1',hairColour:'chestnut',hat:'none',materials:{skin:'warm',shirt:'teal',shorts:'sage',shoes:'graphite'}}}),board=document.createElement('canvas'),scratch=document.createElement('canvas');board.width=1024;board.height=640;scratch.width=scratch.height=256;const ctx=board.getContext('2d');ctx.fillStyle='#e3d8b6';ctx.fillRect(0,0,1024,640);const heads=document.createElement('canvas');heads.width=800;heads.height=420;const hc=heads.getContext('2d');hc.fillStyle='#e3d8b6';hc.fillRect(0,0,800,420);
  try{for(let i=8;i<12;i++){
   const frame=bundle.provider.frameForPose('base',i),origin=bundle.provider.frameOriginForPose('base',i),overlay=paintRegisteredEquipmentAtlas({binding,registration,sources:{beard:{image:beard,sourceHash:source.sourceHash}},sheet:'base',index:i}),composed=document.createElement('canvas');composed.width=frame.width;composed.height=frame.height;
   try{const c=composed.getContext('2d');c.drawImage(frame,0,0);c.drawImage(overlay,-origin[0],-origin[1]);for(const [row,image]of [frame,composed].entries()){hc.drawImage(image,95-origin[0],25-origin[1],75,65,(i-8)*200,row*210,200,173);drawResidentAnimation(ctx,scratch,{...bundle.provider,frameForPose:()=>image,frameOriginForPose:()=>origin},{layers:[{sheet:'base',row:2,frame:i-8,weight:1}],facing:1,breath:1},(i-8)*256+128,row*320+285,230);}}finally{overlay.width=overlay.height=composed.width=composed.height=0;}
  }return {image:board.toDataURL('image/png').split(',')[1],heads:heads.toDataURL('image/png').split(',')[1]};}finally{bundle.dispose();board.width=board.height=scratch.width=scratch.height=heads.width=heads.height=0;}
 },{definition,binding,registration,sources,source});await writeFile(`${root}/facial-standing-fit-draft-${revision}.png`,Buffer.from(result.image,'base64'));await writeFile(`${root}/facial-standing-heads-draft-${revision}.png`,Buffer.from(result.heads,'base64'));console.log('Rendered exact-source four-pose facial fit candidate.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
