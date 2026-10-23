// Full prepared family composition; frozen old output comparisons are equivalence,
// while retained boards support a separate visual review of changed attachments.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const root='assets/art-direction/character-prototype-v1/body-family-relaxed-v1',out=root+'/complete-parts-v1',read=async file=>JSON.parse(await readFile(file,'utf8')),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const ownership=await read(root+'/ownership-v1.json'),materials=await read(root+'/materials-v7.json'),files=await read(root+'/source-files-v1.json'),sourceManifest=await read(out+'/sources-v1.json'),owners={curls:await read(out+'/hair-curls-v1.json'),sidepart:await read(out+'/hair-sidepart-v1.json')},equipment=await read(out+'/equipment-v1.json'),served=new Map();
for(const [id,path]of Object.entries(files)){const bytes=await readFile(path);assert.equal(sha(bytes),ownership.sources[id].sha256);served.set('/family-source/body-'+id,bytes);}
for(const [file,source]of Object.entries(sourceManifest)){const bytes=await readFile(source.path);assert.equal(sha(bytes),source.sha256);served.set('/family-source/'+file,bytes);}
const accessories=await read(root+'/accessories-v1/registration-v1.json'),accessorySources=await read(root+'/accessories-v1/sources-v1.json');for(const [file,source]of Object.entries(accessorySources)){const bytes=await readFile(source.path);assert.equal(sha(bytes),source.sha256);served.set('/family-source/'+file,bytes);}
const server=await serve(0,{handle(req,res,path){if(!served.has(path))return false;res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store'}).end(served.get(path));return true;}});let browser;
const output=root+'/accessories-v1/world';await mkdir(output,{recursive:true});
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:900,height:420}}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(`http://127.0.0.1:${server.address().port}/facial-world-review`);
 const result=await page.evaluate(async({ownership,materials,owners,equipment,accessories})=>{
  const {default:init,Game}=await import('/pkg/solar_friends.js');await init();
  const {loadEditorArt}=await import('/editor/map-view.js'),{prepareBodyFamily}=await import('/character-body-family.js'),{createFamilyBodyMaterialModel}=await import('/character-materials.js'),{prepareRegisteredHair}=await import('/character-hair.js');
  const {project}=await import('/projection.js'),{paintTerrain,soilAppearance}=await import('/terrain.js'),{paintWorldGround,paintWorldTree,paintWorldBuilding,paintContactShadow}=await import('/world-renderer.js'),{drawResidentAnimation,sampleResidentClip}=await import('/resident-animation.js'),{RESIDENT_WIDTH}=await import('/sprite-frames.js'),{unlitFilter}=await import('/power.js');
  const {loadCharacterImageSource}=await import('/character-image-source.js'),{prepareFamilyAppearanceLibrary}=await import('/character-family-appearance.js');
  const art=await loadEditorArt(),loaded={},sourceCache=new Map(),load=file=>{if(!sourceCache.has(file))sourceCache.set(file,loadCharacterImageSource('/family-source/'+file));return sourceCache.get(file);};for(const id of Object.keys(ownership.sources))loaded[id]=await loadCharacterImageSource('/family-source/body-'+id);
  const family=await prepareBodyFamily({ownership,sources:loaded}),library=await prepareFamilyAppearanceLibrary({family,materials,owners,equipment,accessories,load,maxEntries:2}),leases=[];
  for(const hair of ['curls','sidepart'])leases.push(await library.acquire({hair,hairColour:'chestnut',materials:{skin:'warm',shirt:'teal',shorts:'sage',shoes:'graphite'},hat:'straw-v1',facialHair:'short-chestnut-v1'}));const providers=leases.map(l=>l.provider),reference={base:art.residents[1]};
  const canvas=document.createElement('canvas');canvas.width=900;canvas.height=420;document.body.replaceChildren(canvas);document.body.style.margin='0';const ctx=canvas.getContext('2d'),surface=document.createElement('canvas');surface.width=surface.height=256;
  const game=new Game(),worlds=[],images=[];
  const scene=(world,clip,seconds,night,facing=1)=>{
   const scale=1.3,anchor=project(30,33,{x:0,y:0},scale),origin={x:440-anchor.x,y:315-anchor.y},position=(x,y)=>project(x,y,origin,scale);
   ctx.fillStyle=night?'#263c4b':'#dfe6c9';ctx.fillRect(0,0,900,420);ctx.save();ctx.filter=unlitFilter(night);paintWorldGround(ctx,world.ground,origin,scale);ctx.restore();
   const objects=world.land.vegetation.filter(t=>!t.cleared).map(tree=>({depth:tree.x+tree.y,draw:()=>paintWorldTree(ctx,tree,{project:position,scale,width:900,height:420,forest:art.forest,details:art.details,night})}));
   for(const building of world.definition.start.buildings)objects.push({depth:building.x+building.y,draw:()=>paintWorldBuilding(ctx,{key:building.kind,x:building.x,y:building.y},{project:position,scale,images:art.images,night,light:0})});
   for(const [provider,x]of [[reference,30.5],[providers[0],32],[providers[1],33.5]])objects.push({depth:x+33+.6,draw:()=>{const p=position(x,33);paintContactShadow(ctx,p.x,p.y,10*scale,4*scale,.22);ctx.save();ctx.filter=unlitFilter(night);drawResidentAnimation(ctx,surface,provider,{layers:sampleResidentClip(clip,seconds,provider.animationProfile),facing,breath:1},p.x,p.y,RESIDENT_WIDTH*scale);ctx.restore();}});
   objects.sort((a,b)=>a.depth-b.depth).forEach(o=>o.draw());ctx.fillStyle='#f5e5ba';ctx.fillRect(8,8,660,24);ctx.fillStyle='#483a27';ctx.font='12px monospace';ctx.fillText(`${world.biome} · ${clip} ${seconds.toFixed(2)}s · ${night?'night':'day'} · Bento / curls + hat/beard / side part + hat/beard`,16,25);
  };
  try{
   for(const biome of ['mata-atlantica','cerrado','caatinga']){
    const definition=JSON.parse(game.scenario_template('sandbox'));definition.map=JSON.parse(game.generate_biome_property(biome,42));definition.start.buildings.push({id:'facial-review-home',kind:'home',x:28,y:34,state:'completed',recipe:'standard',appearance:null});definition.start.roads.push([30,34],[31,34],[32,34]);
    const checked=JSON.parse(game.load_scenario(JSON.stringify(definition)));if(!checked.ok)throw Error(JSON.stringify(checked));const snapshot=JSON.parse(game.report_state()),land=snapshot.village.land,ground=paintTerrain(art.terrain,definition.start.roads,[],soilAppearance(land.soil),land.seed,definition.map),world={biome,definition,land,ground};worlds.push(world);
    for(const night of [0,1]){const board=document.createElement('canvas');board.width=1800;board.height=840;const b=board.getContext('2d');for(const [i,seconds]of [.01,.135,.26,.385].entries()){scene(world,'walk',seconds,night,night?-1:1);b.drawImage(canvas,i%2*900,Math.floor(i/2)*420);}images.push({biome,night,data:board.toDataURL('image/png').split(',')[1],buildings:definition.start.buildings.map(b=>({kind:b.kind,x:b.x,y:b.y})),roads:definition.start.roads});}
   }
   return {images,sceneCount:24,residentComparisons:72,scope:'Four complete hat/beard walking poses through the shared native world/animation painters across three biomes, day and mirrored night beside Bento and buildings. Static scale, layering, ground and lighting only; movement and public recipes remain unverified.'};
  }finally{game.free();for(const lease of leases)lease.release();await library.dispose();family.dispose();for(const world of worlds)world.ground.width=world.ground.height=0;}
 },{ownership,materials,owners,equipment,accessories});
 assert.deepEqual(errors,[]);for(const row of result.images){await writeFile(output+'/'+row.biome+'-'+(row.night?'night':'day')+'.png',Buffer.from(row.data,'base64'));delete row.data;}
 result.registrationSha256=sha(await readFile(root+'/accessories-v1/registration-v1.json'));result.rendererSha256={};for(const file of ['character-family-appearance.js','character-family-accessories.js','character-facial-hair.js'])result.rendererSha256[file]=sha(await readFile('web/'+file));await writeFile(output+'/report.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
