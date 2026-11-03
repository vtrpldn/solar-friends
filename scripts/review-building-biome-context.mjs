import {closeValidationBrowser} from './close-validation-browser.mjs';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const output=process.argv[2]??'artifacts/building-biome-context',zoom=Number(process.argv.find(a=>a.startsWith('--zoom='))?.slice(7)??1);
const cropStates=process.argv.includes('--crop-states'),cropBuildings=(process.argv.find(a=>a.startsWith('--crop-buildings='))?.slice(17)??'garden,greenhouse').split(',');assert(cropBuildings.length&&cropBuildings.every(k=>['garden','greenhouse'].includes(k))&&new Set(cropBuildings).size===cropBuildings.length,'Choose garden and/or greenhouse crop buildings');
const lighting=process.argv.find(a=>a.startsWith('--lighting='))?.slice(11)??'day';assert(['day','powered-night','unpowered-night','rain'].includes(lighting));
assert([.65,1,1.8].includes(zoom),'Choose a documented review zoom: .65, 1 or 1.8');await mkdir(output,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),inputs={'scripts/review-building-biome-context.mjs':sha(await readFile('scripts/review-building-biome-context.mjs'))};
const server=await serve(0,{async handle(_req,res,path){
 if(path==='/building-context-review'){res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><title>Building context review</title>');return true;}
 if(/\.(js|json|png|wasm)$/.test(path))inputs['web'+path]=sha(await readFile('web'+path));return false;
}});let browser;
const report={complete:false,zoom,lighting,cropStates,cropBuildings,inputs,scope:'Static controlled building appearances through shared game world painters, depth-masked emissions, atmosphere and weather; native-generated regional terrain and bank eligibility. Reference home, original Iara and adjoining road. Rain uses a native rainy-day window. Power levels are controlled presentation comparisons, not proof of functioning authored circuits. Optional crop-state boards use the shared crop painter for empty, young, maturing, ready and dry/stressed beds. These are controlled visual states, not simulated growth, scenario feasibility, construction/animal lifecycle, resident motion or automatic visual acceptance.',boards:[]};
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/building-context-review`);
 await page.evaluate(async lighting=>{
  const [{default:init,Game},{loadEditorArt},{allBuildingArt,cameraCalibration},{footprint,placementArt},{paintTerrain},{paintWorldGround,paintWorldBuilding,paintContactShadow},{project},{FRAME_ANCHOR,RESIDENT_WIDTH}]=await Promise.all([import('/pkg/solar_friends.js'),import('/editor/map-view.js'),import('/building-art.js'),import('/building-footprints.js'),import('/terrain.js'),import('/world-renderer.js'),import('/projection.js'),import('/sprite-frames.js')]);
  await init();const {buildingSilhouettes}=await import('/building-silhouettes.js');const art=await loadEditorArt(),game=new Game(),person=await art.appearances.prepare({preset:'iara',version:1});
  const {paintWorldCrops}=await import('/world-renderer.js'),{cropTypes}=await import('/crop-art.js');
  const [{paintWorldAtmosphere},{drawNightEmission,createDepthLightPass},{nightAmount},{unlitFilter,buildingLighting},{weatherConditions,drawGroundWeather,drawWeatherAir}]=await Promise.all([import('/world-atmosphere.js'),import('/night-lighting.js'),import('/building-art.js'),import('/power.js'),import('/weather.js')]);
  const nightImages={},sources={};
  if(lighting!=='day'){
   const byFile=new Map(Object.entries(allBuildingArt).map(([key,a])=>[a.file,art.images[key]]));
   for(const [key,a]of Object.entries(allBuildingArt)){if(!byFile.has(a.nightFile)){const image=new Image();image.src='/art/'+a.nightFile;await image.decode();byFile.set(a.nightFile,image);}nightImages[key]=byFile.get(a.nightFile);}
   const {makeArtPreview}=await import('/dev/art-preview.js'),fresh=JSON.parse(game.snapshot()),established=await fetch('/artwork/village-preview.json').then(r=>r.json());if(!game.restore(JSON.stringify(established)))throw Error('Native artwork baseline refused');if(!game.restore(JSON.stringify(makeArtPreview(fresh,JSON.parse(game.snapshot()),{night:true}))))throw Error('Native artwork lighting fixture refused');
   const snapshot=JSON.parse(game.snapshot());for(const b of snapshot.village.buildings)sources[b.kind]=snapshot.environment.power.connections.find(c=>c.id===b.id)?.source;for(const key of Object.keys(allBuildingArt)){const kind=key.startsWith('home-')||key.startsWith('adobe-')?'home':key;if(!['roof','grid','none','solar','hydro'].includes(sources[kind]))throw Error('Missing native lighting classification for '+key);}
  }
  window.reviewBuildings={lighting,cropTypes,paintWorldCrops,nightImages,sources,paintWorldAtmosphere,drawNightEmission,createDepthLightPass,nightAmount,unlitFilter,buildingLighting,weatherConditions,drawGroundWeather,drawWeatherAir,art,game,allBuildingArt,cameraCalibration,footprint,placementArt,buildingSilhouettes,paintTerrain,paintWorldGround,paintWorldBuilding,paintContactShadow,project,FRAME_ANCHOR,RESIDENT_WIDTH,person,grounds:new Map()};
 },lighting);
 for(const biome of ['mata-atlantica','cerrado','caatinga']){
  await page.evaluate(biome=>{
   const r=window.reviewBuildings,{game}=r,d=JSON.parse(game.scenario_template('sandbox'));d.map=JSON.parse(game.generate_biome_property(biome,42));d.rules.climate=true;d.start.minutes=r.lighting.includes('night')?1260:720;
   if(r.lighting==='rain'){const catalog=JSON.parse(game.scenario_catalog());d.rules.weather={...catalog.biomes.find(b=>b.id===biome).weather,wet_rain_chance:100,dry_rain_chance:100,intro_days:0};}
   let loaded=JSON.parse(game.load_scenario(JSON.stringify(d)));if(!loaded.ok)throw Error(JSON.stringify(loaded));
   if(r.lighting==='rain'){d.start.minutes=JSON.parse(game.snapshot()).environment.weather.forecast[0].rain_start+40;loaded=JSON.parse(game.load_scenario(JSON.stringify(d)));if(!loaded.ok)throw Error(JSON.stringify(loaded));}
   const snapshot=JSON.parse(game.snapshot());r.minutes=d.start.minutes;r.darkness=r.nightAmount(r.minutes);r.conditions=r.lighting==='rain'?r.weatherConditions(snapshot.environment,r.minutes):{rain:0,wet:0,clouds:0};if(r.lighting==='rain'&&!r.conditions.rain)throw Error('Rain reference is not actually raining');
   r.biome=biome;r.map=d.map;r.bank=JSON.parse(game.world_geometry()).hydro_sites.sort((a,b)=>(a[0]-32)**2+(a[1]-32)**2-((b[0]-32)**2+(b[1]-32)**2))[0];if(!r.bank)throw Error('Missing native eligible bank');
  },biome);
  for(let start=0;;start+=9){
   const capture=await page.evaluate(({start,zoom,cropStates,cropBuildings})=>{
    const r=window.reviewBuildings,cases=cropStates?cropBuildings.flatMap(key=>[{key,state:'empty',crop:{kind:'lettuce',planted:false,growth:0,harvests:0,moisture:0}} ,...Object.entries(r.cropTypes).flatMap(([kind,type])=>[['young',0,1],['maturing',.5,1],['ready',1,1],['dry-stressed',.5,0]].map(([state,fraction,moisture])=>({key,state,crop:{kind,planted:true,growth:type.minutes*fraction,harvests:0,moisture}})))]):Object.keys(r.allBuildingArt).map(key=>({key})),keys=cases.slice(start,start+9);if(!keys.length)return null;
    const w=560,h=430,caption=24,board=document.createElement('canvas');board.width=w*3;board.height=(h+caption)*Math.ceil(keys.length/3);const out=board.getContext('2d'),entries=[];
    for(const [i,review]of keys.entries()){
     const {key,state,crop}=review;
     const hydro=key==='hydro',[x,y]=hydro?r.bank:[32,32],n=r.footprint(key,x,y),side=hydro?-3:3,home={x:x+side,y},front=n.maxY+.5,roads=hydro?[[x-3,y+1]]:Array.from({length:n.size},(_,j)=>[Math.ceil(n.minX)+j,front]);
     const groundKey=hydro?'bank':n.size;
     if(!r.grounds.has(groundKey)){const map=hydro?r.map:{...r.map,river:null};r.grounds.set(groundKey,r.paintTerrain(r.art.terrain,roads,[],[],42,map));}
     const scene=document.createElement('canvas');scene.width=w;scene.height=h;let ctx=scene.getContext('2d');const target=r.project(x,y,{x:0,y:0},zoom),origin={x:(hydro?320:220)-target.x,y:310-target.y},position=(x,y)=>r.project(x,y,origin,zoom);
     ctx.fillStyle='#dfe6c9';ctx.fillRect(0,0,w,h);r.paintWorldGround(ctx,r.grounds.get(groundKey),origin,zoom);
     const nativeKind=k=>k.startsWith('home-')||k.startsWith('adobe-')?'home':k,person={x:x+.1,y:y+1.8};
     const weatherView={conditions:r.conditions,buildings:[{kind:nativeKind(key),x,y},{kind:'home',...home}],project:position,scale:zoom,time:12,reducedMotion:false,map:hydro?r.map:{...r.map,river:null},width:w,height:h};r.drawGroundWeather(ctx,weatherView);
     const building=(key,x,y)=>{const source=r.sources[nativeKind(key)],level=r.buildingLighting({connections:[{id:0,source,light_level:r.lighting==='unpowered-night'?0:1}]},0,nativeKind(key));return {depth:x+y,draw:()=>{r.paintWorldBuilding(ctx,{key,x,y},{project:position,scale:zoom,images:r.art.images,nightImages:r.nightImages,night:r.darkness,light:level});if(crop&&key===review.key)r.paintWorldCrops(ctx,{kind:key,x,y,crop},{project:position,scale:zoom,night:r.darkness,light:level,health:state==='dry-stressed'?.3:1});},light:()=>{if(!r.darkness||!level||!['grid','roof'].includes(source))return null;const p=position(x,y);return r.drawNightEmission(ctx,r.nightImages[key],r.allBuildingArt[key],key,p.x,p.y,zoom,r.darkness*level);}};};
     const paintPerson=shadow=>{const p=position(person.x,person.y),size=r.RESIDENT_WIDTH*zoom;if(shadow)r.paintContactShadow(ctx,p.x,p.y+2*zoom,10*zoom,4*zoom,.25);ctx.save();ctx.filter=r.unlitFilter(r.darkness);ctx.drawImage(r.art.appearances.portraitFrame({preset:'iara',version:1}),p.x-size/2,p.y-size*r.FRAME_ANCHOR,size,size);ctx.restore();};
     const objects=[building(key,x,y),building('home',home.x,home.y),{depth:person.x+person.y+.6,draw:()=>paintPerson(true),occlude:()=>paintPerson(false)}];
     const bounds=({key,x,y})=>{const a=r.allBuildingArt[key],p=r.placementArt(key,a),c=r.cameraCalibration(a),at=position(x,y),points=r.buildingSilhouettes[key].hull.map(([u,v])=>[at.x+(p.x+(u-.5)*a.width*p.scale)*zoom,at.y+(p.y+((v-a.anchor*(a.aspect||1))*c.vertical+(u-.5)*c.shear)*a.width*p.scale)*zoom]);const b={left:Math.min(...points.map(p=>p[0])),right:Math.max(...points.map(p=>p[0])),top:Math.min(...points.map(p=>p[1])),bottom:Math.max(...points.map(p=>p[1]))};if(b.left<1||b.right>w-1||b.top<1||b.bottom>h-1)throw Error(key+' is clipped in its review scene: '+JSON.stringify(b));return b;};
     const targetBounds=bounds({key,x,y}),referenceBounds=bounds({key:'home',...home});
     const lightLayer=document.createElement('canvas');lightLayer.width=w;lightLayer.height=h;const lightContext=lightLayer.getContext('2d'),worldContext=ctx,pass=r.darkness?r.createDepthLightPass(lightContext):null;
     objects.sort((a,b)=>a.depth-b.depth).forEach(o=>{o.draw();if(pass){ctx=lightContext;try{pass.paint(o.occlude??o.draw,o.light);}finally{ctx=worldContext;}}});r.drawWeatherAir(ctx,weatherView);r.paintWorldAtmosphere(ctx,{minutes:r.minutes,darkness:r.darkness,width:w,height:h,lightLayer});lightLayer.width=lightLayer.height=0;const bx=i%3*w,by=Math.floor(i/3)*(h+caption);out.drawImage(scene,bx,by);out.fillStyle='#efe3bc';out.fillRect(bx,by+h,w,caption);out.fillStyle='#483a27';out.font='13px sans-serif';out.fillText(`${key}${crop?' · '+crop.kind+' '+state:''} · ${r.biome} · ${r.lighting==='day'?'daylight':r.lighting} ×${zoom}${hydro?' · eligible riverbank':''}`,bx+8,by+h+16);
     entries.push({key,...(crop?{crop,state}:{}),biome:r.biome,zoom,lighting:r.lighting,minutes:r.minutes,conditions:r.conditions,powerSource:r.sources[nativeKind(key)]??null,position:[x,y],referenceHome:[home.x,home.y],roads,targetBounds,referenceBounds});scene.width=scene.height=0;
    }
    const png=board.toDataURL('image/png').split(',')[1];board.width=board.height=0;return {png,entries};
   },{start,zoom,cropStates,cropBuildings});
   if(!capture)break;const bytes=Buffer.from(capture.png,'base64'),file=`${biome}-zoom-${zoom}${lighting==='day'?'':'-'+lighting}-group-${start/9+1}.png`;await writeFile(`${output}/${file}`,bytes);report.boards.push({file,sha256:sha(bytes),entries:capture.entries});
  }
  await page.evaluate(()=>{for(const ground of window.reviewBuildings.grounds.values())ground.width=ground.height=0;window.reviewBuildings.grounds.clear();});
 }
 assert.equal(report.boards.flatMap(b=>b.entries).length,cropStates?75*cropBuildings.length:81);assert.deepEqual(errors,[]);await page.evaluate(async lighting=>{const r=window.reviewBuildings;r.game.free();await r.art.appearances.dispose();});
 for(const [path,hash]of Object.entries(inputs))assert.equal(sha(await readFile(path)),hash,path);report.complete=true;report.browserErrors=errors;await writeFile(`${output}/report.json`,JSON.stringify(report,null,2)+'\n');console.log(`CAPTURED ${report.boards.flatMap(b=>b.entries).length} shared-renderer contexts; cleanup and visual inspection still pending.`);
}finally{try{await closeValidationBrowser(browser,server);report.cleanup={ok:true};}catch(error){report.complete=false;report.cleanup={ok:false,error:String(error)};throw error;}finally{await writeFile(`${output}/report.json`,JSON.stringify(report,null,2)+'\n');}}
console.log(`PASS captured ${report.boards.flatMap(b=>b.entries).length} shared-renderer contexts and completed cleanup. Visual inspection is still required.`);
