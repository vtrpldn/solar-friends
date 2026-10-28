// Differential experiment: preserve every decoded source channel, including edges.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const output=process.argv[2]??'/tmp/solar-clothing-colour-surfaces';await mkdir(output,{recursive:true});
const baseline=execFileSync('git',['show','c1dfccf:web/character-clothing-colour.js']),candidatePath=process.argv.includes('--canvas')||process.argv.includes('--bitmap')?'assets/art-direction/character-prototype-v1/runtime-colour-surface-experiments-v1/retained-canvas-v1.js':'web/character-clothing-colour.js',candidateBytes=await readFile(candidatePath);
let candidate=candidateBytes;if(process.argv.includes('--bitmap'))candidate=Buffer.from(candidate.toString().replace('let canvas=null;','let canvas=null,bitmap=null;').replace('await new Promise(resolve=>setTimeout(resolve,0));','bitmap=await createImageBitmap(canvas);canvas.width=canvas.height=0;canvas=null;await new Promise(resolve=>setTimeout(resolve,0));').replace('if(state.canvas)state.canvas.width=state.canvas.height=0;','if(state.canvas)state.canvas.width=state.canvas.height=0;if(state.bitmap)state.bitmap.close();').replace('image:canvas??image,canvas,disposed:false','image:bitmap??canvas??image,canvas,bitmap,disposed:false').replace('catch(error){if(canvas)','catch(error){bitmap?.close();if(canvas)'));
const server=await serve(0,{handle(req,res,path){const bytes=path==='/character-clothing-colour.js'?baseline:path==='/candidate-clothing-colour.js'?candidate:null;if(!bytes)return false;res.writeHead(200,{'Content-Type':'text/javascript'}).end(bytes);return true;}});let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('http://127.0.0.1:'+server.address().port+'/colour-surface-experiment');
 const result=await page.evaluate(async()=>{
  const {loadBundledShirtDefinition}=await import('/character-shirt-bundle.js'),{loadCharacterImageSource}=await import('/character-image-source.js'),{prepareClothingColourSource,clothingColourImage,tintClothingPixels}=await import('/character-clothing-colour.js');
  const next=await import('/candidate-clothing-colour.js');
  const bundle=await loadBundledShirtDefinition();let comparisons=0,channels=0,mismatches=0,scaledMismatches=0,scaledComparisons=0,scaledChannels=0,oldMs=0,canvasMs=0;const first=[];
  for(const spec of Object.values(bundle.sources)){
   const source=await loadCharacterImageSource(spec.url);if(source.sourceHash!==spec.sha256)throw Error('Changed experiment source');
   for(const colour of ['teal','terracotta','indigo']){
    let token,candidateToken;const surfaces=[];try{
     const start=performance.now();token=await prepareClothingColourSource({...source,colour});oldMs+=performance.now()-start;
     const a=document.createElement('canvas'),b=document.createElement('canvas');surfaces.push(a,b);for(const c of surfaces)c.width=c.height=1254;
     a.getContext('2d').drawImage(clothingColourImage(token,source.image,source.sourceHash),0,0);
     const begin=performance.now(),ctx=b.getContext('2d');candidateToken=await next.prepareClothingColourSource({...source,colour});ctx.drawImage(next.clothingColourImage(candidateToken,source.image,source.sourceHash),0,0);canvasMs+=performance.now()-begin;
     const expected=a.getContext('2d').getImageData(0,0,1254,1254).data,actual=ctx.getImageData(0,0,1254,1254).data;
     for(let i=0;i<expected.length;i++){if(expected[i]!==actual[i]){mismatches++;if(first.length<8)first.push({url:spec.url,colour,offset:i,expected:expected[i],actual:actual[i]});}}channels+=expected.length;comparisons++;
     for(const garment of bundle.garments.filter(g=>bundle.sources[g.file].sha256===source.sourceHash)){
      const c=document.createElement('canvas'),d=document.createElement('canvas');surfaces.push(c,d);c.width=c.height=d.width=d.height=256;
      c.getContext('2d').drawImage(clothingColourImage(token,source.image,source.sourceHash),...garment.registration.source.rect,...garment.registration.crop);
      d.getContext('2d').drawImage(next.clothingColourImage(candidateToken,source.image,source.sourceHash),...garment.registration.source.rect,...garment.registration.crop);
      const x=c.getContext('2d').getImageData(0,0,256,256).data,y=d.getContext('2d').getImageData(0,0,256,256).data;
      for(let i=0;i<x.length;i++)if(x[i]!==y[i])scaledMismatches++;scaledComparisons++;scaledChannels+=x.length;
     }
    }finally{token?.dispose();candidateToken?.dispose();for(const canvas of surfaces)canvas.width=canvas.height=0;}
   }
  }
  return {comparisons,channels,mismatches,scaledMismatches,scaledComparisons,scaledChannels,first,oldMs,canvasMs};
 });assert.deepEqual(errors,[]);assert.equal(result.comparisons,123);assert.equal(result.scaledComparisons,144);
 result.candidate={strategy:process.argv.includes('--bitmap')?'image-bitmap':process.argv.includes('--canvas')?'retained-canvas':'production',servedSha256:createHash('sha256').update(candidate).digest('hex')};result.baseline={commit:'c1dfccf',sha256:createHash('sha256').update(baseline).digest('hex')};result.inputs={};for(const file of [candidatePath,'web/art/characters/relaxed-shirt-v1/bundle-v1.json','scripts/compare-clothing-colour-surfaces.mjs'])result.inputs[file]=createHash('sha256').update(await readFile(file)).digest('hex');
 result.scope='Differential experiment against existing PNG-decoded colour path for every installed shirt source, native registered crop, and three non-cream palettes; timing is sequential microbenchmark, not public loading or total memory acceptance.';
 await writeFile(output+'/report.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));assert.equal(result.mismatches,0,'Colour surface differs from PNG-decoded source');assert.equal(result.scaledMismatches,0,'Native crop resampling differs from PNG-decoded source');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
