import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const html=`<!doctype html><html><body style="margin:0"><script type="importmap">{"imports":{"three":"/v2/workshop/vendor/three.module.js"}}</script><script type="module">
import * as THREE from 'three';
import {createCultivationModel} from '/v2/cultivation-models.js';
const p={id:1,key:'garden',x:50,z:50,cultivation:{beds:Array.from({length:100},(_,i)=>({id:i,x:(i%10)*2-10,z:Math.floor(i/10)*8-40,w:1.2,d:25/Math.sqrt(12),stage:'harvestable',crop:'greens',density:1,growth:1,moisture:.75,cover:0,elapsed:1,stress:0}))}};
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(1440,900);document.body.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#bccca0');scene.add(new THREE.HemisphereLight('#fff6d5','#625742',2));
const camera=new THREE.PerspectiveCamera(50,1440/900,.1,300);camera.position.set(40,65,65);camera.lookAt(0,0,0);
const model=createCultivationModel(p,{operations:[]});scene.add(model);
const crops=model.children.filter(m=>m.geometry?.type==='IcosahedronGeometry');
window.runBenchmark=async()=>{
 const sample=async visible=>{crops.forEach(m=>m.visible=visible);for(let i=0;i<10;i++)renderer.render(scene,camera);let cpu=0;const start=performance.now();for(let i=0;i<60;i++){await new Promise(requestAnimationFrame);const before=performance.now();renderer.render(scene,camera);renderer.getContext().finish();cpu+=performance.now()-before;}return {frameMs:(performance.now()-start)/60,cpuRenderMs:cpu/60,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,heapBytes:performance.memory?.usedJSHeapSize||null};};
 return {beds:100,plants:crops.reduce((n,m)=>n+m.count/3,0),withoutCrops:await sample(false),withCrops:await sample(true)};
};
</script></body></html>`;
const server=await serve(0,{handle(req,res,path){if(path!=='/farm-benchmark')return false;res.writeHead(200,{'Content-Type':'text/html'}).end(html);return true;}}),browser=await chromium.launch({headless:true});
try{const page=await browser.newPage({viewport:{width:1440,height:900}});await page.goto(`http://127.0.0.1:${server.address().port}/farm-benchmark`);await page.waitForFunction(()=>!!window.runBenchmark);const result=await page.evaluate(()=>window.runBenchmark());assert.equal(result.plants,10000);assert(result.withCrops.drawCalls-result.withoutCrops.drawCalls<=3);const out=process.env.FARM_BENCHMARK||'/tmp/farming-benchmark.json';await writeFile(out,JSON.stringify(result,null,2));console.log(JSON.stringify(result));}finally{await browser.close();server.close();}
