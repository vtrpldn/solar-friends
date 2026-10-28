import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const output='artifacts/world-backdrop';await mkdir(output,{recursive:true});
const baseline=execFileSync('git',['show','7f91902:web/world-renderer.js'],{encoding:'utf8'}),module=await readFile('web/world-backdrop.js');
const server=await serve(0,{handle(_req,res,path){
 if(path==='/baseline-world-renderer.js'){res.writeHead(200,{'Content-Type':'text/javascript'}).end(baseline);return true;}
 if(path==='/world-backdrop-check'){res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><title>Ground backdrop comparison</title>');return true;}
 return false;
}});let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/world-backdrop-check`);
 const result=await page.evaluate(async()=>{
  const {default:init,Game}=await import('/pkg/solar_friends.js');await init();
  const {paintTerrain}=await import('/terrain.js'),{loadRegionalArt}=await import('/regional-art.js'),{paintWorldGround}=await import('/baseline-world-renderer.js'),{createWorldBackdrop}=await import('/world-backdrop.js');
  await loadRegionalArt();const texture=new Image();texture.src='/art/terrain-atlas.png';await texture.decode();const game=new Game(),cases=[];let hits=0;
  const compare=(a,b,label)=>{const aa=a.getImageData(0,0,a.canvas.width,a.canvas.height).data,bb=b.getImageData(0,0,b.canvas.width,b.canvas.height).data;for(let i=0;i<aa.length;i++)if(aa[i]!==bb[i])throw Error(`${label}: channel ${i} differs (${aa[i]} / ${bb[i]})`);};
  const fill=ctx=>{ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);ctx.fillStyle='#dfe6c9';ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);ctx.restore();};
  try{
   for(const biome of ['mata-atlantica','cerrado','caatinga']){
    const map=JSON.parse(game.generate_biome_property(biome,42)),ground=paintTerrain(texture,[[30,30],[30,31]],[],[],42,map);
    for(const dpr of [1,2]){
     const canvases=[document.createElement('canvas'),document.createElement('canvas')],contexts=canvases.map(c=>{c.width=960*dpr;c.height=640*dpr;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.setTransform(dpr,0,0,dpr,0,0);return ctx;}),cache=createWorldBackdrop(contexts[1],paintWorldGround);
     for(const [scale,panX,panY]of [[.6,0,0],[1.3,0,0],[1.8,430,-210],[.25,-600,370]])for(const filter of ['none','brightness(.5) saturate(.6)']){
      const origin={x:480+panX,y:320-63*17*scale+panY};for(const ctx of contexts){ctx.filter='none';fill(ctx);ctx.filter=filter;}
      paintWorldGround(contexts[0],ground,origin,scale);const used=cache.paint(ground,origin,scale);compare(...contexts,`${biome}/${dpr}/${scale}/${filter}`);
      if(filter==='none'&&!used)throw Error('Normal ground did not use the bounded cache');
      if(filter!=='none'&&used)throw Error('Filtered ground bypassed fallback');
      if(used){fill(contexts[1]);cache.paint(ground,origin,scale);compare(...contexts,'cached repeat');hits++;}
      cases.push({biome,dpr,scale,panX,panY,filter,used,exact:true});
     }
     contexts.forEach(ctx=>{ctx.filter='none';fill(ctx);});const origin={x:480,y:-200};
     cache.paint(ground,origin,1,'revision-one');const rebuilt=cache.info().rebuilds;cache.paint(ground,origin,1,'revision-two');if(cache.info().rebuilds!==rebuilt+1)throw Error('Explicit terrain revision did not invalidate');
     const edited=document.createElement('canvas');edited.width=edited.height=32;const paint=edited.getContext('2d');paint.fillStyle='#123456';paint.fillRect(0,0,32,32);
     cache.paint(edited,origin,1,1);paint.fillStyle='#aabbcc';paint.fillRect(0,0,32,32);
     for(const ctx of contexts)fill(ctx);paintWorldGround(contexts[0],edited,origin,1);cache.paint(edited,origin,1,2);compare(...contexts,'changed pixels at the same source identity');
     edited.width=edited.height=0;
     cache.clear();if(cache.info().bytes!==0||!ground.width)throw Error('Clear retained owned storage or erased borrowed terrain');
     cache.dispose();cache.dispose();let refused=false;try{cache.paint(ground,origin,1);}catch{refused=true;}if(!refused||cache.info().bytes!==0)throw Error('Closed backdrop accepted work');
     const bounded=createWorldBackdrop(contexts[1],paintWorldGround,{maxPixels:1});if(bounded.paint(ground,origin,1)||bounded.info().bytes!==0)throw Error('Oversized viewport allocated cache memory');bounded.dispose();
     let transparentRefused=false;try{createWorldBackdrop(contexts[1],paintWorldGround,{background:'#fff0'});}catch{transparentRefused=true;}if(!transparentRefused)throw Error('A translucent backdrop entered the opaque cache');
     for(const c of canvases)c.width=c.height=0;
    }
    ground.width=ground.height=0;
   }
  }finally{game.free();}
  return {cases,hits,revisionInvalidation:true,boundedFallback:true,clearAndDispose:true,borrowedTerrainPreserved:true};
 });
 const report={...result,baselineCommit:'7f91902',baselineSha256:createHash('sha256').update(baseline).digest('hex'),moduleSha256:createHash('sha256').update(module).digest('hex'),browser:browser.version(),scope:'Exact frozen ground pixels, cached repeats, camera/zoom/lighting changes, explicit terrain revision and bounded owner lifetime. Not full-frame integration or runtime performance.'};
 assert.equal(result.cases.length,48);assert.equal(result.hits,24);await writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');console.log('PASS: '+JSON.stringify({cases:result.cases.length,hits:result.hits,revisionInvalidation:true,boundedFallback:true,clearAndDispose:true}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
