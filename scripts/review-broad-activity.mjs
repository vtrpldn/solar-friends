// Partial internal activity-body provider. Never falls back to another anatomy.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const clip=process.argv[2];assert(['cook','water','tend','feed'].includes(clip),'Choose cook, water, tend or feed');
const revision='v1',row=['cook','water','tend','feed'].indexOf(clip);
const root='assets/art-direction/character-prototype-v1/body-broad-v1',hash=b=>createHash('sha256').update(b).digest('hex'),files={work:root+`/activity-${clip}-candidate-${revision}.png`,standing:root+'/breathe-candidate-v1.png'},sources={};
for(const [key,path]of Object.entries(files)){const b=await readFile(path);sources[key]={path,sha256:hash(b),data:b.toString('base64')};}
const settingsPath=root+'/activity-calibration-v1.json',setting=JSON.parse(await readFile(settingsPath)).sources.find(s=>s.clip===clip);assert(setting,'Missing explicit authored calibration');
const bytes=await readFile(files.work),registration={schema:1,family:'broad-body-prototype-v1',sheet:'activities',source:{sha256:sources.work.sha256,width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),columns:2,rows:2},uniformScale:setting.uniformScale,frames:setting.sourceContacts.map((sourceContact,index)=>({index,sourceContact,nativeContact:setting.nativeContact}))};
const standing=JSON.parse(await readFile(root+'/breathe-registration-v1.json')),server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/work-review`);
 const result=await page.evaluate(async({sources,registration,standing,row,clip})=>{
  const {prepareContactAtlasFrames}=await import('/character-contact-atlas.js');
  const {drawResidentAnimation}=await import('/resident-animation.js');
  const {unlitFilter}=await import('/power.js');
  const prepared={};
  for(const [key,s]of Object.entries(sources)){const image=new Image();image.src='data:image/png;base64,'+s.data;await image.decode();prepared[key]=prepareContactAtlasFrames({image,sourceHash:s.sha256},key==='work'?registration:standing);}
  const provider={animationProfile:'neutral-v1',interpolation:'keyframes',frameForPose(sheet,index){if(sheet!=='activities'||!Number.isInteger(index)||index<row*4||index>row*4+3)throw Error('Only authored activity poses exist');return prepared.work.frames[index-row*4];},contactForPose(sheet,index){if(sheet!=='activities'||!Number.isInteger(index)||index<row*4||index>row*4+3)throw Error('Only authored activity contacts exist');return prepared.work.contacts[index-row*4];}};
  let refusals=0;for(const index of [-1,row*4-1,row*4+4,16,17,18])for(const method of ['frameForPose','contactForPose']){try{provider[method]('activities',index);}catch{refusals++;}}
  const scratch=document.createElement('canvas');scratch.width=scratch.height=256;
  const reference={frameForPose(){return prepared.standing.frames[0];},contactForPose(){return prepared.standing.contacts[0];}};
  const board=document.createElement('canvas');board.width=1600;board.height=700;const b=board.getContext('2d');
  for(let night=0;night<2;night++)for(let i=0;i<4;i++){const x=i*400,y=night*350;b.fillStyle=night?'#233b47':'#93a653';b.fillRect(x,y,400,350);b.save();b.filter=unlitFilter(night);for(const [model,dx]of [[reference,100],[provider,285]])drawResidentAnimation(b,scratch,model,{layers:[{sheet:'activities',row,frame:i,weight:1}],facing:night?-1:1,breath:1},x+dx,y+290,220);b.restore();b.fillStyle='#fff';b.font='14px monospace';b.fillText(`standing / ${clip}:${row*4+i} ${night?'mirror/night':'day'}`,x+8,y+22);}
  const normalized=[];for(const [index,frame]of prepared.work.frames.entries()){const bytes=frame.getContext('2d').getImageData(0,0,256,256).data,digest=await crypto.subtle.digest('SHA-256',bytes);normalized.push({index,sha256:[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('')});}
  const {default:init,Game}=await import('/pkg/solar_friends.js');await init();
  const {loadEditorArt}=await import('/editor/map-view.js');const {project}=await import('/projection.js');const {paintTerrain,soilAppearance}=await import('/terrain.js');const {paintWorldGround,paintWorldTree,paintWorldBuilding,paintContactShadow}=await import('/world-renderer.js');
  const art=await loadEditorArt(),game=new Game(),worldImages=[];
  try{for(const biome of ['mata-atlantica','cerrado','caatinga']){
   const d=JSON.parse(game.scenario_template('sandbox'));d.map=JSON.parse(game.generate_biome_property(biome,42));d.start.buildings.push({id:'work-review-home',kind:'home',x:28,y:34,state:'completed',recipe:'standard',appearance:null});d.start.roads.push([30,34],[31,34],[32,34]);const checked=JSON.parse(game.load_scenario(JSON.stringify(d)));if(!checked.ok)throw Error(JSON.stringify(checked));
   const land=JSON.parse(game.report_state()).village.land,ground=paintTerrain(art.terrain,d.start.roads,[],soilAppearance(land.soil),land.seed,d.map);
   try{for(const night of [0,1]){const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=600;const ctx=canvas.getContext('2d'),scale=1.5,a=project(32,33,{x:0,y:0},scale),origin={x:600-a.x,y:390-a.y},position=(x,y)=>project(x,y,origin,scale);
    ctx.fillStyle=night?'#233b47':'#dfe6c9';ctx.fillRect(0,0,1200,600);ctx.save();ctx.filter=unlitFilter(night);paintWorldGround(ctx,ground,origin,scale);ctx.restore();
    const objects=land.vegetation.filter(t=>!t.cleared).map(tree=>({depth:tree.x+tree.y,draw:()=>paintWorldTree(ctx,tree,{project:position,scale,width:1200,height:600,forest:art.forest,details:art.details,night})}));for(const building of d.start.buildings)objects.push({depth:building.x+building.y,draw:()=>paintWorldBuilding(ctx,{key:building.kind,x:building.x,y:building.y},{project:position,scale,images:art.images,night,light:0})});
    for(let i=0;i<5;i++)objects.push({depth:30+i*1.5+33+.6,draw:()=>{const p=position(30+i*1.5,33);paintContactShadow(ctx,p.x,p.y,10*scale,4*scale,.22);ctx.save();ctx.filter=unlitFilter(night);drawResidentAnimation(ctx,scratch,i?provider:reference,{layers:[{sheet:'activities',row,frame:Math.max(0,i-1),weight:1}],facing:night?-1:1,breath:1},p.x,p.y,48*scale);ctx.restore();}});objects.sort((a,b)=>a.depth-b.depth).forEach(o=>o.draw());ctx.fillStyle='#f5e5ba';ctx.fillRect(8,8,1184,28);ctx.fillStyle='#483a27';ctx.font='15px monospace';ctx.fillText(`${biome} / ${night?'mirrored night':'day'} / standing + four ${clip} poses`,16,28);worldImages.push({biome,night,data:canvas.toDataURL('image/png').split(',')[1]});canvas.width=canvas.height=0;
   }}finally{ground.width=ground.height=0;}
  }}finally{game.free();}
  const pixels=board.toDataURL('image/png').split(',')[1];for(const p of Object.values(prepared))for(const f of p.frames)f.width=f.height=0;scratch.width=scratch.height=0;return {pixels,worldImages,normalized,refusals};
 },{sources,registration,standing,row,clip});
 assert.deepEqual(errors,[]);assert.equal(result.refusals,12);
 await writeFile(root+`/activity-${clip}-native-comparison-${revision}.png`,Buffer.from(result.pixels,'base64'));delete result.pixels;
 for(const image of result.worldImages){image.path=root+`/activity-${clip}-world-${revision}-${image.biome}-${image.night?'night':'day'}.png`;await writeFile(image.path,Buffer.from(image.data,'base64'));delete image.data;}
 await writeFile(root+`/activity-${clip}-registration-${revision}.json`,JSON.stringify(registration,null,2)+'\n');
 const inputs={};for(const path of [...Object.values(files),root+'/breathe-registration-v1.json',settingsPath,'scripts/review-broad-activity.mjs','web/character-contact-atlas.js','web/resident-animation.js','web/world-renderer.js','web/power.js','web/projection.js','web/terrain.js'])inputs[path]=hash(await readFile(path));
 await writeFile(root+`/activity-${clip}-native-review-${revision}.json`,JSON.stringify({schema:1,status:'Candidate; visual verdict pending; no public integration',why:'Check four newly authored activity poses at one uniform source scale beside the same standing body',...result,inputs,errors},null,2)+'\n');console.log('Four exact activity poses fit; twelve unsupported requests refused; six biome world captures; no browser errors.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
