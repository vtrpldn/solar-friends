import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const root='assets/art-direction/character-prototype-v1/short-beard-work-clip-v1';
const atlas=await readFile(root+'/candidate-v1.png'),bent=await readFile('assets/art-direction/character-prototype-v1/short-beard-work-v1/candidate-v2.png');
const registrations=JSON.parse(await readFile(root+'/registrations.json','utf8')),bentRegistration=JSON.parse(await readFile('assets/art-direction/character-prototype-v1/short-beard-work-v1/registration-v2.json','utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const r of registrations)assert.equal(r.source.sha256,hash(atlas));assert.equal(bentRegistration.source.sha256,hash(bent));
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/beard-work-clip-review-host`);
 const result=await page.evaluate(async({atlas,bent,registrations,bentRegistration})=>{
  const {createResidentPartLibrary}=await import('/resident-parts.js'),{residentPartRecipe}=await import('/resident-part-recipe.js'),{composeFacialHairPose,composeWorkingFacialHair}=await import('/character-facial-hair.js'),{defaultBodyMaterials}=await import('/character-materials.js'),{drawResidentAnimation,sampleResidentClip}=await import('/resident-animation.js'),{unlitFilter}=await import('/power.js');
  const binding=(await(await fetch('/art/characters/prototype-v1/straw-hat-work-v1-registration.json')).json()).source.body;
  const load=async data=>{const image=new Image();image.src='data:image/png;base64,'+data;await image.decode();return image;};
  const image=await load(atlas),bentImage=await load(bent),library=createResidentPartLibrary(),entries=new Map(registrations.map(registration=>[registration.index,{image,registration,sourceHash:registration.source.sha256}]));entries.set(7,{image:bentImage,registration:bentRegistration,sourceHash:bentRegistration.source.sha256});
  const auditCanvas=document.createElement('canvas');auditCanvas.width=auditCanvas.height=1254;auditCanvas.getContext('2d').drawImage(image,0,0);const empty=auditCanvas.getContext('2d').getImageData(627,627,627,627).data;let emptyPaint=0;for(let i=3;i<empty.length;i+=4)if(empty[i]>=32)emptyPaint++;if(emptyPaint)throw Error('Undeclared fourth atlas cell contains paint');
  const board=document.createElement('canvas');board.width=1200;board.height=1440;const ctx=board.getContext('2d');ctx.fillStyle='#e8dfbf';ctx.fillRect(0,0,board.width,board.height);
  const timeline=document.createElement('canvas');timeline.width=1800;timeline.height=640;const tc=timeline.getContext('2d');tc.fillStyle='#e8dfbf';tc.fillRect(0,0,1800,640);
  const scenes=document.createElement('canvas');scenes.width=1800;scenes.height=1200;const sc=scenes.getContext('2d');const surface=document.createElement('canvas');surface.width=surface.height=256;let checked=0,refused=0,disposed=0;const audits=[],cache=[];
  for(const [h,hair]of ['short-curls-v1','side-part-v1'].entries())for(const [s,skin]of ['warm','sunlit','copper'].entries()){
   const provider=await library.prepare(residentPartRecipe({hair,materials:{...defaultBodyMaterials,skin}})),composed=composeWorkingFacialHair({provider,binding,entries});
   for(const [column,index]of [4,5,6,7].entries()){
    const original=provider.frameForPose('base',index),frame=composed.frameForPose('base',index),entry=entries.get(index),crop=entry.registration.crop,a=original.getContext('2d').getImageData(0,0,256,256).data,b=frame.getContext('2d').getImageData(0,0,256,256).data;
    for(let y=0;y<256;y++)for(let x=0;x<256;x++)if(x<crop[0]||x>=crop[0]+crop[2]||y<crop[1]||y>=crop[1]+crop[3])for(let channel=0;channel<4;channel++)if(a[(y*256+x)*4+channel]!==b[(y*256+x)*4+channel])throw Error('Part changed pixels outside its authored face crop');
    const audit=composeFacialHairPose({...entry,binding,appearanceFrame:original,sheet:'base',index}).audit;if(h===0&&s===0)audits.push({index,...audit});
    const x=column*300,y=(h*3+s)*240;ctx.drawImage(original,...crop,x,y,150,150);ctx.drawImage(frame,...crop,x+150,y,150,150);ctx.drawImage(frame,x+180,y+140,90,90);ctx.fillStyle='#483a27';ctx.font='12px monospace';ctx.fillText(`${hair} ${skin} · pose ${index}`,x+4,y+220);checked++;
   }
   if(s===0){
    for(const night of [0,1]){const y=(h*2+night)*300;sc.fillStyle=night?'#263c4b':'#e8dfbf';sc.fillRect(0,y,1800,300);sc.save();sc.filter=unlitFilter(night);for(const [column,index]of [4,5,6,7].entries())for(const facing of [1,-1])for(const [size,px,py]of [[150,facing===1?100:300,250],[48,facing===1?200:400,260]])drawResidentAnimation(sc,surface,composed,{layers:[{sheet:'base',row:1,frame:index-4,weight:1}],facing,breath:1},column*450+px,y+py,size);sc.restore();sc.fillStyle=night?'#f4e9c8':'#483a27';sc.font='13px monospace';for(const [column,index]of [4,5,6,7].entries())sc.fillText(`${hair} · pose ${index} · ${night?'night':'day'}`,column*450+8,y+290);}
    const times=[0,.18,.2,.38,.4,.58,.6,.78,.8,.98,1,1.18];
    for(const [i,time]of times.entries()){const x=i%6*300,y=h*320+Math.floor(i/6)*160,layers=sampleResidentClip('work',time,'neutral-v1');for(const [col,p]of [provider,composed].entries())drawResidentAnimation(tc,surface,p,{layers,facing:1,breath:1},x+70+col*150,y+140,100);tc.fillStyle='#483a27';tc.font='12px monospace';tc.fillText(`${time.toFixed(2)}s · original / beard`,x+4,y+155);}
   }
   for(let i=0;i<100;i++)composed.frameForPose('base',4+i%4);const info=composed.cacheInfo();if(info.entries!==4||info.rgbaByteUpperBound!==1048576)throw Error('Unexpected facial frame cache growth');cache.push(info);
   if(h===0&&s===0){
    const base=entries.get(4),args={...base,binding,appearanceFrame:provider.frameForPose('base',4),sheet:'base',index:4};
    for(const rect of [[0,0,627,626],[-1,0,627,627],[1000,0,627,627],[0,,627,627],[.5,0,627,627],[0,0,0,0]]){try{composeFacialHairPose({...args,registration:{...base.registration,source:{...base.registration.source,rect}}});throw Error('accepted');}catch(error){if(error.message==='accepted'||!error.message.includes('square source tile'))throw error;refused++;}}
    for(const bad of [new Map([...entries].slice(0,3)),new Map([...entries].map(([id,e])=>[id===7?8:id,e])),new Map([...entries].map(([id,e])=>[id,id===4?entries.get(5):e]))]){try{composeWorkingFacialHair({provider,binding,entries:bad});throw Error('accepted');}catch(error){if(error.message==='accepted')throw error;refused++;}}
    try{composed.frameForPose('idle',4);throw Error('accepted');}catch(error){if(error.message==='accepted')throw error;refused++;}
   }
   composed.dispose();composed.dispose();if(composed.cacheInfo().entries!==0)throw Error('Disposed cache retained frames');try{composed.frameForPose('base',4);throw Error('accepted');}catch(error){if(error.message==='accepted')throw error;disposed++;}
  }
  return {checked,refused,disposed,audits,emptyPaint,cache,unchangedOutsideFaceCrop:true,timelineSamples:24,scenes:scenes.toDataURL('image/png').split(',')[1],board:board.toDataURL('image/png').split(',')[1],timeline:timeline.toDataURL('image/png').split(',')[1]};
 },{atlas:atlas.toString('base64'),bent:bent.toString('base64'),registrations,bentRegistration});
 assert.equal(result.checked,24);assert.equal(result.refused,10);assert.equal(result.disposed,6);
 for(const key of ['board','timeline','scenes']){await writeFile(root+'/'+key+'.png',Buffer.from(result[key],'base64'));delete result[key];}
 await writeFile(root+'/report.json',JSON.stringify({status:'Mechanical checks pass. Visual review pending; working clip only, excluded from gameplay.',atlasSha256:hash(atlas),...result},null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
