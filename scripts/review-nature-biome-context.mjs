import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';

const output=process.argv[2]??'artifacts/nature-biome-context';
const zoom=Number(process.argv.find(a=>a.startsWith('--zoom='))?.slice(7)??1);
const lighting=process.argv.find(a=>a.startsWith('--lighting='))?.slice(11)??'day';
assert([.65,1,1.8].includes(zoom));assert(['day','night','rain'].includes(lighting));
await mkdir(output,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const inputs={'scripts/review-nature-biome-context.mjs':sha(await readFile('scripts/review-nature-biome-context.mjs'))};
const server=await serve(0,{async handle(_req,res,path){
 if(path==='/nature-context-review'){res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><title>Nature context review</title>');return true;}
 if(/\.(js|png|wasm)$/.test(path))inputs['web'+path]=sha(await readFile('web'+path));return false;
}});
const report={complete:false,zoom,lighting,inputs,boards:[],scope:'All native nature catalog entries at native minimum, unit and maximum size against three regional terrain palettes. Shared world painters, ambient night shading and native rainy-window conditions. Controlled artwork comparisons, not claims that every species is locally appropriate, navigation-safe or automatically visually accepted.'};
let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/nature-context-review`);
 await page.evaluate(async()=>{
  const [{default:init,Game},{loadEditorArt},{paintTerrain},{paintWorldGround,paintWorldTree,worldTreeBounds,paintWorldBuilding,paintContactShadow},{project},{paintWorldAtmosphere},{nightAmount},{unlitFilter},{weatherConditions,drawGroundWeather,drawWeatherAir},{FRAME_ANCHOR,RESIDENT_WIDTH}]=await Promise.all([import('/pkg/solar_friends.js'),import('/editor/map-view.js'),import('/terrain.js'),import('/world-renderer.js'),import('/projection.js'),import('/world-atmosphere.js'),import('/building-art.js'),import('/power.js'),import('/weather.js'),import('/sprite-frames.js')]);
  await init();const game=new Game(),art=await loadEditorArt();await art.appearances.prepare({preset:'iara',version:1});
  const catalog=JSON.parse(game.scenario_catalog());
  window.natureReview={game,art,catalog,paintTerrain,paintWorldGround,paintWorldTree,worldTreeBounds,paintWorldBuilding,paintContactShadow,project,paintWorldAtmosphere,nightAmount,unlitFilter,weatherConditions,drawGroundWeather,drawWeatherAir,FRAME_ANCHOR,RESIDENT_WIDTH};
 });
 for(const biome of ['mata-atlantica','cerrado','caatinga']){
  await page.evaluate(({biome,lighting})=>{
   const r=window.natureReview,d=JSON.parse(r.game.scenario_template('sandbox'));d.map=JSON.parse(r.game.generate_biome_property(biome,42));d.map.river=null;d.rules.climate=true;d.start.minutes=lighting==='night'?1260:720;
   if(lighting==='rain')d.rules.weather={...r.catalog.biomes.find(b=>b.id===biome).weather,wet_rain_chance:100,dry_rain_chance:100,intro_days:0};
   let loaded=JSON.parse(r.game.load_scenario(JSON.stringify(d)));if(!loaded.ok)throw Error(JSON.stringify(loaded));
   if(lighting==='rain'){d.start.minutes=JSON.parse(r.game.snapshot()).environment.weather.forecast[0].rain_start+40;loaded=JSON.parse(r.game.load_scenario(JSON.stringify(d)));if(!loaded.ok)throw Error(JSON.stringify(loaded));}
   const snapshot=JSON.parse(r.game.snapshot());r.minutes=d.start.minutes;r.night=r.nightAmount(r.minutes);r.map=d.map;r.biome=biome;
   r.conditions=lighting==='rain'?r.weatherConditions(snapshot.environment,r.minutes):{rain:0,wet:0,clouds:0};if(lighting==='rain'&&!r.conditions.rain)throw Error('Expected native rain');
   r.ground=r.paintTerrain(r.art.terrain,[[32,33],[33,33],[34,33]],[],[],42,r.map);
  },{biome,lighting});
  for(let start=0;;start+=3){
   const capture=await page.evaluate(({start,zoom,lighting})=>{
    const r=window.natureReview,species=r.catalog.nature.slice(start,start+3);if(!species.length)return null;
    const w=600,h=440,label=28,board=document.createElement('canvas');board.width=w*3;board.height=(h+label)*species.length;const out=board.getContext('2d'),entries=[];
    for(const [row,s]of species.entries())for(const [column,size]of [s.min_size,1,s.max_size].entries()){
     const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d'),anchor=r.project(32,32,{x:0,y:0},zoom),origin={x:190-anchor.x,y:310-anchor.y},project=(x,y)=>r.project(x,y,origin,zoom);
     const tree={x:32,y:32,species:s.art_index,size},bounds=r.worldTreeBounds(tree,{project,scale:zoom});
     if(!bounds||bounds.left<0||bounds.right>w||bounds.top<0||bounds.bottom>h)throw Error(s.key+' review clipped: '+JSON.stringify(bounds));
     const treeOptions={project,scale:zoom,width:w,height:h,forest:r.art.forest,details:r.art.details,night:r.night};
     const measure=draw=>{const layer=document.createElement('canvas');layer.width=w;layer.height=h;draw(layer.getContext('2d'));const pixels=layer.getContext('2d').getImageData(0,0,w,h).data;let left=w,right=-1,top=h,bottom=-1,count=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(pixels[(y*w+x)*4+3]){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);count++;}layer.width=layer.height=0;if(!count||left===0||right===w-1||top===0||bottom===h-1)throw Error('Missing or clipped review raster: '+s.key);return{left,right,top,bottom,alphaPixels:count};};
     const treePixels=measure(c=>r.paintWorldTree(c,tree,treeOptions)),referencePixels=measure(c=>r.paintWorldBuilding(c,{key:'home',x:35,y:32},{project,scale:zoom,images:r.art.images,night:r.night,light:0}));
     ctx.fillStyle='#dfe6c9';ctx.fillRect(0,0,w,h);r.paintWorldGround(ctx,r.ground,origin,zoom);
     const view={conditions:r.conditions,buildings:[{kind:'home',x:35,y:32}],project,scale:zoom,time:12,reducedMotion:false,map:r.map,width:w,height:h};r.drawGroundWeather(ctx,view);
     const person={x:31.6,y:33.3},objects=[{depth:64,draw:()=>r.paintWorldTree(ctx,tree,{project,scale:zoom,width:w,height:h,forest:r.art.forest,details:r.art.details,night:r.night})},{depth:67,draw:()=>r.paintWorldBuilding(ctx,{key:'home',x:35,y:32},{project,scale:zoom,images:r.art.images,night:r.night,light:0})},{depth:person.x+person.y+.6,draw:()=>{const p=project(person.x,person.y),width=r.RESIDENT_WIDTH*zoom;r.paintContactShadow(ctx,p.x,p.y+2*zoom,10*zoom,4*zoom,.25);ctx.save();ctx.filter=r.unlitFilter(r.night);ctx.drawImage(r.art.appearances.portraitFrame({preset:'iara',version:1}),p.x-width/2,p.y-width*r.FRAME_ANCHOR,width,width);ctx.restore();}}];
     objects.sort((a,b)=>a.depth-b.depth).forEach(o=>o.draw());r.drawWeatherAir(ctx,view);r.paintWorldAtmosphere(ctx,{minutes:r.minutes,darkness:r.night,width:w,height:h});
     const x=column*w,y=row*(h+label);out.drawImage(canvas,x,y);out.fillStyle='#efe3bc';out.fillRect(x,y+h,w,label);out.fillStyle='#483a27';out.font='13px sans-serif';out.fillText(`${s.name} · ${['minimum','unit','maximum'][column]} ${size.toFixed(2)} · ${r.biome} · ${lighting} ×${zoom}`,x+8,y+h+18);
     entries.push({key:s.key,artIndex:s.art_index,size,biome:r.biome,lighting,zoom,bounds,treePixels,referencePixels,minutes:r.minutes,conditions:r.conditions});canvas.width=canvas.height=0;
    }
    const png=board.toDataURL('image/png').split(',')[1];board.width=board.height=0;return{png,entries};
   },{start,zoom,lighting});
   if(!capture)break;const file=`${biome}-zoom-${zoom}-${lighting}-group-${start/3+1}.png`,bytes=Buffer.from(capture.png,'base64');await writeFile(`${output}/${file}`,bytes);report.boards.push({file,sha256:sha(bytes),entries:capture.entries});
  }
  await page.evaluate(()=>{const r=window.natureReview;r.ground.width=r.ground.height=0;});
 }
 const species=await page.evaluate(()=>window.natureReview.catalog.nature.length);assert.equal(report.boards.flatMap(b=>b.entries).length,species*3*3);assert.deepEqual(errors,[]);
 for(const [path,hash]of Object.entries(inputs))assert.equal(sha(await readFile(path)),hash,path);
 await page.evaluate(async()=>{const r=window.natureReview;r.game.free();await r.art.appearances.dispose();});
 report.complete=true;report.browserErrors=errors;await writeFile(`${output}/report.json`,JSON.stringify(report,null,2)+'\n');console.log(`PASS captured ${species*9} nature size/biome contexts. Visual inspection remains required.`);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
