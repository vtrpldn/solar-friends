// Complete-source review only. This does not expose facial hair in public recipes.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const variant=process.argv[2]??'original',folders={original:'short-beard-complete-v1','rest-consistency':'short-beard-complete-rest-consistency-v1','water-tend-consistency':'short-beard-complete-water-tend-consistency-v1','water-tend-corrected':'short-beard-complete-water-tend-corrected-v1','jaw-corrected':'short-beard-complete-jaw-corrected-v1'};assert(Object.hasOwn(folders,variant),'Choose an explicit registered comparison variant');
const jawCorrected=variant==='jaw-corrected',matrix=variant==='water-tend-corrected'||jawCorrected,root='assets/art-direction/character-prototype-v1',output=root+'/'+folders[variant];
const collections=[
 ['short-beard-work-clip-v1','registrations.json','candidate-v1.png'],
 ...(jawCorrected?[]:[['short-beard-work-v1','registration-v2.json','candidate-v2.png']]),
 ['short-beard-base-clips-v1','registrations.json','candidate-v1.png'],
 ['short-beard-rest-clips-v1','registrations-v2.json','candidate-v2.png',variant==='original'?null:'base'],
 ...(variant==='original'?[]:jawCorrected?[['short-beard-jaw-consistency-v1','registrations-v1.json','candidate-v1.png']]:[['short-beard-rest-consistency-v1','registrations-v2.json','candidate-v2.png','idle']]),
 ['short-beard-gesture-clips-v1','registrations-v1.json','candidate-v1.png'],
 ['short-beard-stretch-cook-v1','registrations-v1.json','candidate-v1.png'],
 ...(variant.startsWith('water-tend-')||jawCorrected?[
  matrix?['short-beard-water-tend-correction-v1','registrations-v1.json','candidate-v1.png']:['short-beard-water-tend-v1','registrations-v1.json','candidate-v1.png',null,[6,7,9,10]],
  ['short-beard-water-tend-v1','registrations-v4.json','candidate-v4.png',null,[4,5,8,11]],
 ]:[['short-beard-water-tend-v1','registrations-v1.json','candidate-v1.png']]),
 ['short-beard-feed-v1','registrations-v1.json','candidate-v1.png'],
];
const sources=[];for(const [collection,file,paint,sheet,indices]of collections){const data=await readFile(`${root}/${collection}/${paint}`),sha256=createHash('sha256').update(data).digest('hex'),raw=JSON.parse(await readFile(`${root}/${collection}/${file}`,'utf8')),registrations=(Array.isArray(raw)?raw:[raw]).filter(r=>(!sheet||r.sheet===sheet)&&(!indices||indices.includes(r.index)));for(const r of registrations)assert.equal(r.source.sha256,sha256);sources.push({collection,file,paint,sha256,selectedPoses:registrations.map(r=>r.sheet+':'+r.index),registrations,data:data.toString('base64')});}
assert.equal(sources.reduce((n,s)=>n+s.registrations.length,0),48);await mkdir(output,{recursive:true});
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/facial-provider-review`);
 const result=await page.evaluate(async({sources,matrix,jawCorrected})=>{
  const {createResidentPartLibrary}=await import('/resident-parts.js'),{residentPartRecipe}=await import('/resident-part-recipe.js'),{composeFacialHairProvider}=await import('/character-facial-hair.js'),{residentClips,drawResidentAnimation,advanceResidentAnimation,sampleResidentClip}=await import('/resident-animation.js');
  const binding=(await(await fetch('/art/characters/prototype-v1/straw-hat-work-v1-registration.json')).json()).source.body,entries=new Map();
  const {defaultBodyMaterials}=await import('/character-materials.js');
  const {unlitFilter}=await import('/power.js');
  for(const source of sources){const image=new Image();image.src='data:image/png;base64,'+source.data;await image.decode();for(const registration of source.registrations){const key=registration.sheet+':'+registration.index;if(entries.has(key))throw Error('Overlapping facial source registrations');entries.set(key,{image,sourceHash:source.sha256,registration});}}
  const library=createResidentPartLibrary(),board=document.createElement('canvas');board.width=1600;board.height=2400;const b=board.getContext('2d');b.fillStyle='#e8dfbf';b.fillRect(0,0,1600,2400);
  const transitions=document.createElement('canvas');transitions.width=1600;transitions.height=1400;const tc=transitions.getContext('2d');tc.fillStyle='#e8dfbf';tc.fillRect(0,0,1600,1400);
  const profiles=['short-curls-v1','side-part-v1'].flatMap(hair=>(matrix?['warm','sunlit','copper']:['warm']).map(skin=>({hair,skin})));
  const reviewPoses=jawCorrected?[['base',0],['base',7],['base',8],['idle',0],['idle',1],['idle',2],['idle',3],['idle',4]]:Array.from({length:8},(_,i)=>['activities',i+4]);
  const palette=document.createElement('canvas');palette.width=1600;palette.height=profiles.length*220;const paletteContext=palette.getContext('2d');paletteContext.fillStyle='#e8dfbf';paletteContext.fillRect(0,0,palette.width,palette.height);
  const scenes=document.createElement('canvas');scenes.width=2800;scenes.height=1040;const sceneContext=scenes.getContext('2d');
  const surface=document.createElement('canvas'),probe=document.createElement('canvas');surface.width=surface.height=probe.width=probe.height=256;const pc=probe.getContext('2d');let checked=0,returns=0,transitionFrames=0,clipFrames=0,refused=0,cleanup=0,lightingSamples=0;const caches=[];
  const keys=['base','idle','activities'].flatMap(sheet=>Array.from({length:16},(_,index)=>[sheet,index]));
  for(const [h,{hair,skin}]of profiles.entries()){
   const hairSlot=hair==='side-part-v1'?1:0,provider=await library.prepare(residentPartRecipe({hair,materials:{...defaultBodyMaterials,skin}})),composed=composeFacialHairProvider({provider,binding,entries});
   for(const [i,[sheet,index]]of keys.entries()){
    const frame=composed.frameForPose(sheet,index),original=provider.frameForPose(sheet,index),crop=entries.get(sheet+':'+index).registration.crop,a=original.getContext('2d').getImageData(0,0,256,256).data,c=frame.getContext('2d').getImageData(0,0,256,256).data;
    for(let y=0;y<256;y++)for(let x=0;x<256;x++)if(x<crop[0]||x>=crop[0]+crop[2]||y<crop[1]||y>=crop[1]+crop[3])for(let k=0;k<4;k++)if(a[(y*256+x)*4+k]!==c[(y*256+x)*4+k])throw Error('Complete provider changed pixels outside face crop');
    if(skin==='warm'){const x=i%8*200,y=hairSlot*1200+Math.floor(i/8)*200;b.drawImage(frame,...crop,x,y,160,160);b.fillStyle='#483a27';b.font='13px monospace';b.fillText(`${sheet} ${index}`,x+4,y+180);}
    const reviewColumn=reviewPoses.findIndex(([s,i])=>sheet===s&&index===i);if(reviewColumn>=0){const x=reviewColumn*200,y=h*220;paletteContext.drawImage(frame,...crop,x,y,160,160);paletteContext.fillStyle='#483a27';paletteContext.font='11px monospace';paletteContext.fillText(`${hair} ${skin}`,x+4,y+180);paletteContext.fillText(`${sheet} ${index}`,x+4,y+200);}checked++;
   }
   if(matrix&&skin==='warm')for(const night of [0,1]){
    const y=(hairSlot*2+night)*260;sceneContext.fillStyle=night?'#263c4b':'#e8dfbf';sceneContext.fillRect(0,y,scenes.width,260);sceneContext.save();sceneContext.filter=unlitFilter(night);
    for(const [column,[sheet,index]]of reviewPoses.entries())for(const facing of [1,-1])for(const [size,x,py]of [[120,facing===1?75:245,210],[48,facing===1?155:325,220]]){drawResidentAnimation(sceneContext,surface,composed,{layers:[{sheet,row:Math.floor(index/4),frame:index%4,weight:1}],facing,breath:1},column*350+x,y+py,size);lightingSamples++;}
    sceneContext.restore();sceneContext.fillStyle=night?'#f4e9c8':'#483a27';sceneContext.font='12px monospace';for(const [column,[sheet,index]]of reviewPoses.entries())sceneContext.fillText(`${hair} ${sheet} ${index} ${night?'night':'day'}`,column*350+8,y+250);
   }
   for(const index of [13,14]){const frame=composed.frameForPose('activities',index,{sequenceIndex:4});if(frame===composed.frameForPose('activities',index))throw Error('Missing feeding return');returns++;}
   let previous=null;const tasks=['idle','build','cook','water','garden','sleep','rest','socialize','idle'];
   for(const [row,task]of tasks.entries())for(let tick=0;tick<90;tick++){
    const resident={id:1,x:4,y:4,target_x:4,target_y:4,task},animation=advanceResidentAnimation(previous,resident,row*24,.016,'neutral-v1');drawResidentAnimation(pc,surface,composed,animation,128,240,150);if(skin==='warm'&&[0,5,10,15].includes(tick)&&row<7){const col=[0,5,10,15].indexOf(tick),x=hairSlot*800+col*200,y=row*200;drawResidentAnimation(tc,surface,composed,{...animation,facing:hairSlot?-1:1},x+100,y+170,150);tc.fillStyle='#483a27';tc.font='12px monospace';tc.fillText(`${task} +${tick*16}ms`,x+4,y+192);}previous=animation;transitionFrames++;
   }
   for(const [clip,spec]of Object.entries(residentClips))for(let tick=0;tick<240;tick++){const layers=sampleResidentClip(clip,tick/30,'neutral-v1');drawResidentAnimation(pc,surface,composed,{layers,facing:tick%2?1:-1,breath:1},128,240,150);clipFrames++;}
   caches.push(composed.cacheInfo());if(composed.cacheInfo().entries!==50||composed.cacheInfo().rgbaByteUpperBound!==13107200)throw Error('Full provider cache grew');
   if(h===0){
    for(const bad of [new Map([...entries].slice(1)),new Map([...entries,['base:16',entries.get('base:0')]]),new Map([...entries].map(([key,e])=>[key,key==='idle:3'?{...e,sourceHash:'0'.repeat(64)}:e]))]){try{composeFacialHairProvider({provider,binding,entries:bad});throw Error('accepted');}catch(error){if(error.message==='accepted')throw error;refused++;}}
    const create=document.createElement,created=[];let failed=false;const broken={...provider,frameForPose(sheet,index,pose){if(sheet==='activities'&&index===14&&pose?.sequenceIndex>=4)throw Error('Injected late return failure');return provider.frameForPose(sheet,index,pose);}};
    try{document.createElement=function(...args){const element=create.apply(this,args);if(args[0]==='canvas')created.push(element);return element;};try{composeFacialHairProvider({provider:broken,binding,entries});}catch{failed=true;}}finally{document.createElement=create;}
    if(!failed||!created.length||created.some(c=>c.width!==0||c.height!==0))throw Error('Failed full set retained partial canvases');cleanup++;
   }
   for(const [sheet,index]of [['base','0'],['base',-1],['idle',16],['__proto__',0],[['base'],0]]){try{composed.frameForPose(sheet,index);throw Error('accepted');}catch(error){if(error.message==='accepted')throw error;refused++;}}
   const owned=[...keys.map(([sheet,index])=>composed.frameForPose(sheet,index)),... [13,14].map(index=>composed.frameForPose('activities',index,{sequenceIndex:4}))];
   composed.dispose();composed.dispose();if(composed.cacheInfo().entries!==0||owned.some(c=>c.width!==0||c.height!==0))throw Error('Full set disposal retained canvases');
   try{composed.frameForPose('base',0);throw Error('accepted');}catch(error){if(error.message==='accepted')throw error;refused++;}
   if(provider.frameForPose('base',0).width!==256)throw Error('Full set disposed its borrowed body');
  }
  return {profiles,reviewPoses,checked,returns,transitionFrames,clipFrames,refused,cleanup,caches,lightingSamples,clipCount:Object.keys(residentClips).length,board:board.toDataURL('image/png').split(',')[1],transitions:transitions.toDataURL('image/png').split(',')[1],palette:palette.toDataURL('image/png').split(',')[1],...(matrix?{scenes:scenes.toDataURL('image/png').split(',')[1]}:{})};
 },{sources,matrix,jawCorrected});
 const count=matrix?6:2;assert.equal(result.checked,count*48);assert.equal(result.returns,count*2);assert.equal(result.refused,3+count*6);assert.equal(result.cleanup,1);assert.equal(result.transitionFrames,count*810);assert.equal(result.clipFrames,count*3120);
 assert.equal(result.lightingSamples,matrix?128:0);
 for(const key of ['board','transitions','palette',...(matrix?['scenes']:[])]){await writeFile(`${output}/${key}.png`,Buffer.from(result[key],'base64'));delete result[key];}
 await writeFile(output+'/report.json',JSON.stringify({status:'Mechanical full-set checks pass; visual and continuous playback review pending. Internal only.',variant,sources:sources.map(({data,registrations,...s})=>s),...result},null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
