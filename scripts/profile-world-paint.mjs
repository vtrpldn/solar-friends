import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import init,{Game} from '../web/pkg/solar_friends.js';
import {mixedBuilderFixture} from './mixed-builder-fixture.mjs';
const output=process.argv[2]??'/tmp/solar-world-paint-profile';await mkdir(output,{recursive:true});
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const g=new Game(),template=JSON.parse(g.scenario_template('sandbox'));template.map=JSON.parse(g.generate_biome_property('mata-atlantica',42));const {definition,summary}=mixedBuilderFixture(g,template);
const softwareLight=process.argv.includes('--software-light'),noLightOcclusion=process.argv.includes('--no-light-occlusion'),unboundedLightMasks=process.argv.includes('--unbounded-light-masks');
assert(!(noLightOcclusion&&unboundedLightMasks),'Choose one lighting comparison mode');
let mainSource=(await readFile('web/main.js','utf8')).replace("lightLayer.getContext('2d')",softwareLight?"lightLayer.getContext('2d',{willReadFrequently:true})":"lightLayer.getContext('2d')");
if(noLightOcclusion||unboundedLightMasks){const original=mainSource;mainSource=mainSource.replace('depthLight.paint(o.occlude||o.draw,o.light,o.bounds);',noLightOcclusion?'o.light?.();':"ctx.save();ctx.globalCompositeOperation='destination-out';(o.occlude||o.draw)();ctx.restore();o.light?.();");assert.notEqual(mainSource,original,'Lighting override must match the actual render call');}
const server=await serve(0,{handle:async(_req,res,path)=>{if(path!=='/main.js')return false;res.writeHead(200,{'Content-Type':'text/javascript'}).end(mainSource+'\nwindow.__profilePaintFrame=()=>render();\n');return true;}}),browser=await chromium.launch({headless:true}),errors=[],phases=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.__paintTimings=null;const proto=CanvasRenderingContext2D.prototype;
  const record=(ctx,name,start)=>{const table=window.__paintTimings;if(!table)return;const size=ctx.canvas.width*ctx.canvas.height>500000?'world-sized':'sprite-sized',key=[ctx.canvas.id||size,name,ctx.globalCompositeOperation].join('/'),entry=table[key]??={calls:0,ms:0};entry.calls++;entry.ms+=performance.now()-start;};
  for(const name of ['drawImage','restore','fillRect','clearRect','getImageData','putImageData','createRadialGradient']){const native=proto[name];proto[name]=function(...args){if(!window.__paintTimings)return native.apply(this,args);const start=performance.now();try{return native.apply(this,args);}finally{record(this,name,start);}};}
  const filter=Object.getOwnPropertyDescriptor(proto,'filter');Object.defineProperty(proto,'filter',{...filter,set(value){if(!window.__paintTimings)return filter.set.call(this,value);const start=performance.now();try{return filter.set.call(this,value);}finally{record(this,'filter='+value,start);}}});
 });
 await page.goto(`http://127.0.0.1:${server.address().port}/?performance`);
 await page.waitForFunction(()=>window.solarDev&&document.querySelector('#main-menu').open);
 await page.locator('[data-new-mode=sandbox]').click();await page.waitForFunction(()=>!document.querySelector('#main-menu').open);await page.locator('#pause').click();
 for(const minutes of [600,1260]){
  definition.start.minutes=minutes;assert(JSON.parse(g.load_scenario(JSON.stringify(definition))).ok);await page.evaluate(raw=>window.solarDev.importSandbox(raw),g.snapshot());
  for(const repeat of [0]){
   await page.evaluate(()=>window.solarDev.fixedView());await page.waitForTimeout(500);
   const result=await page.evaluate(async()=>{window.__paintTimings={};const start=performance.now(),before=window.solarDev.snapshot().village.minutes,paints=[];await new Promise(resolve=>{const frame=()=>{const t=performance.now();window.__profilePaintFrame();paints.push(performance.now()-t);if(performance.now()-start>=5000)resolve();else requestAnimationFrame(frame);};requestAnimationFrame(frame);});const timings=window.__paintTimings;window.__paintTimings=null;paints.sort((a,b)=>a-b);return {wallMs:performance.now()-start,frames:paints.length,paint:{median:paints[Math.floor(paints.length*.5)],p95:paints[Math.floor(paints.length*.95)]},minutesBefore:before,minutesAfter:window.solarDev.snapshot().village.minutes,timings:Object.entries(timings).sort((a,b)=>b[1].ms-a[1].ms).map(([key,value])=>({key,...value}))};});
   assert.equal(result.minutesAfter,result.minutesBefore,'Profile must hold simulation state fixed');assert(result.frames>10&&result.timings.length>0,'Profile must exercise actual Canvas work');phases.push({minutes,repeat,softwareLight,noLightOcclusion,unboundedLightMasks,...result});
  }
 }
 assert.deepEqual(errors,[]);const sourceHashes=Object.fromEntries(await Promise.all(['web/main.js','web/night-lighting.js','web/paint-cache.js','web/world-visibility.js'].map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')])));
 await writeFile(output+'/report.json',JSON.stringify({fixture:summary,softwareLight,noLightOcclusion,unboundedLightMasks,limits:['Canvas wrappers add overhead; these timings are diagnostic, not a performance acceptance result.','The no-light-occlusion mode deliberately breaks depth masking and must never be used as a production renderer.','No moving camera, simulation throughput, total memory or storage acceptance.'],servedMainSha256:createHash('sha256').update(mainSource).digest('hex'),sourceHashes,scope:'Fixed paused day/night dense scene; test-only hook invokes the real render function once per animation frame. Canvas method wrappers add overhead; timings identify work, not an acceptance benchmark. No camera movement or simulation advancement.',phases,errors},null,2)+'\n');console.log(phases.map(p=>({minutes:p.minutes,softwareLight:p.softwareLight,noLightOcclusion:p.noLightOcclusion,unboundedLightMasks:p.unboundedLightMasks,paint:p.paint,top:p.timings.slice(0,5)})));
}finally{g.free();await browser.close();await new Promise(resolve=>server.close(resolve));}
