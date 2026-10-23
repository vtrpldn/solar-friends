import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const collection=process.argv[2],clip=process.argv[3];assert(/^[a-z0-9-]+$/.test(collection??''));assert(['work','walk','breathe','look','sit','sleep'].includes(clip));const root='assets/art-direction/character-prototype-v1/'+collection,version=process.argv[4];assert(/^v[1-9][0-9]?$/.test(version??''),'Choose a candidate revision explicitly, such as v2.');
const atlas=await readFile(root+'/candidate-'+version+'.png');
const registrations=JSON.parse(await readFile(root+'/registrations-'+version+'.json','utf8')).filter(r=>r.clip===clip);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const r of registrations)assert.equal(r.source.sha256,hash(atlas));
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/beard-work-clip-review-host`);
 const result=await page.evaluate(async({atlas,registrations,clip})=>{
  const {createResidentPartLibrary}=await import('/resident-parts.js'),{residentPartRecipe}=await import('/resident-part-recipe.js'),{composeFacialHairPose,composeFacialHairClip}=await import('/character-facial-hair.js'),{defaultBodyMaterials}=await import('/character-materials.js'),{drawResidentAnimation,sampleResidentClip,residentClips}=await import('/resident-animation.js'),{residentClipTiming}=await import('/resident-animation-profiles.js'),{unlitFilter}=await import('/power.js');
  const binding=(await(await fetch('/art/characters/prototype-v1/straw-hat-work-v1-registration.json')).json()).source.body;
  const load=async data=>{const image=new Image();image.src='data:image/png;base64,'+data;await image.decode();return image;};
  const image=await load(atlas),library=createResidentPartLibrary(),entries=new Map(registrations.map(registration=>[registration.index,{image,registration,sourceHash:registration.source.sha256}]));const indices=registrations.map(r=>r.index),sheet=registrations[0]?.sheet;
  const auditCanvas=document.createElement('canvas');auditCanvas.width=auditCanvas.height=1254;auditCanvas.getContext('2d').drawImage(image,0,0);const empty=auditCanvas.getContext('2d').getImageData(836,836,418,418).data;let emptyPaint=0;for(let i=3;i<empty.length;i+=4)if(empty[i]>=32)emptyPaint++;if(emptyPaint)throw Error('Undeclared ninth atlas cell contains paint');
  const board=document.createElement('canvas');board.width=indices.length*300;board.height=1440;const ctx=board.getContext('2d');ctx.fillStyle='#e8dfbf';ctx.fillRect(0,0,board.width,board.height);
  const timeline=document.createElement('canvas');timeline.width=1800;timeline.height=640;const tc=timeline.getContext('2d');tc.fillStyle='#e8dfbf';tc.fillRect(0,0,1800,640);
  const scenes=document.createElement('canvas');scenes.width=indices.length*450;scenes.height=1200;const sc=scenes.getContext('2d');const surface=document.createElement('canvas');surface.width=surface.height=256;let checked=0,refused=0,disposed=0,partialCleanup=0;const audits=[],cache=[];
  for(const [h,hair]of ['short-curls-v1','side-part-v1'].entries())for(const [s,skin]of ['warm','sunlit','copper'].entries()){
   const provider=await library.prepare(residentPartRecipe({hair,materials:{...defaultBodyMaterials,skin}})),composed=composeFacialHairClip({provider,binding,entries,clip});
   for(const [column,index]of indices.entries()){
    const original=provider.frameForPose(sheet,index),frame=composed.frameForPose(sheet,index),entry=entries.get(index),crop=entry.registration.crop,a=original.getContext('2d').getImageData(0,0,256,256).data,b=frame.getContext('2d').getImageData(0,0,256,256).data;
    for(let y=0;y<256;y++)for(let x=0;x<256;x++)if(x<crop[0]||x>=crop[0]+crop[2]||y<crop[1]||y>=crop[1]+crop[3])for(let channel=0;channel<4;channel++)if(a[(y*256+x)*4+channel]!==b[(y*256+x)*4+channel])throw Error('Part changed pixels outside its authored face crop');
    const audit=composeFacialHairPose({...entry,binding,appearanceFrame:original,sheet,index}).audit;if(h===0&&s===0)audits.push({index,...audit});
    const x=column*300,y=(h*3+s)*240;ctx.drawImage(original,...crop,x,y,150,150);ctx.drawImage(frame,...crop,x+150,y,150,150);ctx.drawImage(frame,x+180,y+140,90,90);ctx.fillStyle='#483a27';ctx.font='12px monospace';ctx.fillText(`${hair} ${skin} · pose ${index}`,x+4,y+220);checked++;
   }
   if(s===0){
    for(const night of [0,1]){const y=(h*2+night)*300;sc.fillStyle=night?'#263c4b':'#e8dfbf';sc.fillRect(0,y,scenes.width,300);sc.save();sc.filter=unlitFilter(night);for(const [column,index]of indices.entries())for(const facing of [1,-1])for(const [size,px,py]of [[150,facing===1?100:300,250],[48,facing===1?200:400,260]])drawResidentAnimation(sc,surface,composed,{layers:[{sheet,row:Math.floor(index/4),frame:index%4,weight:1}],facing,breath:1},column*450+px,y+py,size);sc.restore();sc.fillStyle=night?'#f4e9c8':'#483a27';sc.font='13px monospace';for(const [column,index]of indices.entries())sc.fillText(`${hair} · pose ${index} · ${night?'night':'day'}`,column*450+8,y+290);}
    const native=residentClips[clip],durations=residentClipTiming('neutral-v1',clip)?.durations??native.frames.map(()=>native.fps?1/native.fps:1),ends=durations.reduce((a,n)=>[...a,(a.at(-1)??0)+n],[]),times=clip==='sleep'?[0,.01,.1,.5,1,2,3,5,8,13,21,34]:[0,ends[0]-.01,ends[0],ends[1]-.01,ends[1],ends[2]-.01,ends[2],ends[3]-.01,ends[3],ends[3]+ends[0]-.01,ends[3]+ends[0],ends[3]+ends[1]];
    for(const [i,time]of times.entries()){const x=i%6*300,y=h*320+Math.floor(i/6)*160,layers=sampleResidentClip(clip,time,'neutral-v1');for(const [col,p]of [provider,composed].entries())drawResidentAnimation(tc,surface,p,{layers,facing:1,breath:1},x+70+col*150,y+140,100);tc.fillStyle='#483a27';tc.font='12px monospace';tc.fillText(`${time.toFixed(2)}s · original / beard`,x+4,y+155);}
   }
   for(let i=0;i<100;i++)composed.frameForPose(sheet,indices[i%indices.length]);const info=composed.cacheInfo();if(info.entries!==indices.length||info.maximum!==indices.length||info.rgbaByteUpperBound!==indices.length*256*256*4)throw Error('Unexpected facial frame cache growth');cache.push(info);
   if(h===0&&s===0){
    const first=indices[0],base=entries.get(first),args={...base,binding,appearanceFrame:provider.frameForPose(sheet,first),sheet,index:first};
    for(const rect of [[0,0,418,417],[-1,0,418,418],[1000,0,418,418],[0,,418,418],[.5,0,418,418],[0,0,0,0]]){try{composeFacialHairPose({...args,registration:{...base.registration,source:{...base.registration.source,rect}}});throw Error('accepted');}catch(error){if(error.message==='accepted'||!error.message.includes('square source tile'))throw error;refused++;}}
    for(const bad of [new Map([...entries].slice(0,-1)),new Map([...entries].map(([id,e])=>[id===indices.at(-1)?255:id,e])),new Map([...entries].map(([id,e])=>[id,id===indices[0]?{...e,registration:{...e.registration,index:(e.registration.index+1)%16}}:e]))]){try{composeFacialHairClip({provider,binding,entries:bad,clip});throw Error('accepted');}catch(error){if(error.message==='accepted')throw error;refused++;}}
    for(const unavailable of ['not-a-clip','toString','__proto__','constructor',null,[]]){try{composeFacialHairClip({provider,binding,entries,clip:unavailable});throw Error('accepted');}catch(error){if(error.message==='accepted'||!error.message.includes('not available'))throw error;refused++;}}
    const create=document.createElement,created=[];let failed=false;
    try{document.createElement=function(...args){const element=create.apply(this,args);if(args[0]==='canvas')created.push(element);return element;};const bad=new Map(entries),last=indices.at(-1),entry=bad.get(last);bad.set(last,indices.length===1?{...entry,registration:{...entry.registration,bounds:[0,0,1,1]}}:{...entry,sourceHash:'0'.repeat(64)});try{composeFacialHairClip({provider,binding,entries:bad,clip});}catch{failed=true;}}finally{document.createElement=create;}
    if(!failed||!created.length||created.some(canvas=>canvas.width!==0||canvas.height!==0))throw Error('Failed facial construction retained partial canvas surfaces');partialCleanup++;
    try{composed.frameForPose(sheet==='base'?'idle':'base',indices[0]);throw Error('accepted');}catch(error){if(error.message==='accepted')throw error;refused++;}
   }
   composed.dispose();composed.dispose();if(composed.cacheInfo().entries!==0)throw Error('Disposed cache retained frames');try{composed.frameForPose(sheet,indices[0]);throw Error('accepted');}catch(error){if(error.message==='accepted')throw error;disposed++;}
  }
  return {clip,sheet,poseCount:indices.length,checked,refused,disposed,partialCleanup,audits,emptyPaint,cache,unchangedOutsideFaceCrop:true,timelineSamples:24,scenes:scenes.toDataURL('image/png').split(',')[1],board:board.toDataURL('image/png').split(',')[1],timeline:timeline.toDataURL('image/png').split(',')[1]};
 },{atlas:atlas.toString('base64'),registrations,clip});
 assert.equal(result.checked,result.poseCount*6);assert.equal(result.refused,16);assert.equal(result.disposed,6);assert.equal(result.partialCleanup,1);
 for(const key of ['board','timeline','scenes']){await writeFile(root+'/'+clip+'-'+version+'-'+key+'.png',Buffer.from(result[key],'base64'));delete result[key];}
 await writeFile(root+'/'+clip+'-'+version+'-report.json',JSON.stringify({status:'Mechanical checks pass. Visual review pending; declared facial clip only, excluded from gameplay.',atlasSha256:hash(atlas),...result},null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
