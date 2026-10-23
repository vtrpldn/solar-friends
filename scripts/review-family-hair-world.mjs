// Internal art review through the shared world/animation painters. It does not
// add an appearance to player recipes or modify a saved village.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const root='assets/art-direction/character-prototype-v1/body-family-relaxed-v1',output=root+'/hair-registered-v3/world';await mkdir(output,{recursive:true});
const ownership=JSON.parse(await readFile(root+'/ownership-v1.json','utf8')),materials=JSON.parse(await readFile(root+'/materials-v7.json','utf8')),registrations=JSON.parse(await readFile(root+'/hair-registered-v3/registrations-v1.json','utf8')),files=JSON.parse(await readFile(root+'/source-files-v1.json','utf8')),sources={},hairSources={};
for(const [id,file]of Object.entries(files)){const bytes=await readFile(file),sourceHash=createHash('sha256').update(bytes).digest('hex');assert.equal(sourceHash,ownership.sources[id].sha256);sources[id]={sourceHash,data:bytes.toString('base64')};}
for(const entry of registrations)if(!hairSources[entry.file]){const bytes=await readFile(entry.sourcePath??'web/art/characters/prototype-v1/'+entry.file),sourceHash=createHash('sha256').update(bytes).digest('hex');assert.equal(sourceHash,entry.registration.partSha256);hairSources[entry.file]={sourceHash,data:bytes.toString('base64')};}
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:900,height:420}}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(`http://127.0.0.1:${server.address().port}/facial-world-review`);
 const result=await page.evaluate(async({ownership,materials,registrations,sources,hairSources})=>{
  const {default:init,Game}=await import('/pkg/solar_friends.js');await init();
  const {loadEditorArt}=await import('/editor/map-view.js'),{prepareBodyFamily}=await import('/character-body-family.js'),{createFamilyBodyMaterialModel}=await import('/character-materials.js'),{prepareRegisteredHair}=await import('/character-hair.js');
  const {project}=await import('/projection.js'),{paintTerrain,soilAppearance}=await import('/terrain.js'),{paintWorldGround,paintWorldTree,paintWorldBuilding,paintContactShadow}=await import('/world-renderer.js'),{drawResidentAnimation,sampleResidentClip}=await import('/resident-animation.js'),{RESIDENT_WIDTH}=await import('/sprite-frames.js'),{unlitFilter}=await import('/power.js');
  const art=await loadEditorArt(),load=async src=>{const image=new Image();image.src=src;await image.decode();return image;},loaded={},hair=new Map();for(const [id,s]of Object.entries(sources))loaded[id]={image:await load('data:image/png;base64,'+s.data),sourceHash:s.sourceHash};for(const [id,s]of Object.entries(hairSources))hair.set(id,{image:await load('data:image/png;base64,'+s.data),sourceHash:s.sourceHash});
  const family=await prepareBodyFamily({ownership,sources:loaded}),model=await createFamilyBodyMaterialModel(family,materials,{maxFrames:8}),painted=model.provider({skin:'warm',shirt:'teal',shorts:'sage',shoes:'graphite'}),composed=[[],[]];for(const e of registrations){const r=e.registration,style=e.name==='curls'?0:1;composed[style][r.index]=await prepareRegisteredHair({...hair.get(e.file),registration:r}).compose({body:family.frames.base[r.index],binding:family.binding,referenceBody:family.frames.base[8],appearanceBody:painted.frameForPose('base',r.index)});}
  const providers=composed.map(frames=>({animationProfile:'neutral-v1',interpolation:'keyframes',frameForPose(sheet,index){if(sheet!=='base'||index<0||index>3)throw Error('Only registered walking hair exists here');return frames[index];}})),reference={base:art.residents[1]};
  const canvas=document.createElement('canvas');canvas.width=900;canvas.height=420;document.body.replaceChildren(canvas);document.body.style.margin='0';const ctx=canvas.getContext('2d'),surface=document.createElement('canvas');surface.width=surface.height=256;
  const game=new Game(),worlds=[],images=[];
  const scene=(world,clip,seconds,night,facing=1)=>{
   const scale=1.3,anchor=project(30,33,{x:0,y:0},scale),origin={x:440-anchor.x,y:315-anchor.y},position=(x,y)=>project(x,y,origin,scale);
   ctx.fillStyle=night?'#263c4b':'#dfe6c9';ctx.fillRect(0,0,900,420);ctx.save();ctx.filter=unlitFilter(night);paintWorldGround(ctx,world.ground,origin,scale);ctx.restore();
   const objects=world.land.vegetation.filter(t=>!t.cleared).map(tree=>({depth:tree.x+tree.y,draw:()=>paintWorldTree(ctx,tree,{project:position,scale,width:900,height:420,forest:art.forest,details:art.details,night})}));
   for(const building of world.definition.start.buildings)objects.push({depth:building.x+building.y,draw:()=>paintWorldBuilding(ctx,{key:building.kind,x:building.x,y:building.y},{project:position,scale,images:art.images,night,light:0})});
   for(const [provider,x]of [[reference,30.5],[providers[0],32],[providers[1],33.5]])objects.push({depth:x+33+.6,draw:()=>{const p=position(x,33);paintContactShadow(ctx,p.x,p.y,10*scale,4*scale,.22);ctx.save();ctx.filter=unlitFilter(night);drawResidentAnimation(ctx,surface,provider,{layers:sampleResidentClip(clip,seconds,provider.animationProfile),facing,breath:1},p.x,p.y,RESIDENT_WIDTH*scale);ctx.restore();}});
   objects.sort((a,b)=>a.depth-b.depth).forEach(o=>o.draw());ctx.fillStyle='#f5e5ba';ctx.fillRect(8,8,660,24);ctx.fillStyle='#483a27';ctx.font='12px monospace';ctx.fillText(`${world.biome} · ${clip} ${seconds.toFixed(2)}s · ${night?'night':'day'} · Bento / registered curls / corrected side part`,16,25);
  };
  try{
   for(const biome of ['mata-atlantica','cerrado','caatinga']){
    const definition=JSON.parse(game.scenario_template('sandbox'));definition.map=JSON.parse(game.generate_biome_property(biome,42));definition.start.buildings.push({id:'facial-review-home',kind:'home',x:28,y:34,state:'completed',recipe:'standard',appearance:null});definition.start.roads.push([30,34],[31,34],[32,34]);
    const checked=JSON.parse(game.load_scenario(JSON.stringify(definition)));if(!checked.ok)throw Error(JSON.stringify(checked));const snapshot=JSON.parse(game.report_state()),land=snapshot.village.land,ground=paintTerrain(art.terrain,definition.start.roads,[],soilAppearance(land.soil),land.seed,definition.map),world={biome,definition,land,ground};worlds.push(world);
    for(const night of [0,1]){const board=document.createElement('canvas');board.width=1800;board.height=840;const b=board.getContext('2d');for(const [i,seconds]of [.01,.135,.26,.385].entries()){scene(world,'walk',seconds,night,night?-1:1);b.drawImage(canvas,i%2*900,Math.floor(i/2)*420);}images.push({biome,night,data:board.toDataURL('image/png').split(',')[1],buildings:definition.start.buildings.map(b=>({kind:b.kind,x:b.x,y:b.y})),roads:definition.start.roads});}
   }
   return {images,sceneCount:24,residentComparisons:72,scope:'Four registered walking poses through the shared native world/animation painters, day and mirrored night, original Bento, registered curls and corrected side part across all three biomes. Static scale/ground/style and registered hair review only; no public recipes or complete character approval.'};
  }finally{game.free();for(const frames of composed)for(const frame of frames)frame.width=frame.height=0;model.clear();family.dispose();for(const world of worlds)world.ground.width=world.ground.height=0;}
 },{ownership,materials,registrations,sources,hairSources});
 assert.deepEqual(errors,[]);for(const row of result.images){await writeFile(output+'/'+row.biome+'-'+(row.night?'night':'day')+'.png',Buffer.from(row.data,'base64'));delete row.data;}
 result.registrationSha256=createHash('sha256').update(await readFile(root+'/hair-registered-v3/registrations-v1.json')).digest('hex');await writeFile(output+'/report.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
