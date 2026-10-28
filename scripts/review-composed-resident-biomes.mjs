// Render internal composed artwork with the actual landscape/building/resident
// painters. This does not enroll a draft source in the player catalog.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const root='assets/art-direction/character-prototype-v1/body-broad-v1',hash=b=>createHash('sha256').update(b).digest('hex'),definition=JSON.parse(await readFile(`${root}/composed-family-draft-v8.json`)),sources={};
for(const [id,s]of Object.entries(definition.sources)){const bytes=await readFile(s.path);assert.equal(hash(bytes),s.sha256);sources[id]={data:bytes.toString('base64'),sourceHash:s.sha256};}
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/composed-biomes`);
 const result=await page.evaluate(async({definition,sources})=>{
  const {prepareComposedResidentFamily}=await import('/character-composed-family.js'),{drawResidentAnimation}=await import('/resident-animation.js'),{paintResidentShadow}=await import('/resident-ground-shadow.js'),{unlitFilter}=await import('/power.js'),{default:init,Game}=await import('/pkg/solar_friends.js'),{loadEditorArt}=await import('/editor/map-view.js'),{project}=await import('/projection.js'),{paintTerrain,soilAppearance}=await import('/terrain.js'),{paintWorldGround,paintWorldTree,paintWorldBuilding}=await import('/world-renderer.js');
  await init();const loaded={};for(const [id,s]of Object.entries(sources)){const image=new Image();image.src='data:image/png;base64,'+s.data;await image.decode();loaded[id]={image,sourceHash:s.sourceHash};}
  const art=await loadEditorArt(),game=new Game(),bundles=[],images=[],scratch=document.createElement('canvas');scratch.width=scratch.height=256;
  try{
   const original=await Promise.all(['iara','bento'].map(preset=>art.appearances.prepare({preset,version:1})));
   for(const [i,hair]of ['side-part-v1','short-curls-v1'].entries())bundles.push(await prepareComposedResidentFamily({definition,sources:loaded,recipe:{schema:3,family:definition.id,hair,hairColour:i?'silver':'chestnut',hat:i?'none':'straw-v1',facialHair:i?'none':'short-beard-v1',facialHairColour:'chestnut',materials:{skin:i?'copper':'warm',shirt:i?'cream':'teal',shorts:'sage',shoes:'graphite'}}}));
   for(const biome of ['mata-atlantica','cerrado','caatinga']){
    const draft=JSON.parse(game.scenario_template('sandbox'));draft.map=JSON.parse(game.generate_biome_property(biome,42));draft.start.buildings.push({id:'composed-review-home',kind:'home',x:28,y:34,state:'completed',recipe:'standard',appearance:null});draft.start.roads.push([30,34],[31,34],[32,34],[33,34],[34,34]);const checked=JSON.parse(game.load_scenario(JSON.stringify(draft)));if(!checked.ok)throw Error(JSON.stringify(checked));
    const land=JSON.parse(game.report_state()).village.land,ground=paintTerrain(art.terrain,draft.start.roads,[],soilAppearance(land.soil),land.seed,draft.map);
    try{for(const night of [0,1]){
     const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=640;const ctx=canvas.getContext('2d'),scale=1.5,a=project(32,33,{x:0,y:0},scale),origin={x:600-a.x,y:400-a.y},position=(x,y)=>project(x,y,origin,scale);ctx.fillStyle=night?'#233b47':'#dfe6c9';ctx.fillRect(0,0,1200,640);ctx.save();ctx.filter=unlitFilter(night);paintWorldGround(ctx,ground,origin,scale);ctx.restore();
     const objects=land.vegetation.filter(t=>!t.cleared).map(tree=>({depth:tree.x+tree.y,draw:()=>paintWorldTree(ctx,tree,{project:position,scale,width:1200,height:640,forest:art.forest,details:art.details,night})}));
     for(const b of draft.start.buildings)objects.push({depth:b.x+b.y,draw:()=>paintWorldBuilding(ctx,{key:b.kind,x:b.x,y:b.y},{project:position,scale,images:art.images,night,light:0})});
     const people=[{provider:original[0],sheet:'base',index:8,label:'Iara'}, {provider:bundles[0].provider,sheet:'base',index:8,label:'Composed / standing'}, {provider:original[1],sheet:'base',index:8,label:'Bento'}, {provider:bundles[1].provider,sheet:'base',index:6,label:'Composed / work'}, {provider:bundles[0].provider,sheet:'activities',index:0,label:'Composed / cooking'}];
     for(const [i,p]of people.entries()){const x=29.8+i*1.5,y=33;objects.push({depth:x+y+.6,draw:()=>{const at=position(x,y),animation={layers:[{sheet:p.sheet,row:Math.floor(p.index/4),frame:p.index%4,weight:1}],facing:night?-1:1,breath:1};paintResidentShadow(ctx,p.provider,animation,at.x,at.y,48*scale,{rx:48*scale*.24,ry:48*scale*.065,opacity:.18});ctx.save();ctx.filter=unlitFilter(night);drawResidentAnimation(ctx,scratch,p.provider,animation,at.x,at.y,48*scale);ctx.restore();}});}
     objects.sort((a,b)=>a.depth-b.depth).forEach(o=>o.draw());ctx.fillStyle='#f5e5ba';ctx.fillRect(8,8,1184,48);ctx.fillStyle='#483a27';ctx.font='15px monospace';ctx.fillText(`${biome} / ${night?'mirrored night':'day'} / native resident width 48 × camera zoom 1.5`,16,28);ctx.fillText('Order: Iara · composed standing · Bento · composed working · composed cooking',16,48);images.push({biome,night,data:canvas.toDataURL('image/png').split(',')[1]});canvas.width=canvas.height=0;
    }}finally{ground.width=ground.height=0;}
   }return {images,biomes:3,views:6,originalCast:2,composedAppearances:2};
  }finally{for(const b of bundles)b.dispose();await art.appearances.dispose();game.free();scratch.width=scratch.height=0;}
 },{definition,sources});assert.deepEqual(errors,[]);const outputs={};for(const im of result.images){const p=`${root}/composed-world-v8-${im.biome}-${im.night?'night':'day'}.png`;await writeFile(p,Buffer.from(im.data,'base64'));outputs[p]=hash(await readFile(p));}delete result.images;const inputs={};for(const p of ['scripts/review-composed-resident-biomes.mjs',`${root}/composed-family-draft-v8.json`,'web/character-composed-family.js','web/resident-animation.js','web/world-renderer.js','web/terrain.js','web/nature-art.js','web/building-art.js'])inputs[p]=hash(await readFile(p));await writeFile(`${root}/composed-world-review-v8.json`,JSON.stringify({status:'Captured; visual review pending; no public enrollment',...result,errors,inputs,outputs},null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
