import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {buildShedModel,projectPoint,shedCamera,shedDimensions} from './art-models/shed.js';
const model=buildShedModel();
assert(model.faces.length>1000);
assert(model.faces.every(f=>f.points.flat().every(Number.isFinite)&&f.normal.every(Number.isFinite)));
for(const key of ['ridge','nearEave','farEave']){
 const [a,b]=model.features[key].map(p=>projectPoint(p));assert(Math.abs((b[1]-a[1])/(b[0]-a[0])-.5)<1e-12);
}
const [a,b]=model.features.frontBeam.map(p=>projectPoint(p)),peak=projectPoint(model.features.frontPeak);
assert(Math.abs((b[1]-a[1])/(b[0]-a[0])+.5)<1e-12);assert.equal(peak[0],(a[0]+b[0])/2);
const source=await readFile(new URL('./art-models/shed.js',import.meta.url)),atlas=await readFile(new URL('../assets/art-direction/isometric/materials/building-materials.png',import.meta.url)),plants=await readFile(new URL('../web/art/landscape-details.png',import.meta.url));
const html=`<!doctype html><html><head><link rel="icon" href="data:,"><style>body{margin:0;background:#e3e8d3}canvas{display:block;width:640px;height:640px}</style></head><body><canvas id="model" width="1280" height="1280"></canvas><script type="module">import {renderShed} from './shed.js';const atlas=new Image();atlas.src='./materials.png';await atlas.decode();const plants=new Image();plants.src='./plants.png';await plants.decode();const canvas=document.querySelector('canvas');renderShed(canvas.getContext('2d'),atlas,undefined,undefined,{plants});window.modelOutput={day:canvas.toDataURL('image/png').split(',')[1]};renderShed(canvas.getContext('2d'),atlas,undefined,undefined,{night:true,plants});window.modelOutput.night=canvas.toDataURL('image/png').split(',')[1];window.modelReady=true;</script></body></html>`;
const server=await serve(0,{handle(req,res,url){const value={'/__shed-model/':html,'/__shed-model/shed.js':source,'/__shed-model/materials.png':atlas,'/__shed-model/plants.png':plants}[url];if(!value)return false;res.writeHead(200,{'Content-Type':url.endsWith('.js')?'text/javascript':url.endsWith('.png')?'image/png':'text/html'}).end(value);return true;}}),browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1000,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/__shed-model/`);await page.waitForFunction(()=>window.modelReady);
 assert.deepEqual(errors,[]);const data=await page.evaluate(()=>window.modelOutput);
 const output=new URL('../artifacts/isometric/',import.meta.url);await mkdir(output,{recursive:true});
 await writeFile(new URL('shed-authored.png',output),Buffer.from(data.day,'base64'));
 await writeFile(new URL('shed-authored-night.png',output),Buffer.from(data.night,'base64'));
 await writeFile(new URL('shed-authored-geometry.json',output),JSON.stringify({camera:shedCamera,dimensions:shedDimensions,faces:model.faces.length,features:model.features,feet:model.feet,visualStatus:'Unreviewed prototype; mathematical geometry checks do not certify style.'},null,2)+'\n');
 console.log(`Rendered ${model.faces.length} rigid faces. Roof axes, four feet and centered front gable share one camera. Style review pending: artifacts/isometric/shed-authored.png`);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
