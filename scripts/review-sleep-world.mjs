// Internal artwork review through actual world primitives; no public activation.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const root='assets/art-direction/character-prototype-v1/sleep-body-study-v2/family-v2',definition=JSON.parse(await readFile(root+'/definition-v1.json')),output=root+'/world-v1';await mkdir(output,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex'),files=['scripts/review-sleep-world.mjs',root+'/definition-v1.json','web/resident-animation.js','web/resident-ground-shadow.js','web/resident-shadow-metadata.js','web/world-renderer.js','web/weather.js','web/terrain.js','web/character-body-family.js','web/character-family-appearance.js','web/pkg/solar_friends_bg.wasm','web/projection.js','web/building-art.js','web/building-footprints.js','web/building-projection.js','web/regional-art.js','web/nature-art.js','web/art/terrain-atlas.png','web/art/mata-atlantica-atlas.png','web/art/landscape-details.png','web/art/regional-ground-v1.png','web/art/cerrado-vegetation-v1.png','web/art/caatinga-vegetation-v1.png','web/art/village-atlas-isometric.png'],inputs=Object.fromEntries(await Promise.all(files.map(async f=>[f,sha(await readFile(f))])));
const server=await serve(0,{async handle(_req,res,path){if(!path.startsWith('/sleep-world-source/'))return false;const source=definition.sources[path.slice('/sleep-world-source/'.length)];if(!source){res.writeHead(404).end();return true;}const bytes=await readFile(source.path);assert.equal(sha(bytes),source.sha256);res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store'}).end(bytes);return true;}});let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/sleep-world-review`);
 const result=await page.evaluate(async definition=>{
  const {default:init,Game}=await import('/pkg/solar_friends.js');await init();
  const {loadEditorArt}=await import('/editor/map-view.js'),{prepareBodyFamily}=await import('/character-body-family.js'),{prepareFamilyAppearanceLibrary}=await import('/character-family-appearance.js'),{loadCharacterImageSource}=await import('/character-image-source.js'),{paintTerrain,soilAppearance}=await import('/terrain.js'),{project}=await import('/projection.js'),{paintWorldGround,paintWorldBuilding,paintWorldTree}=await import('/world-renderer.js'),{paintResidentShadow}=await import('/resident-ground-shadow.js'),{drawResidentAnimation,sampleResidentClip}=await import('/resident-animation.js'),{RESIDENT_WIDTH}=await import('/sprite-frames.js'),{unlitFilter}=await import('/power.js'),{drawGroundWeather,drawWeatherAir}=await import('/weather.js');
  const art=await loadEditorArt(),cache=new Map(),load=file=>{if(!cache.has(file))cache.set(file,loadCharacterImageSource('/sleep-world-source/'+file));return cache.get(file);},sources={};for(const [id,file]of Object.entries(definition.bodySources))sources[id]=await load(file);
  const family=await prepareBodyFamily({ownership:definition.ownership,sources}),libraries=[],leases=[],providers=[];const canvas=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h}),sheets=[];
  try{
   for(const clothed of [false,true]){const library=await prepareFamilyAppearanceLibrary({family,materials:definition.materials,owners:definition.owners,equipment:definition.equipment,workEquipment:definition.workEquipment,accessories:definition.accessories,...(clothed?{clothing:definition.clothing}:{}),load,maxEntries:2});libraries.push(library);for(const hair of ['curls','sidepart']){const lease=await library.acquire({hair,hairColour:'chestnut',materials:{skin:'copper',shirt:'teal',shorts:'sage',shoes:'graphite'},hat:'straw-v1',facialHair:'short-chestnut-v1'});leases.push(lease);providers.push({provider:lease.provider,label:(clothed?'short sleeves':'sleeveless')+' / '+hair});}}
   const game=new Game();try{
    for(const biome of ['mata-atlantica','cerrado','caatinga']){
     const d=JSON.parse(game.scenario_template('sandbox'));d.map=JSON.parse(game.generate_biome_property(biome,42));d.id='sleep-review-'+biome;d.journal=null;d.start.buildings=[];const items={};for(const inventory of d.start.inventories)for(const [key,n]of Object.entries(inventory.items))items[key]=(items[key]??0)+n;d.start.inventories=[{owner:{kind:'camp'},items}];
     // An explicitly authored review clearing keeps diagnostic actors visible.
     d.map.nature=d.map.nature.filter(t=>Math.hypot(t.x-32,t.y-32)>6);d.start.buildings.push({id:'reference-home',kind:'home',x:29,y:31,state:'completed',recipe:'standard',appearance:null});d.start.roads.push([31,36],[32,36],[33,36],[34,36]);
     const loaded=JSON.parse(game.load_scenario(JSON.stringify(d)));if(!loaded.ok)throw Error(JSON.stringify(loaded));const snapshot=JSON.parse(game.report_state()),land=snapshot.village.land,ground=paintTerrain(art.terrain,d.start.roads,[],soilAppearance(land.soil),land.seed,d.map);
     try{for(const state of ['day','night','rain']){
      const board=canvas(1600,1000),bc=board.getContext('2d'),panels=[];
      for(const [row,scale]of [1.3,2.6].entries())for(const [col,facing]of [1,-1].entries()){
       const view=canvas(800,500),ctx=view.getContext('2d'),night=state==='night'?1:0,anchor=project(32.5,32.5,{x:0,y:0},scale),origin={x:400-anchor.x,y:340-anchor.y},position=(x,y)=>project(x,y,origin,scale),conditions=state==='rain'?{rain:.85,wet:.8,clouds:.8}:{rain:0,wet:0,clouds:0};
       ctx.fillStyle=night?'#263c4b':'#dfe6c9';ctx.fillRect(0,0,800,500);ctx.save();ctx.filter=unlitFilter(night);paintWorldGround(ctx,ground,origin,scale);ctx.restore();
       const weatherArgs={conditions,buildings:snapshot.village.buildings,project:position,scale,time:12.5,reducedMotion:false,map:d.map};drawGroundWeather(ctx,weatherArgs);
       const objects=land.vegetation.filter(t=>!t.cleared).map(tree=>({depth:tree.x+tree.y,draw:()=>paintWorldTree(ctx,tree,{project:position,scale,width:800,height:500,forest:art.forest,details:art.details,night})}));
       for(const b of d.start.buildings)objects.push({depth:b.x+b.y,draw:()=>paintWorldBuilding(ctx,{key:b.kind,x:b.x,y:b.y},{project:position,scale,images:art.images,night,light:0})});
       providers.forEach(({provider,label},i)=>{const x=31+i,y=34-i;objects.push({depth:x+y+.6,draw:()=>{const p=position(x,y),animation={layers:sampleResidentClip('sleep',0,provider.animationProfile),facing,breath:1},scratch=canvas(128,128);paintResidentShadow(ctx,provider,animation,p.x,p.y,RESIDENT_WIDTH*scale,{rx:10*scale,ry:4*scale,offsetY:2*scale,opacity:.25});ctx.save();ctx.filter=unlitFilter(night);drawResidentAnimation(ctx,scratch,provider,animation,p.x,p.y,RESIDENT_WIDTH*scale);ctx.restore();scratch.width=scratch.height=0;ctx.font='12px sans-serif';ctx.textAlign='center';ctx.fillStyle=night?'#f5e5ba':'#344739';ctx.fillText(label,100+i*200,470);}});});
       objects.sort((a,b)=>a.depth-b.depth).forEach(o=>o.draw());const weather=drawWeatherAir(ctx,{...weatherArgs,width:800,height:500});ctx.font='16px sans-serif';ctx.textAlign='left';ctx.fillStyle=night?'#f5e5ba':'#344739';ctx.fillText(`${biome} / ${state} / scale ${scale} / facing ${facing}`,14,26);bc.drawImage(view,col*800,row*500);view.width=view.height=0;panels.push({scale,facing,weather});
      }
      sheets.push({biome,state,panels,png:board.toDataURL('image/png').split(',')[1]});board.width=board.height=0;
     }}finally{ground.width=ground.height=0;}
    }
   }finally{game.free();}
  }finally{for(const lease of leases)lease.release();for(const library of libraries)await library.dispose();family.dispose();await art.appearances.dispose?.();}
  return sheets;
 },definition);
 assert.deepEqual(errors,[]);assert.equal(result.length,9);for(const sheet of result){const file=`${sheet.biome}-${sheet.state}.png`,bytes=Buffer.from(sheet.png,'base64');await writeFile(output+'/'+file,bytes);delete sheet.png;sheet.file=file;sheet.sha256=sha(bytes);}
 for(const file of files)assert.equal(sha(await readFile(file)),inputs[file],'Review inputs changed');await writeFile(output+'/render-report.json',JSON.stringify({inputs,sheets:result,scope:'Internal complete sleeping families on actual generated biome ground, home, roads, native-size residents, source-bound shadows and runtime weather effects. Rain is an explicit visual preset, not a simulated event. Two zooms and both facings; no public bundle, motion or save/import acceptance.'},null,2)+'\n');console.log(JSON.stringify(result.map(({biome,state,file})=>({biome,state,file}))));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
