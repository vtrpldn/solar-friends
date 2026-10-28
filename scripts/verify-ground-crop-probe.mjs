// Experimental draw optimization. Production remains unchanged unless exact
// raster comparisons and isolated timing measurements justify promotion.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const output='artifacts/ground-crop-probe';await mkdir(output,{recursive:true});
const baselineCommit='7f91902',source=execFileSync('git',['show',baselineCommit+':web/world-renderer.js'],{encoding:'utf8'}),production=process.argv.includes('--production');
const start=source.indexOf('export function paintWorldGround('),end=source.indexOf('export function paintContactShadow(',start);
assert(start>=0&&end>start);
const replacement=`export function paintWorldGround(ctx,ground,origin,scale){
 ctx.save();
 try{
  ctx.transform(TILE_HALF_WIDTH*scale,TILE_HALF_HEIGHT*scale,-TILE_HALF_WIDTH*scale,TILE_HALF_HEIGHT*scale,origin.x,origin.y);
  const inverse=ctx.getTransform().inverse(),corners=[[0,0],[ctx.canvas.width,0],[0,ctx.canvas.height],[ctx.canvas.width,ctx.canvas.height]].map(([x,y])=>inverse.transformPoint({x,y}));
  const unitX=ground.width/GROUND_SIZE,unitY=ground.height/GROUND_SIZE;
  const left=Math.max(0,Math.floor((Math.min(...corners.map(p=>p.x))-GROUND_START)*unitX)-4);
  const top=Math.max(0,Math.floor((Math.min(...corners.map(p=>p.y))-GROUND_START)*unitY)-4);
  const right=Math.min(ground.width,Math.ceil((Math.max(...corners.map(p=>p.x))-GROUND_START)*unitX)+4);
  const bottom=Math.min(ground.height,Math.ceil((Math.max(...corners.map(p=>p.y))-GROUND_START)*unitY)+4);
  if(right>left&&bottom>top)ctx.drawImage(ground,left,top,right-left,bottom-top,GROUND_START+left/unitX,GROUND_START+top/unitY,(right-left)/unitX,(bottom-top)/unitY);
 }finally{ctx.restore();}
}
`;
const candidate=production?await readFile('web/world-renderer.js','utf8'):source.slice(0,start)+replacement+source.slice(end),sha=b=>createHash('sha256').update(b).digest('hex');
await writeFile(output+'/candidate-world-renderer.js',candidate);
const server=await serve(0,{handle(_req,res,path){
 if(path==='/candidate-world-renderer.js'){res.writeHead(200,{'Content-Type':'text/javascript'}).end(candidate);return true;}
 if(path==='/baseline-world-renderer.js'){res.writeHead(200,{'Content-Type':'text/javascript'}).end(source);return true;}
 if(path==='/ground-crop-probe'){res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><title>Ground raster comparison</title>');return true;}
 return false;
}});let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/ground-crop-probe`);
 const results=await page.evaluate(async()=>{
  const {default:init,Game}=await import('/pkg/solar_friends.js');await init();
  const {paintTerrain}=await import('/terrain.js'),{loadRegionalArt}=await import('/regional-art.js'),baseline=await import('/baseline-world-renderer.js'),candidate=await import('/candidate-world-renderer.js');
  await loadRegionalArt();const texture=new Image();texture.src='/art/terrain-atlas.png';await texture.decode();
  const game=new Game(),results=[];
  try{
   for(const biome of ['mata-atlantica','cerrado','caatinga']){
    const map=JSON.parse(game.generate_biome_property(biome,42)),ground=paintTerrain(texture,[[30,30],[30,31]],[],[],42,map);
    for(const dpr of [1,2])for(const [scale,panX,panY]of [[.6,0,0],[1.3,0,0],[1.8,430,-210],[.25,-600,370]])for(const filter of ['none','brightness(.5) saturate(.6)']){
     const canvases=[document.createElement('canvas'),document.createElement('canvas')],contexts=canvases.map(c=>{c.width=960*dpr;c.height=640*dpr;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.setTransform(dpr,0,0,dpr,0,0);ctx.filter=filter;return ctx;});
     const origin={x:480+panX,y:320-63*17*scale+panY};
     baseline.paintWorldGround(contexts[0],ground,origin,scale);candidate.paintWorldGround(contexts[1],ground,origin,scale);
     const pixels=contexts.map(ctx=>ctx.getImageData(0,0,ctx.canvas.width,ctx.canvas.height).data);let differences=0,maxDelta=0;
     for(let i=0;i<pixels[0].length;i++)if(pixels[0][i]!==pixels[1][i]){differences++;maxDelta=Math.max(maxDelta,Math.abs(pixels[0][i]-pixels[1][i]));}
     results.push({biome,dpr,scale,panX,panY,filter,differences,maxDelta});
     for(const c of canvases)c.width=c.height=0;
    }
    ground.width=ground.height=0;
   }
  }finally{game.free();}
  return results;
 });
 const report={baselineCommit,production,baselineSha256:sha(source),candidateSha256:sha(candidate),browser:browser.version(),exact:results.every(r=>r.differences===0),cases:results,scope:'Viewport source cropping against frozen pre-optimization rendering, real terrain in all three biomes, four camera poses, DPR 1/2 and two filters. Does not establish runtime performance.'};
 await writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({exact:report.exact,cases:results.length,mismatches:results.filter(r=>r.differences).map(r=>({biome:r.biome,dpr:r.dpr,scale:r.scale,differences:r.differences,maxDelta:r.maxDelta}))}));
 assert.equal(report.exact,true,'Terrain pixels must match the frozen renderer');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
