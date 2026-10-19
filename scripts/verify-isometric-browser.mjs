import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {serve} from './serve.mjs';
const output='artifacts/isometric';await mkdir(output,{recursive:true});
const server=await serve(),base=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1500,height:1050}}),errors=[],screenshots=[];
page.on('pageerror',e=>errors.push(e.message));
// A candidate can use a night source that is absent from the runtime registry.
// Keep the fixture out of the real candidate list and verify its asset is loaded.
let independentNightLoaded=false;
page.on('response',response=>{if(response.url().endsWith('/art/eco-toilet-night.png')&&response.ok())independentNightLoaded=true;});
await page.route('**/artwork/finishing-candidates.json',async route=>{
 const candidates=JSON.parse(await readFile('web/artwork/finishing-candidates.json','utf8'));
 const {allBuildingArt}=await import('../web/building-art.js');
 candidates.push({id:'night-loading-regression',label:'Test-only night loader',key:'eco_toilet',art:{...allBuildingArt.eco_toilet,nightFile:'eco-toilet-night.png'},issue:'Test fixture only'});
 await route.fulfill({contentType:'application/json',body:JSON.stringify(candidates)});
});
await page.addInitScript(()=>{window.worldFilters=[];const proto=CanvasRenderingContext2D.prototype,descriptor=Object.getOwnPropertyDescriptor(proto,'filter');Object.defineProperty(proto,'filter',{...descriptor,set(value){if(this.canvas.id==='world'&&value!=='none')window.worldFilters.push(value);descriptor.set.call(this,value);}});});
try{
 await page.goto(base+'/artwork/projection.html');
 await page.waitForFunction(()=>document.querySelector('#status')?.dataset.drift,null,{timeout:120000});
 assert.equal(await page.locator('figure').count(),27);
 assert(independentNightLoaded,'Candidate night files outside the runtime registry must be decoded too');
 assert(Number.isFinite(Number(await page.locator('#status').getAttribute('data-drift'))));
 await page.locator('#guides').uncheck();
 const workStates=['built','blueprint','construction','pack','rebuild','salvage','demolish'];
 for(const lighting of ['day','night']){
  await page.locator('#light').selectOption(lighting);
  for(const workState of workStates){
   await page.locator('#stage').selectOption(workState);
   assert.equal(await page.locator(`figure canvas[data-work-state="${workState}"]`).count(),27);
   for(let group=0;group<3;group++){
    await page.evaluate(group=>{[...document.querySelectorAll('figure')].forEach((el,j)=>el.style.display=j>=group*9&&j<(group+1)*9?'block':'none');},group);
    const file=`${output}/${lighting}-${workState==='built'?'':workState+'-'}${group}.png`;await page.locator('#buildings').screenshot({path:file});screenshots.push(file);
   }
  }
 }
 await page.locator('#stage').selectOption('built');
 await page.evaluate(()=>document.querySelectorAll('figure').forEach(el=>el.style.display=''));
 await page.locator('#light').selectOption('day');await page.locator('#guides').check();
 await page.getByRole('button',{name:'Inspect Community shed',exact:true}).click();
 await page.locator('#focus').screenshot({path:`${output}/shed-structure.png`});screenshots.push(`${output}/shed-structure.png`);await page.locator('#focus-close').click();
 const runtimeShed=await page.evaluate(async()=>(await import('/building-art.js')).allBuildingArt.shed.file);
 await page.locator('#proposal').check();
 await page.getByRole('button',{name:'Inspect Community shed',exact:true}).click();
 assert.match(await page.locator('#focus-caption').innerText(),/UNAPPROVED CANDIDATE/);
 assert.match(await page.locator('#status').innerText(),/Candidate comparison only/);
 assert.equal(await page.evaluate(async()=>(await import('/building-art.js')).allBuildingArt.shed.file),runtimeShed,'Candidate comparison must not alter runtime artwork');
 await page.locator('#focus').screenshot({path:`${output}/shed-candidate.png`});
 await page.locator('#focus-close').click();await page.locator('#proposal').uncheck();
 await page.getByRole('button',{name:'Inspect Greenhouse',exact:true}).click();await page.locator('#focus').screenshot({path:`${output}/greenhouse-structure.png`});await page.locator('#focus-close').click();
 const occlusion=await page.evaluate(async()=>{
  const {paintDepthLight}=await import('/night-lighting.js');const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const c=canvas.getContext('2d');
  paintDepthLight(c,()=>{},()=>{c.fillStyle='#ffbd62';c.fillRect(0,0,64,64);});
  paintDepthLight(c,()=>{c.fillStyle='#333';c.fillRect(16,16,32,32);});
  const data=c.getImageData(0,0,64,64).data;return {behind:data[(32*64+32)*4+3],outside:data[(8*64+8)*4+3]};
 });
 assert.equal(occlusion.behind,0,'A foreground silhouette must fully block a rear light');assert.equal(occlusion.outside,255,'Unoccluded light must remain visible');
 for(const mode of ['artwork-preview','night-preview']){
  await page.goto(base+'/?'+mode);await page.waitForFunction(()=>window.solarDevReloadReady);
  assert.equal((await page.evaluate(()=>window.solarDev.snapshot())).village.buildings.length,27);
  assert.deepEqual(await page.evaluate(()=>window.worldFilters),[],'World-sized filter layers must not return; filter small cached sprite surfaces instead');
  await page.screenshot({path:`${output}/${mode}-game.png`});screenshots.push(`${output}/${mode}-game.png`);
 }
 await page.locator('#dev-button').click();await page.locator('[data-dev-tab=checks]').click();
 const downloaded=page.waitForEvent('download');await page.locator('#dev-capture').click();const download=await downloaded;
 const expected=await page.evaluate(()=>document.querySelector('#world').toDataURL('image/png').split(',')[1]);
 assert.deepEqual(await readFile(await download.path()),Buffer.from(expected,'base64'),'Downloaded scene must match the visible night world');
 assert.deepEqual(errors,[]);
 await writeFile(`${output}/browser-review.json`,JSON.stringify({variants:27,views:27*2*workStates.length,workStates,status:'captures-only-not-visual-approval',occlusion,errors,screenshots},null,2));
 console.log('PASS: captured all 378 renderer state views, exercised enlarged guides and planted day/night previews, checked light occlusion; no browser errors. Visual quality is not certified by this test.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
