import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';

const output=process.argv[2]??'artifacts/terrain-atlas-isolation';
await mkdir(output,{recursive:true});
const baseline=execFileSync('git',['show','015ef44:web/terrain.js']);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const server=await serve(0,{handle(_req,res,path){
 if(path==='/terrain-before.js'){res.writeHead(200,{'Content-Type':'text/javascript'}).end(baseline);return true;}
 if(path==='/atlas-isolation'){res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><title>Atlas isolation</title>');return true;}
 return false;
}});
let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/atlas-isolation`);
 const result=await page.evaluate(async()=>{
  const before=await import('/terrain-before.js'),after=await import('/terrain.js');
  const map={river:null,terrain:Array.from({length:4096},()=>({habitat:'flower-meadow'}))};
  const colors=['#ff0000','#00ff00','#0000ff','#ffff00'];
  const roads=Array.from({length:4096},(_,i)=>[i%64,Math.floor(i/64)]),cases=[];
  const surface=size=>new OffscreenCanvas(size,size);
  const domSurface=size=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=size;return canvas;};
  for(const workerSurface of [false,true])for(const rows of [1,2])for(let row=0;row<rows;row++)for(const road of [false,true]){
   const source=document.createElement('canvas');source.width=64;source.height=32*rows;
   const ctx=source.getContext('2d');for(let y=0;y<rows;y++)for(let x=0;x<2;x++){ctx.fillStyle=colors[y*2+x];ctx.fillRect(x*32,y*32,32,32);}
   const outputs={};
   for(const [name,module]of Object.entries({before,after})){
    const canvas=module.paintTerrain(source,road?roads:[],[],[],0,map,{surface:workerSurface?surface:domSurface,regional:rows===2?{image:source,row}:null});
    // The central area is fully opaque and inside authored meadow/road cells.
    const pixels=canvas.getContext('2d').getImageData(512,512,3000,3000).data;
    // Independent flat-color oracle: only the selected quadrant and the
    // established meadow tint may contribute. Roads receive no meadow tint.
    const reference=new OffscreenCanvas(1,1),referenceContext=reference.getContext('2d');
    referenceContext.fillStyle=colors[row*2+Number(road)];referenceContext.fillRect(0,0,1,1);
    if(!road){referenceContext.fillStyle='rgba(167,178,105,0.24)';referenceContext.fillRect(0,0,1,1);}
    const oracle=Array.from(referenceContext.getImageData(0,0,1,1).data);reference.width=reference.height=0;
    let mismatches=0,maxDelta=0;for(let i=0;i<pixels.length;i+=4){let different=false;for(let c=0;c<4;c++){const delta=Math.abs(pixels[i+c]-oracle[c]);maxDelta=Math.max(maxDelta,delta);different||=delta!==0;}if(different)mismatches++;}
    outputs[name]={mismatches,maxDelta,oracle};canvas.width=canvas.height=0;
   }
   source.width=source.height=0;cases.push({workerSurface,rows,row,road,...outputs});
  }
  return {cases};
 });
 assert.deepEqual(errors,[]);assert(result.cases.some(c=>c.before.mismatches>0),'Baseline must reproduce neighboring atlas contamination');
 for(const c of result.cases)assert.equal(c.after.mismatches,0,JSON.stringify(c));
 result.sourceHashes={baseline:sha(baseline),candidate:sha(await readFile('web/terrain.js')),script:sha(await readFile('scripts/verify-terrain-atlas-isolation.mjs'))};result.browserErrors=errors;result.complete=true;
 await writeFile(`${output}/report.json`,JSON.stringify(result,null,2)+'\n');console.log(`PASS isolated terrain/road atlas cells in ${result.cases.length} DOM/OffscreenCanvas cases; baseline reproduced contamination.`);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
