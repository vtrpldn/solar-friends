// Internal source-body review only; no public recipe or saved village changes.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const root='assets/art-direction/character-prototype-v1/body-broad-v1',output=root+'/idle-review-v1';
const specPath=root+'/idle-calibration-v1.json',spec=JSON.parse(await readFile(specPath));
assert.equal(spec.schema,1);assert.deepEqual(spec.clips.map(p=>p.clip),['look','stretch','wave','relax']);assert.deepEqual(spec.clips.map(p=>p.row),[0,1,2,3]);
assert(spec.sources.length<=16);assert.equal(new Set(spec.sources.map(p=>p.id)).size,spec.sources.length);
const authored=new Set();for(const clip of spec.clips){assert.equal(clip.poses.length,4);for(const pose of clip.poses){assert(spec.sources.some(s=>s.id===pose.source));assert(Number.isInteger(pose.index)&&pose.index>=0&&pose.index<4);const key=pose.source+':'+pose.index;assert(!authored.has(key),'Do not reuse a painted pose as another logical pose');authored.add(key);}}
const registrations={standing:JSON.parse(await readFile(root+'/breathe-registration-v1.json')),gait:JSON.parse(await readFile(root+'/walk-registration-v3-contacts.json'))};
const files={standing:root+'/breathe-candidate-v1.png',gait:root+'/walk-candidate-v3.png',originalBase:'web/art/characters/prototype-v1/body-neutral-base.png',originalIdle:'web/art/characters/prototype-v1/body-neutral-idle-candidate-v2.png',...Object.fromEntries(spec.sources.map(p=>[p.id,root+'/'+p.source]))},sources={};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const [id,path]of Object.entries(files)){const bytes=await readFile(path);sources[id]={path,sha256:hash(bytes),data:bytes.toString('base64')};}
await mkdir(output,{recursive:true});const video=process.argv.includes('--video'),server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/broad-idle-review`);
 const result=await page.evaluate(async({sources,spec,registrations,video})=>{
  const {prepareContactAtlasFrames}=await import('/character-contact-atlas.js');
  const {preparedFrames,locateSpriteFrames,RESIDENT_WIDTH}=await import('/sprite-frames.js');
  const {drawResidentAnimation,advanceResidentAnimation,residentClips,presentedPoseLayers}=await import('/resident-animation.js');
  const {unlitFilter}=await import('/power.js');
  const frames={},owned=[],contacts={},measurements={},newRegistrations={};
  for(const [id,source]of Object.entries(sources)){
   const image=new Image();image.src='data:image/png;base64,'+source.data;await image.decode();
   if(id.startsWith('original')){frames[id]=preparedFrames(image,{referenceRow:id==='originalBase'?2:0});continue;}
   let registration=registrations[id];const setting=spec.sources.find(p=>p.id===id);
   if(setting)registration={schema:1,family:'broad-body-prototype-v1',sheet:'idle',source:{sha256:source.sha256,width:image.naturalWidth,height:image.naturalHeight,columns:2,rows:2},uniformScale:setting.uniformScale,frames:setting.sourceContacts.map((sourceContact,index)=>({index,sourceContact,nativeContact:setting.nativeContact}))};
   const prepared=prepareContactAtlasFrames({image,sourceHash:source.sha256},registration);frames[id]=prepared.frames;contacts[id]=prepared.contacts;owned.push(...prepared.frames);
   if(setting){
    newRegistrations[id]=registration;
    const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),layout=locateSpriteFrames(pixels.data,canvas.width,canvas.height,2,2,0);
    measurements[id]=[];
    for(let index=0;index<4;index++){
     const point=setting.headCenters[index],pose=layout.frames[index];
     if(!Array.isArray(point)||point.length!==2||point.some(n=>!Number.isSafeInteger(n))||point[0]<0||point[0]>=canvas.width||point[1]<0||point[1]>=canvas.height||layout.owners[point[1]*canvas.width+point[0]]!==pose.id)throw Error('Head landmark must belong to its actual painted source pose');
     const rgba=frames[id][index].getContext('2d').getImageData(0,0,256,256).data,digest=await crypto.subtle.digest('SHA-256',rgba);
     measurements[id].push({sourceIndex:index,sourceBounds:[pose.left,pose.top,pose.right,pose.bottom],sourceHead:point,headFromGround:point.map((n,axis)=>(n-setting.sourceContacts[index][axis])*setting.uniformScale),frameSha256:[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('')});
    }
    canvas.width=canvas.height=0;
   }
  }
  const standingHead=spec.standingHeadCenter.map((n,axis)=>(n-registrations.standing.frames[0].sourceContact[axis])*registrations.standing.uniformScale);
  const diagnostics=spec.clips.map(setting=>{const poses=setting.poses.map(p=>measurements[p.source][p.index]),ys=poses.map(p=>p.headFromGround[1]),mean=ys.reduce((a,b)=>a+b,0)/ys.length;return {clip:setting.clip,headGroundSpread:Math.max(...ys)-Math.min(...ys),standingHeadDifference:Math.abs(mean-standingHead[1]),headGroundMean:mean,ownership:setting.poses,poseHashes:poses.map(p=>p.frameSha256)};});
  const find=(sheet,index)=>{
   if(!Number.isSafeInteger(index))throw Error('Choose an authored integer body pose');
   if(sheet==='base'&&index>=0&&index<4)return ['gait',index];
   if(sheet==='base'&&index>=8&&index<12)return ['standing',index-8];
   if(sheet==='idle'&&index>=0&&index<16){const pose=spec.clips[Math.floor(index/4)].poses[index%4];return [pose.source,pose.index];}
   throw Error('This partial authoring provider has no drawing for that pose');
  };
  const provider={animationProfile:'neutral-v1',interpolation:'keyframes',frameForPose(sheet,index){const [id,i]=find(sheet,index);return frames[id][i];},contactForPose(sheet,index){const [id,i]=find(sheet,index);return [...contacts[id][i]];}};
  const original={animationProfile:'neutral-v1',interpolation:'keyframes',frameForPose(sheet,index){if(!Number.isSafeInteger(index)||index<0||index>15||!['base','idle'].includes(sheet))throw Error('Only original base and idle reference sheets exist');return frames[sheet==='base'?'originalBase':'originalIdle'][index];}};
  let unavailablePoseRefusals=0;for(const [sheet,index]of [['base',4],['base',12],['activities',0],['idle',16],['idle',-1],['idle','0']])for(const method of ['frameForPose','contactForPose']){let refused=false;try{provider[method](sheet,index);}catch{refused=true;}if(!refused)throw Error('Partial provider accepted an unauthored body pose');unavailablePoseRefusals++;}
  const board=document.createElement('canvas');board.width=1536;board.height=1152;const b=board.getContext('2d');b.fillStyle='#e8dfbf';b.fillRect(0,0,board.width,board.height);
  for(const setting of spec.clips){const y=setting.row*288;
   for(let col=0;col<6;col++){
    const pose=col<4?setting.poses[col]:{source:col===4?'standing':'gait',index:0},id=pose.source,i=pose.index,c=contacts[id][i];
    b.drawImage(frames[id][i],col*256+128-c[0],y+250-c[1]);b.fillStyle='#483a27';b.font='12px monospace';b.fillText(col<4?`${setting.clip} · idle:${setting.row*4+col}`:id+' scale reference',col*256+8,y+276);
   }
  }
  const {default:init,Game}=await import('/pkg/solar_friends.js');await init();const {loadEditorArt}=await import('/editor/map-view.js');
  const {project}=await import('/projection.js'),{paintTerrain,soilAppearance}=await import('/terrain.js'),{paintWorldGround,paintWorldTree,paintWorldBuilding,paintContactShadow}=await import('/world-renderer.js');
  const art=await loadEditorArt(),game=new Game(),worldImages=[],canvas=document.createElement('canvas'),scratch=document.createElement('canvas');canvas.width=700;canvas.height=360;scratch.width=scratch.height=256;const ctx=canvas.getContext('2d');
  try{for(const biome of ['mata-atlantica','cerrado','caatinga']){
   const definition=JSON.parse(game.scenario_template('sandbox'));definition.map=JSON.parse(game.generate_biome_property(biome,42));definition.start.buildings.push({id:'idle-review-home',kind:'home',x:28,y:34,state:'completed',recipe:'standard',appearance:null});definition.start.roads.push([30,34],[31,34],[32,34]);
   const checked=JSON.parse(game.load_scenario(JSON.stringify(definition)));if(!checked.ok)throw Error(JSON.stringify(checked));const land=JSON.parse(game.report_state()).village.land,ground=paintTerrain(art.terrain,definition.start.roads,[],soilAppearance(land.soil),land.seed,definition.map);
   try{for(const night of [0,1]){
    const worldBoard=document.createElement('canvas');worldBoard.width=2800;worldBoard.height=1440;const w=worldBoard.getContext('2d');
    for(const setting of spec.clips)for(let index=0;index<4;index++){
     const scale=1.2,anchor=project(30,33,{x:0,y:0},scale),origin={x:340-anchor.x,y:245-anchor.y},position=(x,y)=>project(x,y,origin,scale);
     ctx.fillStyle=night?'#263c4b':'#dfe6c9';ctx.fillRect(0,0,700,360);ctx.save();ctx.filter=unlitFilter(night);paintWorldGround(ctx,ground,origin,scale);ctx.restore();
     const objects=land.vegetation.filter(t=>!t.cleared).map(tree=>({depth:tree.x+tree.y,draw:()=>paintWorldTree(ctx,tree,{project:position,scale,width:700,height:360,forest:art.forest,details:art.details,night})}));
     for(const building of definition.start.buildings)objects.push({depth:building.x+building.y,draw:()=>paintWorldBuilding(ctx,{key:building.kind,x:building.x,y:building.y},{project:position,scale,images:art.images,night,light:0})});
     for(const [model,x,pose]of [[{base:art.residents[1]},30.5,{sheet:'base',row:2,frame:0,weight:1}],[provider,32,{sheet:'base',row:2,frame:0,weight:1}],[provider,33.5,{sheet:'idle',row:setting.row,frame:index,weight:1}]])objects.push({depth:x+33+.6,draw:()=>{const p=position(x,33);paintContactShadow(ctx,p.x,p.y,10*scale,4*scale,.22);ctx.save();ctx.filter=unlitFilter(night);drawResidentAnimation(ctx,scratch,model,{layers:[pose],facing:night?-1:1,breath:1},p.x,p.y,RESIDENT_WIDTH*scale);ctx.restore();}});
     objects.sort((a,b)=>a.depth-b.depth).forEach(o=>o.draw());ctx.fillStyle='#f5e5ba';ctx.fillRect(8,8,680,24);ctx.fillStyle='#483a27';ctx.font='11px monospace';ctx.fillText(`${biome} · ${setting.clip}:${index} · ${night?'mirror/night':'day'} · Bento / standing / gesture`,14,25);w.drawImage(canvas,index*700,setting.row*360);
    }
    worldImages.push({biome,night,data:worldBoard.toDataURL('image/png').split(',')[1]});worldBoard.width=worldBoard.height=0;
   }}finally{ground.width=ground.height=0;}
  }}finally{game.free();}
  let movie=null;const recordings=[];
  if(video){
   canvas.width=800;canvas.height=360;document.body.replaceChildren(canvas);
   const stream=canvas.captureStream(30),type=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm',recorder=new MediaRecorder(stream,{mimeType:type}),chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};const stopped=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=reject;});recorder.start();const beginning=performance.now();
   try{for(const night of [0,1])for(const setting of spec.clips){
    const clip=residentClips[setting.clip],cycle=clip.frames.length/clip.fps,start=performance.now(),modes=[],seen=new Set();let previous=null,last=start,renderCalls=0;
    while(performance.now()-start<(cycle+1.15)*1000){
     const now=performance.now(),seconds=(now-start)/1000,active=seconds>=.5&&seconds<cycle+.65;
     const task=active?{look:'birdwatch',stretch:'stretch',wave:'idle',relax:'socialize'}[setting.clip]:'stretch',minutes=active?(setting.clip==='stretch'?8:setting.clip==='wave'?115:0):0;
     const animation=advanceResidentAnimation(previous,{id:1,x:4,y:4,target_x:4,target_y:4,task},minutes,(now-last)/1000,'neutral-v1');
     if(animation.mode!==(active?setting.clip:'breathe'))throw Error('Unexpected native idle activity');if(animation.mode!==previous?.mode)modes.push({mode:animation.mode,seconds});previous=animation;last=now;
     if(active)for(const p of presentedPoseLayers(animation.layers,'keyframes'))if(p.sheet==='idle')seen.add(p.row*4+p.frame);
     ctx.fillStyle=night?'#263c4b':'#e8dfbf';ctx.fillRect(0,0,800,360);ctx.save();ctx.filter=unlitFilter(night);
     for(const [i,model]of [original,provider].entries())for(const [width,y,offset]of [[220,300,0],[48,337,130]])drawResidentAnimation(ctx,scratch,model,{...animation,facing:night?-1:1},190+i*400+offset,y,width);
     ctx.restore();ctx.fillStyle=night?'#f5e5ba':'#483a27';ctx.font='13px monospace';ctx.fillText(`Original / broader · ${setting.clip} · ${night?'mirror/night':'day'} · ${animation.mode} ${seconds.toFixed(3)}s`,12,24);renderCalls++;await new Promise(requestAnimationFrame);
    }
    recordings.push({clip:setting.clip,night,facing:night?-1:1,offsetMs:start-beginning,elapsedMs:performance.now()-start,cycleSeconds:cycle,renderCalls,modes,seenPoses:[...seen].sort((a,b)=>a-b),expectedPoses:[...new Set(clip.frames.map(i=>setting.row*4+i))].sort((a,b)=>a-b)});
   }}finally{recorder.stop();await stopped;for(const track of stream.getTracks())track.stop();}
   const bytes=new Uint8Array(await new Blob(chunks,{type}).arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));movie=btoa(binary);
  }
  const png=board.toDataURL('image/png').split(',')[1];for(const frame of owned)frame.width=frame.height=0;scratch.width=scratch.height=0;
  return {scope:'Internal sixteen-pose idle source review and a partial gait/standing/idle provider. Native gesture timing and static biome contexts only; no public recipe, fitted parts, complete anatomical family, physical travel cadence or hardware frame-pacing acceptance.',measurements,diagnostics,standingHead,newRegistrations,unavailablePoseRefusals,recordings,movie,board:png,worldImages};
 },{sources,spec,registrations,video});
 assert.deepEqual(errors,[]);assert.equal(result.unavailablePoseRefusals,12);assert.equal(Object.keys(result.newRegistrations).length,spec.sources.length);
 await writeFile(output+'/comparison.png',Buffer.from(result.board,'base64'));delete result.board;
 for(const row of result.worldImages){row.path=output+'/'+row.biome+'-'+(row.night?'night':'day')+'.png';await writeFile(row.path,Buffer.from(row.data,'base64'));delete row.data;}
 if(result.movie){const bytes=Buffer.from(result.movie,'base64');await writeFile(output+'/motion.webm',bytes);result.videoSha256=hash(bytes);}delete result.movie;
 for(const [clip,r]of Object.entries(result.newRegistrations))await writeFile(output+'/'+clip+'-registration.json',JSON.stringify(r,null,2)+'\n');
 result.inputs={};for(const path of [specPath,'scripts/review-broad-idle.mjs','web/character-contact-atlas.js','web/resident-animation.js','web/resident-animation-profiles.js','web/sprite-frames.js','web/world-renderer.js','web/projection.js',root+'/breathe-registration-v1.json',root+'/walk-registration-v3-contacts.json',...Object.values(files)])result.inputs[path]=hash(await readFile(path));
 await writeFile(output+'/report.json',JSON.stringify(result,null,2)+'\n');
 for(const d of result.diagnostics){assert(d.headGroundSpread<=spec.maximumHeadGroundSpread,d.clip+' changes head height excessively');assert(d.standingHeadDifference<=spec.maximumStandingHeadDifference,d.clip+' differs from standing stature');}
 if(video)for(const row of result.recordings){assert.deepEqual(row.modes.map(p=>p.mode),['breathe',row.clip,'breathe']);assert.deepEqual(row.seenPoses,row.expectedPoses,'Native gesture skipped an expected pose');}
 console.log(JSON.stringify({poses:16,worldViews:96,unavailablePoseRefusals:12,diagnostics:result.diagnostics,recordings:result.recordings,scope:result.scope}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
