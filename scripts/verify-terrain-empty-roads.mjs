import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';

// Keep the comparison pinned: HEAD moves after this change is committed.
const baselineRevision='3216078';
const baseline=execFileSync('git',['show',`${baselineRevision}:web/terrain.js`],{encoding:'utf8'});
const output=process.argv[2]??'/tmp/solar-terrain-empty-roads';
await mkdir(output,{recursive:true});
const server=await serve(0,{handle:(_req,res,url)=>{
 if(url!=='/terrain-before.js')return false;
 res.writeHead(200,{'Content-Type':'text/javascript'}).end(baseline);return true;
}});let browser;
try{
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/editor.html`);
 await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
 const result=await page.evaluate(async()=>{
  const before=await import('/terrain-before.js'),after=await import('/terrain.js');
  const {loadEditorArt}=await import('/editor/map-view.js'),{Game}=await import('/pkg/solar_friends.js');
  const art=await loadEditorArt(),game=new Game(),cases=[],board=document.createElement('canvas');board.width=900;board.height=300;const boardContext=board.getContext('2d');
  const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
  try{
   for(const biome of ['mata-atlantica','cerrado','caatinga']){
    const map=JSON.parse(game.generate_biome_property(biome,42));
    let emptyPixels;
    for(const roads of [[],[[30,30],[31,30],[32,30]]]){
     const samples=[],hashes={before:[],after:[]};let roadPixels;
     // Alternate order to reduce systematic warm-up bias. Readback includes
     // deferred canvas painting, rather than timing only queued draw commands.
     for(let run=0;run<3;run++){
      const pair={};
      for(const [name,module] of run%2?[['after',after],['before',before]]:[['before',before],['after',after]]){
       const original=document.createElement.bind(document);let allocations=0;
       document.createElement=function(tag,...args){if(tag==='canvas')allocations++;return original(tag,...args);};
       let canvas,bytes;const start=performance.now();
       try{canvas=module.paintTerrain(art.terrain,roads,[{x:0,y:10}],[[30,30,.4,.2,.5]],42,map);bytes=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;}
       finally{document.createElement=original;}
       const ms=performance.now()-start,hash=await digest(bytes);
       if(name==='after'&&run===0&&roads.length){const unit=4096/69;boardContext.drawImage(canvas,29*unit,29*unit,8*unit,8*unit,cases.length/2*300-150,0,300,300);}
       canvas.width=canvas.height=0;
       pair[name]={ms,allocations};hashes[name].push(hash);
       if(name==='after'&&run===0){if(!roads.length)emptyPixels=bytes;else roadPixels=bytes;}
      }
      samples.push(pair);
     }
     if(new Set(hashes.before).size!==1||new Set(hashes.after).size!==1)throw Error('Nondeterministic terrain');
     let changedPixels=0;
     if(!roads.length){if(hashes.before[0]!==hashes.after[0])throw Error('Unbuilt terrain pixels changed: '+biome);}
     else{
      if(hashes.before[0]===hashes.after[0])throw Error('Roads are still invisible: '+biome);
      const unit=4096/69;
      for(let y=0;y<4096;y++)for(let x=0;x<4096;x++){
       const i=(y*4096+x)*4;if(![0,1,2,3].some(c=>emptyPixels[i+c]!==roadPixels[i+c]))continue;
       changedPixels++;
       // Include the single antialiased edge pixel around a cell boundary.
       if(!roads.some(([rx,ry])=>Math.abs(x-(rx+2.5)*unit)<=unit/2+1&&Math.abs(y-(ry+2.5)*unit)<=unit/2+1))throw Error('Road changed pixels outside its cells');
      }
      if(changedPixels<unit*unit*2)throw Error('Road coverage unexpectedly sparse');
     }
     for(const pair of samples){if(pair.before.allocations!==3||pair.after.allocations!==(roads.length?3:2))throw Error('Unexpected scratch allocation count');}
     cases.push({biome,roads:roads.length,beforePixelHash:hashes.before[0],afterPixelHash:hashes.after[0],changedPixels,samples});
    }
   }
   return {cases,image:board.toDataURL(),scope:'Three alternating samples per biome/road case, full 4096-square pixel readback. Includes resource-edge mask and soil. Not sustained gameplay or total memory acceptance.'};
  }finally{game.free();}
 });
 assert.deepEqual(errors,[]);assert.equal(result.cases.length,6);
 await writeFile(output+'/roads.png',Buffer.from(result.image.split(',')[1],'base64'));delete result.image;
 result.baselineRevision=baselineRevision;
 result.sourceHashes={before:createHash('sha256').update(baseline).digest('hex'),after:createHash('sha256').update(await readFile('web/terrain.js')).digest('hex')};
 await writeFile(output+'/report.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
