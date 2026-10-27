import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import init,{Game} from '../web/pkg/solar_friends.js';
import {mixedBuilderFixture} from './mixed-builder-fixture.mjs';
const output=process.argv[2]??'/tmp/solar-depth-light-bounds';await mkdir(output,{recursive:true});
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const mainSource=await readFile('web/main.js','utf8');
const g=new Game(),server=await serve(0,{handle:async(_req,res,path)=>{if(path!=='/main.js')return false;res.writeHead(200,{'Content-Type':'text/javascript'}).end(mainSource+'\nwindow.__testPaintFrame=()=>render();\n');return true;}}),browser=await chromium.launch({headless:true}),errors=[],results=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:Number(process.argv.find(a=>a.startsWith('--dpr='))?.split('=')[1]??1),reducedMotion:'reduce'});
 page.on('pageerror',e=>errors.push(e.message));
 const helper=(await readFile('web/night-lighting.js','utf8')).replace('export function createDepthLightPass(ctx) {','export function createDepthLightPass(ctx) {\n if(globalThis.__testFullDepthLight)return {paint(occlude,emit){paintDepthLight(ctx,occlude,emit);}};');
 await page.route('**/night-lighting.js',route=>route.fulfill({contentType:'text/javascript',body:helper}));
 await page.goto(`http://127.0.0.1:${server.address().port}/?performance`);
 await page.waitForFunction(()=>window.solarDev&&document.querySelector('#main-menu').open);
 await page.locator('[data-new-mode=sandbox]').click();
 await page.waitForFunction(()=>!document.querySelector('#main-menu').open);
 await page.locator('#pause').click();
 const synthetic=await page.evaluate(async()=>{
  const {createDepthLightPass,paintDepthLight}=await import('/night-lighting.js');let checked=0;
  window.__testFullDepthLight=false;
  for(let seed=1;seed<=30;seed++){
   const canvas=()=>{const c=document.createElement('canvas');c.width=c.height=96;return c.getContext('2d');},a=canvas(),b=canvas(),pass=createDepthLightPass(b);
   for(let i=0;i<40;i++){
    const x=(seed*19+i*31)%110-12,y=(seed*13+i*17)%110-12,w=3+(i*7)%30,h=4+(i*11)%24,r={left:x-1,top:y-1,right:x+w+1,bottom:y+h+1};
    const occlude=ctx=>()=>{ctx.fillStyle='rgba(30,60,80,.6)';ctx.fillRect(x,y,w,h);};
    const emit=i%3===0?ctx=>()=>{ctx.save();ctx.globalCompositeOperation='screen';ctx.fillStyle='rgba(255,200,100,.7)';ctx.fillRect(x,y,w,h);ctx.restore();return seed%3===0&&i===27?undefined:{...r};}:i%7===0?()=>()=>null:null;
    paintDepthLight(a,occlude(a),emit?.(a));pass.paint(occlude(b),emit?.(b),i%5===0?undefined:r);
    const aa=a.getImageData(0,0,96,96).data,bb=b.getImageData(0,0,96,96).data;
    for(let k=0;k<aa.length;k++)if(aa[k]!==bb[k])throw Error(`Depth mask mismatch seed ${seed}, object ${i}, channel ${k}`);checked++;
   }
  }return {seeds:30,objectsPerSeed:40,exactIntermediateLayers:checked};
 });
 for(const biome of process.argv.includes('--synthetic-only')?[]:['mata-atlantica','cerrado','caatinga'])for(const minutes of [600,1260]){
  const template=JSON.parse(g.scenario_template('sandbox'));template.map=JSON.parse(g.generate_biome_property(biome,42));
  const {definition,summary}=mixedBuilderFixture(g,template);definition.start.minutes=minutes;
  assert(JSON.parse(g.load_scenario(JSON.stringify(definition))).ok);const raw=g.snapshot();
  await page.evaluate(raw=>window.solarDev.importSandbox(raw),raw);
  await page.waitForTimeout(400);
  for(const camera of ['fixed','panned-zoomed']){
   if(camera==='panned-zoomed'){await page.locator('#zoom-in').click();await page.locator('#zoom-in').click();await page.mouse.move(720,450);await page.mouse.down();await page.mouse.move(950,560,{steps:8});await page.mouse.up();}
   const captures=[];
  for(const unculled of [true,false,true])captures.push(await page.evaluate(({unculled,fixed})=>{window.__testFullDepthLight=unculled;if(fixed)window.solarDev.fixedView();else window.__testPaintFrame();return document.querySelector('#world').toDataURL('image/png').split(',')[1];},{unculled,fixed:camera==='fixed'}));
  assert(captures[0]===captures[2],`${biome}/${minutes}/${camera}: baseline capture is unstable`);
  if(captures[1]!==captures[0]){for(let i=0;i<2;i++)await writeFile(`${output}/${biome}-${minutes}-${camera}-${i?'bounded':'baseline'}-mismatch.png`,Buffer.from(captures[i],'base64'));throw Error(`${biome}/${minutes}/${camera}: bounded depth light changed world PNG; inspect retained captures`);}
  const png=Buffer.from(captures[1],'base64');if(minutes===1260&&camera==='fixed')await writeFile(`${output}/${biome}-night.png`,png);
  results.push({biome,minutes,camera,buildings:summary.buildings,exactWorldPng:true,sha256:createHash('sha256').update(png).digest('hex')});
  }
 }
 assert.deepEqual(errors,[]);
 await writeFile(output+'/report.json',JSON.stringify({sourceHashes:Object.fromEntries(await Promise.all(['web/main.js','web/night-lighting.js','web/world-renderer.js'].map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')]))),deviceScaleFactor:await page.evaluate(()=>devicePixelRatio),synthetic,scope:process.argv.includes('--synthetic-only')?'Randomized intermediate layer equivalence only; no world captures.':'Real game fixed and input-panned/zoomed world canvas: bounded masks versus test-only original unconditional masks, three biomes day/night, maximum mixed fixture. Static equality does not establish moving-camera continuity or frame pacing.',results,errors},null,2)+'\n');
 console.log({cases:results.length,errors});
}finally{g.free();await browser.close();await new Promise(resolve=>server.close(resolve));}
