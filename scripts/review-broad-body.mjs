// Candidate-only review. No public recipe, bundle or saved person is changed.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';

const root='assets/art-direction/character-prototype-v1/body-broad-v1';
const seated=process.argv.includes('--seated');
const revision=seated?'seated-v1':process.argv.includes('--v3')?'v3':process.argv.includes('--v2')?'v2':'v1';
const files={candidate:root+'/'+(seated?'seated-candidate-v1':'base-candidate-'+revision)+'.png',reference:'web/art/characters/prototype-v1/body-neutral-base.png'};
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
 const result=await page.evaluate(async({sources,seated})=>{
  const {locateSpriteFrames,preparedFrames,RESIDENT_WIDTH}=await import('/sprite-frames.js');
  const {prepareRegisteredBodyFrames}=await import('/character-body-frames.js');
  const {drawResidentAnimation,sampleResidentClip}=await import('/resident-animation.js');
  const {unlitFilter}=await import('/power.js');
  const images={},frames={},measurements={};let registration=null;
  for(const [key,source]of Object.entries(sources)){
   const image=new Image();image.src='data:image/png;base64,'+source.data;await image.decode();images[key]=image;
   const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
   const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
   const smaller=seated&&key==='candidate',columns=smaller?2:4,rows=columns;
   const layout=locateSpriteFrames(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height,columns,rows,smaller?0:2);
   measurements[key]={width:canvas.width,height:canvas.height,uniformScale:layout.scale*256,poses:layout.frames.map(f=>({bounds:[f.left,f.top,f.right,f.bottom],pivot:f.pivot,area:f.area,sourceClipped:f.left<2||f.top<2||f.right>canvas.width-2||f.bottom>canvas.height-2}))};
   if(smaller){
    registration={schema:1,family:'broad-body-prototype-v1',sheet:'base',source:{sha256:source.sha256,width:canvas.width,height:canvas.height,columns,rows},uniformScale:.38,frames:[[350,410],[950,445],[370,990],[985,1000]].map((waist,index)=>({index,waist}))};
    frames[key]=prepareRegisteredBodyFrames({image,sourceHash:source.sha256},registration);
   }else frames[key]=preparedFrames(image,{referenceRow:2});canvas.width=canvas.height=0;
  }
  const normalized=[];
  for(const [index,frame]of frames.candidate.entries()){
   const rgba=frame.getContext('2d').getImageData(0,0,256,256).data;
   const digest=await crypto.subtle.digest('SHA-256',rgba);
   normalized.push({index,sha256:[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('')});
  }
  const board=document.createElement('canvas');board.width=2048;board.height=seated?256:1024;const b=board.getContext('2d');
  b.fillStyle='#e8dfbf';b.fillRect(0,0,board.width,board.height);
  for(let index=0;index<(seated?4:16);index++){
   const x=index%4*512,y=Math.floor(index/4)*256;
   for(const [column,key]of ['reference','candidate'].entries())b.drawImage(frames[key][index+(seated&&key==='reference'?12:0)],x+column*256,y-8);
   b.fillStyle='#483a27';b.font='12px monospace';b.fillText(`base:${index+(seated?12:0)} original / broader candidate`,x+8,y+250);
  }
  const {default:init,Game}=await import('/pkg/solar_friends.js');await init();
  const {loadEditorArt}=await import('/editor/map-view.js');
  const {project}=await import('/projection.js');
  const {paintTerrain,soilAppearance}=await import('/terrain.js');
  const {paintWorldGround,paintWorldTree,paintWorldBuilding,paintContactShadow}=await import('/world-renderer.js');
  const art=await loadEditorArt(),game=new Game(),worldImages=[];
  const canvas=document.createElement('canvas');canvas.width=900;canvas.height=420;const ctx=canvas.getContext('2d');
  const scratch=document.createElement('canvas');scratch.width=scratch.height=256;
  const providers=['reference','candidate'].map(key=>({animationProfile:'neutral-v1',interpolation:'keyframes',frameForPose(sheet,index){if(sheet!=='base')throw Error('Candidate has no other body sheets');if(seated&&key==='candidate'){if(index<12||index>15)throw Error('Only seated prototype poses exist');return frames[key][index-12];}return frames[key][index];}}));
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
     for(const [i,clip]of (seated?['seated:0','seated:1','seated:2','seated:3']:['breathe','work','sit','walk']).entries()){
      const scale=1.3,anchor=project(30,33,{x:0,y:0},scale),origin={x:440-anchor.x,y:315-anchor.y},position=(x,y)=>project(x,y,origin,scale);
      ctx.fillStyle=night?'#263c4b':'#dfe6c9';ctx.fillRect(0,0,900,420);ctx.save();ctx.filter=unlitFilter(night);paintWorldGround(ctx,ground,origin,scale);ctx.restore();
      const objects=land.vegetation.filter(t=>!t.cleared).map(tree=>({depth:tree.x+tree.y,draw:()=>paintWorldTree(ctx,tree,{project:position,scale,width:900,height:420,forest:art.forest,details:art.details,night})}));
      for(const building of definition.start.buildings)objects.push({depth:building.x+building.y,draw:()=>paintWorldBuilding(ctx,{key:building.kind,x:building.x,y:building.y},{project:position,scale,images:art.images,night,light:0})});
      for(const [provider,x]of [[{base:art.residents[1]},30.5],[providers[0],32],[providers[1],33.5]])objects.push({depth:x+33+.6,draw:()=>{
       const p=position(x,33);paintContactShadow(ctx,p.x,p.y,10*scale,4*scale,.22);ctx.save();ctx.filter=unlitFilter(night);
       const layers=seated?[{sheet:'base',row:3,frame:i,weight:1}]:sampleResidentClip(clip,.15,provider.animationProfile);
       drawResidentAnimation(ctx,scratch,provider,{layers,facing:night?-1:1,breath:1},p.x,p.y,RESIDENT_WIDTH*scale);ctx.restore();
      }});
      objects.sort((a,b)=>a.depth-b.depth).forEach(o=>o.draw());ctx.fillStyle='#f5e5ba';ctx.fillRect(8,8,820,24);ctx.fillStyle='#483a27';ctx.font='12px monospace';ctx.fillText(`${biome} · ${clip} · ${night?'mirror/night':'day'} · Bento / original body / broad candidate`,16,25);
      v.drawImage(canvas,i%2*900,Math.floor(i/2)*420);
     }
     worldImages.push({biome,night,data:view.toDataURL('image/png').split(',')[1]});view.width=view.height=0;
    }}finally{ground.width=ground.height=0;}
   }
  }finally{game.free();scratch.width=scratch.height=0;}
  return {measurements,registration,normalized,board:board.toDataURL('image/png').split(',')[1],worldImages,scope:seated?'Internal separately authored four-pose seated candidate with one measured uniform transform. Four normalized comparisons and 24 static world views in three biomes, day and mirrored night. Closed-eye sitting is not a sleeping pose. No complete family, attachment, motion or public appearance acceptance.':'Internal base-sheet body candidate only. Sixteen normalized pose comparisons and 24 static world views using four base-sheet clips in three biomes, day and mirrored night. No complete gait, sleep, hair, clothing fit, full animation or public appearance acceptance.'};
 },{sources,seated});
 assert.deepEqual(errors,[]);
 for(const [key,measurement]of Object.entries(result.measurements))assert.equal(measurement.poses.length,seated&&key==='candidate'?4:16);
 await writeFile(root+'/base-comparison-'+revision+'.png',Buffer.from(result.board,'base64'));delete result.board;
 for(const row of result.worldImages){
  if(seated){row.path=root+'/world/'+row.biome+'-'+(row.night?'night':'day')+'-'+revision+'.png';await writeFile(row.path,Buffer.from(row.data,'base64'));}
  delete row.data;
 }
 result.sources=Object.fromEntries(Object.entries(sources).map(([key,{path,sha256}])=>[key,{path,sha256}]));
 result.scriptSha256=createHash('sha256').update(await readFile('scripts/review-broad-body.mjs')).digest('hex');
 result.candidateEdgeClear=result.measurements.candidate.poses.every(p=>!p.sourceClipped);
 await writeFile(root+'/base-review-'+revision+'.json',JSON.stringify(result,null,2)+'\n');
 assert(result.candidateEdgeClear,'Painted candidate body clipped at image edge');
 if(seated)await writeFile(root+'/seated-registration-v1.json',JSON.stringify(result.registration,null,2)+'\n');
 console.log(JSON.stringify({poses:seated?4:16,worldViews:24,sources:result.sources,scope:result.scope}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
