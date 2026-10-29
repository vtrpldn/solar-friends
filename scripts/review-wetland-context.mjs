import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const output=process.argv[2]??'artifacts/wetland-context',inputs={},sha=b=>createHash('sha256').update(b).digest('hex');await mkdir(output,{recursive:true});inputs['scripts/review-wetland-context.mjs']=sha(await readFile('scripts/review-wetland-context.mjs'));
const server=await serve(0,{async handle(_req,res,path){if(path==='/wetland-review'){res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><title>Reed bed context review</title>');return true;}if(/\.(js|png|json|wasm)$/.test(path))inputs['web'+path]=sha(await readFile('web'+path));return false;}});let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/wetland-review`);
 await page.evaluate(async()=>{const {default:init,Game}=await import('/pkg/solar_friends.js'),{loadEditorArt}=await import('/editor/map-view.js');await init();window.review={game:new Game(),art:await loadEditorArt()};});
 const report={inputs,views:[],definitions:[],scope:'Native-validated road-adjacent reed bed in three biomes, shared game painters, original resident and home scale reference. Day and unpowered night, zoom 1 and 2. Static manually cleared review site; not resident path/service completion, rain, all buildings or mathematical geometry acceptance.'};
 for(const biome of ['mata-atlantica','cerrado','caatinga']){
  const definition=await page.evaluate(biome=>{const {game}=window.review,d=JSON.parse(game.scenario_template('sandbox'));d.map=JSON.parse(game.generate_biome_property(biome,42));d.map.nature=d.map.nature.filter(t=>t.x<25||t.x>39||t.y<26||t.y>40);d.start.buildings.push({id:'review-reed-bed',kind:'wetland',x:32,y:34,state:'completed',recipe:'standard',appearance:null},{id:'review-home',kind:'home',x:28,y:34,state:'completed',recipe:'standard',appearance:null});for(let x=27;x<=34;x++)d.start.roads.push([x,35]);const validation=JSON.parse(game.load_scenario(JSON.stringify(d)));if(!validation.ok)throw Error(JSON.stringify(validation.issues));window.review.definition=d;window.review.land=JSON.parse(game.report_state()).village.land;return d;},biome);
  const file=`${biome}.solar-scenario`;await writeFile(`${output}/${file}`,JSON.stringify(definition));report.definitions.push({biome,file,sha256:sha(JSON.stringify(definition))});
  await page.evaluate(async()=>{const s=window.review,{paintTerrain,soilAppearance}=await import('/terrain.js');if(s.ground)s.ground.width=s.ground.height=0;s.ground=paintTerrain(s.art.terrain,s.definition.start.roads,[],soilAppearance(s.land.soil),s.land.seed,s.definition.map);});
  for(const zoom of [1,2])for(const night of [0,1]){
   const png=await page.evaluate(async({zoom,night,biome})=>{
    const s=window.review,{project}=await import('/projection.js'),{paintWorldGround,paintWorldBuilding,paintWorldTree}=await import('/world-renderer.js'),{footprintCorners}=await import('/building-footprints.js'),{preparedFrames,FRAME_ANCHOR}=await import('/sprite-frames.js'),{unlitFilter}=await import('/power.js');
    const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=900;const ctx=canvas.getContext('2d'),anchor=project(31,34,{x:0,y:0},zoom),origin={x:600-anchor.x,y:580-anchor.y},position=(x,y)=>project(x,y,origin,zoom);ctx.fillStyle=night?'#233b47':'#dfe6c9';ctx.fillRect(0,0,1200,900);ctx.save();ctx.filter=unlitFilter(night);paintWorldGround(ctx,s.ground,origin,zoom);ctx.restore();
    for(const kind of ['wetland','home']){const x=kind==='wetland'?32:28;ctx.strokeStyle=night?'#fff6cd':'#415639';ctx.lineWidth=2;ctx.setLineDash([5,4]);ctx.beginPath();footprintCorners(kind,x,34).forEach(([x,y],i)=>{const p=position(x,y);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);});ctx.closePath();ctx.stroke();ctx.setLineDash([]);}
    const objects=s.land.vegetation.filter(t=>!t.cleared).map(t=>({depth:t.x+t.y,draw:()=>paintWorldTree(ctx,t,{project:position,scale:zoom,width:1200,height:900,forest:s.art.forest,details:s.art.details,night})}));
    for(const b of s.definition.start.buildings)objects.push({depth:b.x+b.y,draw:()=>paintWorldBuilding(ctx,{key:b.kind,x:b.x,y:b.y},{project:position,scale:zoom,images:s.art.images,night,light:0})});
    const p=position(34,35.5),w=48*zoom;objects.push({depth:69.5,draw:()=>{ctx.save();ctx.filter=unlitFilter(night);ctx.drawImage(preparedFrames(s.art.residents[0],{referenceRow:2})[8],p.x-w/2,p.y-w*FRAME_ANCHOR,w,w);ctx.restore();}});objects.sort((a,b)=>a.depth-b.depth).forEach(o=>o.draw());
    ctx.fillStyle='#efe3bc';ctx.fillRect(8,8,1184,42);ctx.fillStyle='#483a27';ctx.font='15px monospace';ctx.fillText(`${biome} / zoom ${zoom} / ${night?'unpowered night':'day'} / reed bed + adjacent road`,16,34);return canvas.toDataURL().split(',')[1];
   },{zoom,night,biome});const file=`${biome}-${zoom}-${night?'night':'day'}.png`,bytes=Buffer.from(png,'base64');await writeFile(`${output}/${file}`,bytes);report.views.push({biome,zoom,night,file,sha256:sha(bytes)});
  }
 }
 assert.deepEqual(errors,[]);for(const [p,h]of Object.entries(inputs))assert.equal(sha(await readFile(p)),h,p);await writeFile(`${output}/report.json`,JSON.stringify(report,null,2)+'\n');await page.evaluate(async()=>{const s=window.review;await s.art.appearances.dispose();s.game.free();s.ground.width=s.ground.height=0;});console.log('PASS 12 source-bound native-validated reed-bed context captures; visual inspection remains required.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
