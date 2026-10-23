// Internal art review through the shared world/animation painters. It does not
// add an appearance to player recipes or modify a saved village.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const root='assets/art-direction/character-prototype-v1',name='short-beard-complete-jaw-corrected-v1',output=root+'/'+name+'/world',video=process.argv.includes('--video');await mkdir(output,{recursive:true});
const manifest=JSON.parse(await readFile(root+'/'+name+'/report.json','utf8')),sources=[];
for(const source of manifest.sources){const folder=root+'/'+source.collection,bytes=await readFile(folder+'/'+source.paint);assert.equal(createHash('sha256').update(bytes).digest('hex'),source.sha256);const raw=JSON.parse(await readFile(folder+'/'+source.file,'utf8')),registrations=(Array.isArray(raw)?raw:[raw]).filter(r=>source.selectedPoses.includes(r.sheet+':'+r.index));assert.equal(registrations.length,source.selectedPoses.length);sources.push({...source,registrations,data:bytes.toString('base64')});}
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:900,height:420}}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(`http://127.0.0.1:${server.address().port}/facial-world-review`);
 const result=await page.evaluate(async({sources,video})=>{
  const {default:init,Game}=await import('/pkg/solar_friends.js');await init();
  const {loadEditorArt}=await import('/editor/map-view.js'),{createResidentPartLibrary}=await import('/resident-parts.js'),{residentPartRecipe}=await import('/resident-part-recipe.js'),{composeFacialHairProvider}=await import('/character-facial-hair.js');
  const {project}=await import('/projection.js'),{paintTerrain,soilAppearance}=await import('/terrain.js'),{paintWorldGround,paintWorldTree,paintWorldBuilding,paintContactShadow}=await import('/world-renderer.js'),{drawResidentAnimation,sampleResidentClip,residentClips}=await import('/resident-animation.js'),{RESIDENT_WIDTH}=await import('/sprite-frames.js'),{unlitFilter}=await import('/power.js');
  const {residentClipTiming}=await import('/resident-animation-profiles.js');
  const art=await loadEditorArt(),library=createResidentPartLibrary(),binding=(await(await fetch('/art/characters/prototype-v1/straw-hat-work-v1-registration.json')).json()).source.body,entries=new Map(),providers=[];
  const load=async src=>{const image=new Image();image.src=src;await image.decode();return image;};
  for(const source of sources){const image=await load('data:image/png;base64,'+source.data);for(const registration of source.registrations){const key=registration.sheet+':'+registration.index;if(entries.has(key))throw Error('Duplicate facial pose');entries.set(key,{image,registration,sourceHash:source.sha256});}}
  if(entries.size!==48)throw Error('Incomplete facial pose collection');
  const reference={base:art.residents[1],idle:await load('/art/animations/bento-idle.png'),activities:await load('/art/animations/bento-activities.png')};
  for(const hair of ['short-curls-v1','side-part-v1'])providers.push(composeFacialHairProvider({provider:await library.prepare(residentPartRecipe({hair})),binding,entries}));
  const canvas=document.createElement('canvas');canvas.width=900;canvas.height=420;document.body.replaceChildren(canvas);document.body.style.margin='0';const ctx=canvas.getContext('2d'),surface=document.createElement('canvas');surface.width=surface.height=256;
  const game=new Game(),worlds=[],images=[];
  const scene=(world,clip,seconds,night,facing=1)=>{
   const scale=1.3,anchor=project(30,33,{x:0,y:0},scale),origin={x:440-anchor.x,y:315-anchor.y},position=(x,y)=>project(x,y,origin,scale);
   ctx.fillStyle=night?'#263c4b':'#dfe6c9';ctx.fillRect(0,0,900,420);ctx.save();ctx.filter=unlitFilter(night);paintWorldGround(ctx,world.ground,origin,scale);ctx.restore();
   const objects=world.land.vegetation.filter(t=>!t.cleared).map(tree=>({depth:tree.x+tree.y,draw:()=>paintWorldTree(ctx,tree,{project:position,scale,width:900,height:420,forest:art.forest,details:art.details,night})}));
   for(const building of world.definition.start.buildings)objects.push({depth:building.x+building.y,draw:()=>paintWorldBuilding(ctx,{key:building.kind,x:building.x,y:building.y},{project:position,scale,images:art.images,night,light:0})});
   for(const [provider,x]of [[reference,30.5],[providers[0],32],[providers[1],33.5]])objects.push({depth:x+33+.6,draw:()=>{const p=position(x,33);paintContactShadow(ctx,p.x,p.y,10*scale,4*scale,.22);ctx.save();ctx.filter=unlitFilter(night);drawResidentAnimation(ctx,surface,provider,{layers:sampleResidentClip(clip,seconds,provider.animationProfile),facing,breath:1},p.x,p.y,RESIDENT_WIDTH*scale);ctx.restore();}});
   objects.sort((a,b)=>a.depth-b.depth).forEach(o=>o.draw());ctx.fillStyle='#f5e5ba';ctx.fillRect(8,8,660,24);ctx.fillStyle='#483a27';ctx.font='12px monospace';ctx.fillText(`${world.biome} · ${clip} ${seconds.toFixed(2)}s · ${night?'night':'day'} · Bento / curls+beard / side-part+beard`,16,25);
  };
  try{
   for(const biome of ['mata-atlantica','cerrado','caatinga']){
    const definition=JSON.parse(game.scenario_template('sandbox'));definition.map=JSON.parse(game.generate_biome_property(biome,42));definition.start.buildings.push({id:'facial-review-home',kind:'home',x:28,y:34,state:'completed',recipe:'standard',appearance:null});definition.start.roads.push([30,34],[31,34],[32,34]);
    const checked=JSON.parse(game.load_scenario(JSON.stringify(definition)));if(!checked.ok)throw Error(JSON.stringify(checked));const snapshot=JSON.parse(game.report_state()),land=snapshot.village.land,ground=paintTerrain(art.terrain,definition.start.roads,[],soilAppearance(land.soil),land.seed,definition.map),world={biome,definition,land,ground};worlds.push(world);
    const board=document.createElement('canvas');board.width=1800;board.height=840;const b=board.getContext('2d');for(const night of [0,1])for(const [column,[clip,seconds]]of [['look',.01],['work',.65]].entries()){scene(world,clip,seconds,night);b.drawImage(canvas,column*900,night*420);}
    images.push({biome,data:board.toDataURL('image/png').split(',')[1],buildings:definition.start.buildings.map(b=>({kind:b.kind,x:b.x,y:b.y})),roads:definition.start.roads});
   }
   let movie=null,recordedFrames=0;const recordings=[];
   if(video){
    const stream=canvas.captureStream(30),type=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm',recorder=new MediaRecorder(stream,{mimeType:type}),chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};const stopped=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=reject;});recorder.start();
    const recordingStart=performance.now();
    try{for(const night of [0,1])for(const [clip,spec]of Object.entries(residentClips)){
     const timing=residentClipTiming('neutral-v1',clip),cycleSeconds=timing?.durations.reduce((sum,n)=>sum+n,0)??(spec.fps>0?spec.frames.length/spec.fps:1),targetMs=Math.max(1.2,cycleSeconds*1.1)*1000,start=performance.now();let frames=0;
     while(performance.now()-start<targetMs){scene(worlds[0],clip,(performance.now()-start)/1000,night,night?-1:1);recordedFrames++;frames++;await new Promise(requestAnimationFrame);}
     recordings.push({clip,night,facing:night?-1:1,cycleSeconds,targetMs,offsetMs:start-recordingStart,elapsedMs:performance.now()-start,renderedFrames:frames});
    }}
    finally{recorder.stop();await stopped;for(const track of stream.getTracks())track.stop();}
    const bytes=new Uint8Array(await new Blob(chunks,{type}).arrayBuffer());let binary='';for(let n=0;n<bytes.length;n+=32768)binary+=String.fromCharCode(...bytes.subarray(n,n+32768));movie=btoa(binary);
   }
   return {images,movie,recordings,recordedFrames,clipCount:Object.keys(residentClips).length,sceneCount:12,residentComparisons:36,scope:'Static shared-world scenes across three biomes; optional recording covers at least one complete cycle plus the next boundary (or held/nonlooping end) per clip. Recording alone is not an automated visual or frame-pacing verdict.'};
  }finally{game.free();for(const provider of providers)provider.dispose();for(const world of worlds)world.ground.width=world.ground.height=0;}
 },{sources,video});
 assert.deepEqual(errors,[]);for(const row of result.images){await writeFile(output+'/'+row.biome+'.png',Buffer.from(row.data,'base64'));delete row.data;}if(result.movie)await writeFile(output+'/clips.webm',Buffer.from(result.movie,'base64'));delete result.movie;
 result.sourceManifestSha256=createHash('sha256').update(await readFile(root+'/'+name+'/report.json')).digest('hex');await writeFile(output+'/report.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
