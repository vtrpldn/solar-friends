// Candidate-only review. No public recipe, bundle or saved person is changed.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';

const root='assets/art-direction/character-prototype-v1/body-broad-v1';
const seated=process.argv.includes('--seated');
const walk=process.argv.includes('--walk');
const breathe=process.argv.includes('--breathe');
assert([seated,walk,breathe].filter(Boolean).length<=1,'Choose one pose collection');
const video=process.argv.includes('--video');assert(!video||walk||breathe,'Motion capture supports gait and breathing collections');
const walkVersion=process.argv.includes('--walk-v3')?'v3':'v2';
const contacts=breathe||process.argv.includes('--contacts');assert(!contacts||breathe||walk&&walkVersion==='v3','Atlas contact study uses the corrected gait or breathing poses');
const revision=breathe?'breathe-v1':walk?'walk-'+walkVersion+(contacts?'-contacts':''):seated?'seated-v1':process.argv.includes('--v3')?'v3':process.argv.includes('--v2')?'v2':'v1';
const files={candidate:root+'/'+(breathe?'breathe-candidate-v1':walk?'walk-candidate-'+walkVersion:seated?'seated-candidate-v1':'base-candidate-'+revision)+'.png',reference:walk?'assets/art-direction/character-prototype-v1/body-walk-cycle-v3/candidate-v1.png':'web/art/characters/prototype-v1/body-neutral-base.png'};
if(breathe)files.gait=root+'/walk-candidate-v3.png';
const gaitRegistration=breathe?JSON.parse(await readFile(root+'/walk-registration-v3-contacts.json')):null;
const referenceRegistration=walk?JSON.parse(await readFile('assets/art-direction/character-prototype-v1/body-walk-cycle-v3/registration-v1.json')):null;
const sources={};
for(const [key,path]of Object.entries(files)){
 const bytes=await readFile(path);sources[key]={path,sha256:createHash('sha256').update(bytes).digest('hex'),data:bytes.toString('base64')};
}
await mkdir(root+'/world',{recursive:true});
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:900,height:420}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/broad-body-review`);
 const result=await page.evaluate(async({sources,seated,walk,breathe,contacts,video,referenceRegistration,gaitRegistration})=>{
  const {locateSpriteFrames,preparedFrames,RESIDENT_WIDTH,FRAME_ANCHOR}=await import('/sprite-frames.js');
  const {prepareRegisteredBodyFrames}=await import('/character-body-frames.js');
  const {prepareContactAtlasFrames}=await import('/character-contact-atlas.js');
  const {drawResidentAnimation,sampleResidentClip,advanceResidentAnimation}=await import('/resident-animation.js');
  const {unlitFilter}=await import('/power.js');
  const images={},frames={},measurements={};let registration=null;
  for(const [key,source]of Object.entries(sources)){
   const image=new Image();image.src='data:image/png;base64,'+source.data;await image.decode();images[key]=image;
   const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
   const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
   const smaller=walk||key==='gait'||(seated||breathe)&&key==='candidate',columns=smaller?2:4,rows=columns;
   const layout=locateSpriteFrames(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height,columns,rows,smaller?0:2);
   measurements[key]={width:canvas.width,height:canvas.height,uniformScale:layout.scale*256,poses:layout.frames.map(f=>({bounds:[f.left,f.top,f.right,f.bottom],pivot:f.pivot,area:f.area,sourceClipped:f.left<2||f.top<2||f.right>canvas.width-2||f.bottom>canvas.height-2}))};
   if(key==='gait')frames[key]=prepareContactAtlasFrames({image,sourceHash:source.sha256},gaitRegistration).frames;
   else if(walk&&key==='reference')frames[key]=prepareRegisteredBodyFrames({image,sourceHash:source.sha256},referenceRegistration);
   else if(smaller){
    const waists=walk?[[351,343],[970,342],[346,977],[975,977]]:[[350,410],[950,445],[370,990],[985,1000]];
    registration={schema:1,family:'broad-body-prototype-v1',sheet:'base',source:{sha256:source.sha256,width:canvas.width,height:canvas.height,columns,rows},uniformScale:walk?.45:.38,frames:waists.map((waist,index)=>({index,waist}))};
    if(contacts){
     registration={...registration,uniformScale:breathe?.425:registration.uniformScale,frames:(breathe?[[355,608],[912,608],[359,1214],[912,1214]]:waists.map(([x,y])=>[x,y+240])).map((sourceContact,index)=>({index,sourceContact,nativeContact:[128,228]}))};
     frames[key]=prepareContactAtlasFrames({image,sourceHash:source.sha256},registration).frames;
    }else frames[key]=prepareRegisteredBodyFrames({image,sourceHash:source.sha256},registration);
   }else frames[key]=preparedFrames(image,{referenceRow:2});canvas.width=canvas.height=0;
  }
  for(const [key,collection]of Object.entries(frames)){
   measurements[key].normalized=collection.map(frame=>{
    const pixels=frame.getContext('2d').getImageData(0,0,256,256).data,bounds=[256,256,0,0];
    for(let y=0;y<256;y++)for(let x=0;x<256;x++)if(pixels[(y*256+x)*4+3]>=32){bounds[0]=Math.min(bounds[0],x);bounds[1]=Math.min(bounds[1],y);bounds[2]=Math.max(bounds[2],x+1);bounds[3]=Math.max(bounds[3],y+1);}
    let weight=0,headX=0,headY=0;
    for(let y=bounds[1];y<bounds[1]+(bounds[3]-bounds[1])*.22;y++)for(let x=0;x<256;x++){const alpha=pixels[(y*256+x)*4+3];weight+=alpha;headX+=x*alpha;headY+=y*alpha;}
    return {bounds,height:bounds[3]-bounds[1],upperSilhouetteCentroid:[headX/weight,headY/weight]};
   });
  }
  const normalized=[];
  for(const [index,frame]of frames.candidate.entries()){
   const rgba=frame.getContext('2d').getImageData(0,0,256,256).data;
   const digest=await crypto.subtle.digest('SHA-256',rgba);
   normalized.push({index,sha256:[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('')});
  }
  const board=document.createElement('canvas');board.width=breathe?3072:2048;board.height=seated||walk||breathe?280:1120;const b=board.getContext('2d');
  b.fillStyle='#e8dfbf';b.fillRect(0,0,board.width,board.height);
  for(let index=0;index<(seated||walk||breathe?4:16);index++){
   const x=index%4*(breathe?768:512),y=Math.floor(index/4)*280;
   for(const [column,key]of (breathe?['reference','candidate','gait']:['reference','candidate']).entries()){
    const contact=key==='gait'?gaitRegistration.frames[0].nativeContact:contacts&&key==='candidate'?registration.frames[index].nativeContact:[128,FRAME_ANCHOR*256];
    const poseIndex=key==='gait'?0:index+(key==='reference'?(seated?12:breathe?8:0):0);
    b.drawImage(frames[key][poseIndex],x+column*256+128-contact[0],y+FRAME_ANCHOR*256-contact[1]);
   }
   b.fillStyle='#483a27';b.font='12px monospace';b.fillText(`base:${index+(seated?12:breathe?8:0)} original / broader candidate${breathe?' / broader gait scale':''}`,x+8,y+275);
  }
  const {default:init,Game}=await import('/pkg/solar_friends.js');await init();
  const {loadEditorArt}=await import('/editor/map-view.js');
  const {project}=await import('/projection.js');
  const {paintTerrain,soilAppearance}=await import('/terrain.js');
  const {paintWorldGround,paintWorldTree,paintWorldBuilding,paintContactShadow}=await import('/world-renderer.js');
  const art=await loadEditorArt(),game=new Game(),worldImages=[];
  const canvas=document.createElement('canvas');canvas.width=900;canvas.height=420;const ctx=canvas.getContext('2d');
  const scratch=document.createElement('canvas');scratch.width=scratch.height=256;
  const providers=['reference','candidate'].map(key=>({animationProfile:'neutral-v1',interpolation:'keyframes',frameForPose(sheet,index){if(sheet!=='base'||!Number.isInteger(index))throw Error('Choose an authored integer base-sheet pose');if(walk&&(index<0||index>3))throw Error('Only four gait poses exist');if(breathe&&key==='candidate'){if(index>=0&&index<4)return frames.gait[index];if(index>=8&&index<12)return frames.candidate[index-8];throw Error('Only authored gait and breathing poses exist');}if(seated&&key==='candidate'){if(index<12||index>15)throw Error('Only seated prototype poses exist');return frames[key][index-12];}return frames[key][index];}}));
  if(contacts)providers[1].contactForPose=(sheet,index)=>{if(sheet!=='base'||!Number.isInteger(index))throw Error('Choose an authored body contact');if(breathe){if(index>=0&&index<4)return [...gaitRegistration.frames[index].nativeContact];if(index>=8&&index<12)return [...registration.frames[index-8].nativeContact];throw Error('Choose an authored gait or breathing contact');}if(index<0||index>3)throw Error('Choose an authored gait contact');return [...registration.frames[index].nativeContact];};
  const gaitProvider=breathe?{animationProfile:'neutral-v1',interpolation:'keyframes',frameForPose(sheet,index){if(sheet!=='base'||!Number.isInteger(index)||index<0||index>3)throw Error('Only authored gait poses exist');return frames.gait[index];},contactForPose(sheet,index){if(sheet!=='base'||!Number.isInteger(index)||index<0||index>3)throw Error('Choose an authored gait contact');return [...gaitRegistration.frames[index].nativeContact];}}:null;
  try{
   for(const biome of ['mata-atlantica','cerrado','caatinga']){
    const definition=JSON.parse(game.scenario_template('sandbox'));definition.map=JSON.parse(game.generate_biome_property(biome,42));
    definition.start.buildings.push({id:'broad-review-home',kind:'home',x:28,y:34,state:'completed',recipe:'standard',appearance:null});
    definition.start.roads.push([30,34],[31,34],[32,34]);
    const checked=JSON.parse(game.load_scenario(JSON.stringify(definition)));if(!checked.ok)throw Error(JSON.stringify(checked));
    const land=JSON.parse(game.report_state()).village.land;
    const ground=paintTerrain(art.terrain,definition.start.roads,[],soilAppearance(land.soil),land.seed,definition.map);
    try{for(const night of [0,1]){
     const view=document.createElement('canvas');view.width=1800;view.height=840;const v=view.getContext('2d');
     for(const [i,clip]of (breathe?['breathe:0','breathe:1','breathe:2','breathe:3']:walk?['walk:0','walk:1','walk:2','walk:3']:seated?['seated:0','seated:1','seated:2','seated:3']:['breathe','work','sit','walk']).entries()){
      const scale=1.3,anchor=project(30,33,{x:0,y:0},scale),origin={x:440-anchor.x,y:(breathe?295:315)-anchor.y},position=(x,y)=>project(x,y,origin,scale);
      ctx.fillStyle=night?'#263c4b':'#dfe6c9';ctx.fillRect(0,0,900,420);ctx.save();ctx.filter=unlitFilter(night);paintWorldGround(ctx,ground,origin,scale);ctx.restore();
      const objects=land.vegetation.filter(t=>!t.cleared).map(tree=>({depth:tree.x+tree.y,draw:()=>paintWorldTree(ctx,tree,{project:position,scale,width:900,height:420,forest:art.forest,details:art.details,night})}));
      for(const building of definition.start.buildings)objects.push({depth:building.x+building.y,draw:()=>paintWorldBuilding(ctx,{key:building.kind,x:building.x,y:building.y},{project:position,scale,images:art.images,night,light:0})});
      for(const [provider,x]of [[{base:art.residents[1]},30.5],[providers[0],32],[providers[1],33.5],...(breathe?[[gaitProvider,35]]:[])])objects.push({depth:x+33+.6,draw:()=>{
       const p=position(x,33);paintContactShadow(ctx,p.x,p.y,10*scale,4*scale,.22);ctx.save();ctx.filter=unlitFilter(night);
       const layers=provider===gaitProvider?sampleResidentClip('walk',.01,provider.animationProfile):breathe?[{sheet:'base',row:2,frame:i,weight:1}]:walk?sampleResidentClip('walk',i*.125+.01,provider.animationProfile):seated?[{sheet:'base',row:3,frame:i,weight:1}]:sampleResidentClip(clip,.15,provider.animationProfile);
       drawResidentAnimation(ctx,scratch,provider,{layers,facing:night?-1:1,breath:1},p.x,p.y,RESIDENT_WIDTH*scale);ctx.restore();
      }});
      objects.sort((a,b)=>a.depth-b.depth).forEach(o=>o.draw());ctx.fillStyle='#f5e5ba';ctx.fillRect(8,8,870,24);ctx.fillStyle='#483a27';ctx.font='12px monospace';ctx.fillText(`${biome} · ${clip} · ${night?'mirror/night':'day'} · Bento / original / broader${breathe?' / gait':''}`,16,25);
      v.drawImage(canvas,i%2*900,Math.floor(i/2)*420);
     }
     worldImages.push({biome,night,data:view.toDataURL('image/png').split(',')[1]});view.width=view.height=0;
    }}finally{ground.width=ground.height=0;}
   }
  }finally{game.free();}
  let movie=null;const recordings=[];
  if(video){
   canvas.width=800;canvas.height=340;document.body.replaceChildren(canvas);
   const stream=canvas.captureStream(30),type=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm',recorder=new MediaRecorder(stream,{mimeType:type}),chunks=[];
   recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
   const stopped=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=reject;});
   recorder.start();const beginning=performance.now();
   try{for(const night of [0,1]){
    const start=performance.now(),modes=[];let renderCalls=0,previous=null,last=start;
    while(performance.now()-start<(breathe?7200:3000)){
     const now=performance.now(),seconds=(now-start)/1000;
     const walking=seconds<.8||seconds>=6.5;
     const animation=breathe?advanceResidentAnimation(previous,{id:1,x:4,y:4,target_x:walking?5:4,target_y:4,task:'stretch'},0,(now-last)/1000,'neutral-v1'):{layers:sampleResidentClip('walk',seconds,'neutral-v1'),breath:1,mode:'walk'};
     if(animation.mode!==previous?.mode)modes.push({mode:animation.mode,seconds});previous=animation;last=now;
     ctx.fillStyle=night?'#263c4b':'#e8dfbf';ctx.fillRect(0,0,800,340);
     ctx.save();ctx.filter=unlitFilter(night);
     for(const [i,provider]of providers.entries())for(const [size,y,offset]of [[220,290,0],[48,315,130]])drawResidentAnimation(ctx,scratch,provider,{...animation,facing:night?-1:1},190+i*400+offset,y,size);
     ctx.restore();ctx.fillStyle=night?'#f5e5ba':'#483a27';ctx.font='14px monospace';ctx.fillText(`${breathe?'Original neutral / broader walk-rest-walk':'Current gait / broader gait'} · ${night?'mirror/night':'day'} · ${animation.mode} ${seconds.toFixed(3)}s`,12,24);
     renderCalls++;await new Promise(requestAnimationFrame);
    }
    recordings.push({night,facing:night?-1:1,offsetMs:start-beginning,elapsedMs:performance.now()-start,renderCalls,cycleSeconds:breathe?5:.5,modes});
   }}finally{recorder.stop();await stopped;for(const track of stream.getTracks())track.stop();}
   const bytes=new Uint8Array(await new Blob(chunks,{type}).arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));movie=btoa(binary);
  }
  scratch.width=scratch.height=0;
  let unavailablePoseRefusals=0;
  if(breathe)for(const [sheet,index]of [['base',4],['base',12],['idle',0],['base','8'],['base',-1],['base',NaN]])for(const method of ['frameForPose','contactForPose']){
   let refused=false;try{providers[1][method](sheet,index);}catch{refused=true;}if(!refused)throw Error('Partial body provider accepted an unauthored pose');unavailablePoseRefusals++;
  }
  return {measurements,registration,normalized,recordings,movie,unavailablePoseRefusals,board:board.toDataURL('image/png').split(',')[1],worldImages,scope:breathe?'Internal broader-body breathing source with existing broader gait. Four standing pose comparisons, gait scale reference and 24 static world views in three biomes; optional day/mirrored-night native walk-breathe-walk transitions include a full five-second breathing cycle. No translating travel cadence, complete body family, fitted parts or public availability acceptance.':walk?'Internal broader-body four-pose gait candidate. Exact registered reference gait, normalized pose comparison, 24 static world views across three biomes and optional day/mirrored-night encoded motion. No complete body family, clothing, accessories or public availability acceptance.':seated?'Internal separately authored four-pose seated candidate with one measured uniform transform. Four normalized comparisons and 24 static world views in three biomes, day and mirrored night. Closed-eye sitting is not a sleeping pose. No complete family, attachment, motion or public appearance acceptance.':'Internal base-sheet body candidate only. Sixteen normalized pose comparisons and 24 static world views using four base-sheet clips in three biomes, day and mirrored night. No complete gait, sleep, hair, clothing fit,full animation or public appearance acceptance.'};
 },{sources,seated,walk,breathe,contacts,video,referenceRegistration,gaitRegistration});
 assert.deepEqual(errors,[]);
 for(const [key,measurement]of Object.entries(result.measurements))assert.equal(measurement.poses.length,walk||key==='gait'||(seated||breathe)&&key==='candidate'?4:16);
 await writeFile(root+'/base-comparison-'+revision+'.png',Buffer.from(result.board,'base64'));delete result.board;
 for(const row of result.worldImages){
  if(seated||walk||breathe){row.path=root+'/world/'+row.biome+'-'+(row.night?'night':'day')+'-'+revision+'.png';await writeFile(row.path,Buffer.from(row.data,'base64'));}
  delete row.data;
 }
 result.sources=Object.fromEntries(Object.entries(sources).map(([key,{path,sha256}])=>[key,{path,sha256}]));
 if(result.movie){const movie=Buffer.from(result.movie,'base64');await writeFile(root+'/motion-'+revision+'.webm',movie);result.videoSha256=createHash('sha256').update(movie).digest('hex');}delete result.movie;
 result.scriptSha256=createHash('sha256').update(await readFile('scripts/review-broad-body.mjs')).digest('hex');
 result.rendererInputs={};for(const path of ['web/character-contact-atlas.js','web/character-body-frames.js','web/sprite-frames.js','web/resident-animation.js','web/resident-animation-profiles.js','web/world-renderer.js','web/projection.js'])result.rendererInputs[path]=createHash('sha256').update(await readFile(path)).digest('hex');
 result.candidateEdgeClear=result.measurements.candidate.poses.every(p=>!p.sourceClipped);
 if(walk){const heights=result.measurements.candidate.normalized.map(p=>p.height);result.stature={heights,spread:Math.max(...heights)-Math.min(...heights),maximumSpread:12};}
 if(contacts){const heads=result.measurements.candidate.normalized.map((p,i)=>p.upperSilhouetteCentroid[1]-result.registration.frames[i].nativeContact[1]);result.groundAlignment={method:'contact-atlas-v1',headYFromGround:heads,spread:Math.max(...heads)-Math.min(...heads),maximumSpread:8,...(breathe?{}:{sourceGroundOffsetFromWaist:240}),nativeGround:[128,228],scope:'Compare rendered upper silhouette relative to the authored ground origin. Full silhouette height varies with projected stride; its lowest boot no longer defines the body origin.'};}
 if(breathe){const gaitHeads=result.measurements.gait.normalized.map((p,i)=>p.upperSilhouetteCentroid[1]-gaitRegistration.frames[i].nativeContact[1]),mean=values=>values.reduce((sum,n)=>sum+n,0)/values.length;result.gaitScaleComparison={standingHeadMean:mean(result.groundAlignment.headYFromGround),gaitHeadMean:mean(gaitHeads),maximumDifference:10};result.gaitScaleComparison.difference=Math.abs(result.gaitScaleComparison.standingHeadMean-result.gaitScaleComparison.gaitHeadMean);}
 await writeFile(root+'/base-review-'+revision+'.json',JSON.stringify(result,null,2)+'\n');
 assert(result.candidateEdgeClear,'Painted candidate body clipped at image edge');
 if(walk&&!contacts)assert(result.stature.spread<=result.stature.maximumSpread,'Gait stature changes excessively between poses; repaint anatomy');
 if(contacts)assert(result.groundAlignment.spread<=result.groundAlignment.maximumSpread,'Ground-registered upper body changes excessively between poses');
 if(breathe){assert(result.gaitScaleComparison.difference<=result.gaitScaleComparison.maximumDifference,'Standing head scale differs excessively from its gait');assert.equal(result.unavailablePoseRefusals,12);if(video)for(const row of result.recordings)assert.deepEqual(row.modes.map(p=>p.mode),['walk','breathe','walk']);}
 if(seated||walk||breathe)await writeFile(root+'/'+(breathe?'breathe-registration-v1':walk?'walk-registration-'+walkVersion+(contacts?'-contacts':''):'seated-registration-v1')+'.json',JSON.stringify(result.registration,null,2)+'\n');
 console.log(JSON.stringify({poses:seated||walk||breathe?4:16,worldViews:24,sources:result.sources,recordings:result.recordings,scope:result.scope}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
