import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import init,{Game} from '../web/pkg/solar_friends.js';
const output=process.argv[2]??'artifacts/editor-navigation-overlay-v1';await mkdir(output,{recursive:true});
await init({module_or_path:await readFile('web/pkg/solar_friends_bg.wasm')});
const author=new Game(),fixtures=[];
for(const biome of ['mata-atlantica','cerrado','caatinga']){
 const d=JSON.parse(author.scenario_template('sandbox'));d.map=JSON.parse(author.generate_biome_property(biome,42));d.map.river={schema:1,centers:Array(64).fill(20)};d.map.nature=[];assert(JSON.parse(author.validate_scenario(JSON.stringify(d))).ok);fixtures.push({biome,definition:d});
}
author.free();const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const results=[];
 for(const {biome,definition}of fixtures){
  const fixtureRaw=JSON.stringify(definition);await writeFile(`${output}/${biome}.solar-scenario`,fixtureRaw);
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.overlayProbeReady=import('/pkg/solar_friends.js').then(({Game})=>{window.overlayCalls=[];const original=Game.prototype.navigation_overlay;Game.prototype.navigation_overlay=function(...args){const start=performance.now(),raw=original.apply(this,args);window.overlayCalls.push({ms:performance.now()-start,report:JSON.parse(raw)});return raw;};});});
  await page.goto(`http://127.0.0.1:${server.address().port}/editor.html`);await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');await page.evaluate(()=>window.overlayProbeReady);await page.locator('#creator-import').setInputFiles({name:'access.solar-scenario',mimeType:'application/json',buffer:Buffer.from(fixtureRaw)});await page.locator('#creator-library-dialog').waitFor({state:'hidden'});
  const ready=()=>page.waitForFunction(()=>document.querySelector('#creator-map').getAttribute('aria-busy')==='false'&&document.querySelector('#creator-save-status').textContent.startsWith('Saved'));
  const saved=()=>page.evaluate(async()=>{const {ContentLibrary}=await import('/content-library.js'),l=new ContentLibrary(undefined,{broadcast:false});try{return await l.getProject(new URL(location.href).searchParams.get('project'));}finally{l.close();}});
  const observations=()=>page.evaluate(()=>window.overlayCalls);
  const point=(x,y)=>page.locator('#creator-map').evaluate((c,[x,y])=>{const r=c.getBoundingClientRect(),o=JSON.parse(c.dataset.origin),s=Number(c.dataset.scale);return {x:r.left+o.x+(x-y)*34*s,y:r.top+o.y+(x+y)*17*s};},[x,y]);
  await ready();const baseline=await saved();assert.equal((await observations()).length,0,'Unused overlay must not query the navigation graph');
  await page.locator('#creator-land-layer').selectOption('walkability');assert.equal(await page.locator('#creator-map').getAttribute('data-overlay-cells'),'4096');let calls=await observations();assert.equal(calls.length,1);const at=(r,x,y)=>r.cells[y*64+x];assert.equal(at(calls[0].report,10,10).walkable,true);assert.equal(at(calls[0].report,10,10).reachable,false);assert.equal(at(calls[0].report,20,10).walkable,false);assert.equal(calls[0].report.origin_clear,true);
  for(const [x,y]of [[32,32],[33,32],[34,32],[35,32]]){const p=await point(x,y);await page.mouse.move(p.x,p.y);}assert.equal((await observations()).length,1,'Pointer motion must reuse the completed access query');await page.locator('#creator-land-layer').selectOption('fertility');await page.locator('#creator-land-layer').selectOption('walkability');assert.equal((await observations()).length,1,'Layer switching must reuse the same checked definition');
  for(let i=0;i<4;i++)await page.locator('#creator-zoom-out').click();await page.locator('#creator-save').click();await ready();assert.deepEqual((await saved()).checkpoint,baseline.checkpoint,'View-only access inspection changed authoring history');await page.screenshot({path:`${output}/${biome}-river.png`});
  await page.locator('#creator-river-enabled').uncheck();await ready();calls=await observations();assert.equal(calls.length,2);assert.equal(at(calls.at(-1).report,10,10).reachable,true);const noRiver=(await saved()).checkpoint.definition;await page.screenshot({path:`${output}/${biome}-no-river.png`});
  await page.locator('#creator-undo').click();await ready();calls=await observations();assert.equal(calls.length,3);assert.equal(at(calls.at(-1).report,10,10).reachable,false);
  await page.locator('#creator-redo').click();await ready();calls=await observations();assert.equal(calls.length,4);assert.equal(at(calls.at(-1).report,10,10).reachable,true);
  await page.locator('[data-tool="home"]').click();const home=await point(40,35);await page.mouse.click(home.x,home.y);await ready();calls=await observations();assert.equal(calls.length,5);assert.equal(at(calls.at(-1).report,40,35).walkable,false);
  await page.locator('#creator-undo').click();await ready();assert.equal((await observations()).length,6);assert.deepEqual((await saved()).checkpoint.definition,noRiver);
  await page.locator('#creator-funds').fill('-1');await page.locator('#creator-funds').press('Tab');await ready();assert(await page.locator('#creator-test').isDisabled());assert((await page.locator('#creator-land-legend').textContent()).startsWith('Draft incomplete'));assert.equal((await observations()).length,6,'An invalid draft must retain the explicitly labelled last valid navigation preview');
  await page.locator('#creator-undo').click();await ready();assert(await page.locator('#creator-test').isEnabled());const samplesBeforeReload=await observations();assert.equal(samplesBeforeReload.length,6);assert.deepEqual((await saved()).checkpoint.definition,noRiver);
  await page.locator('[data-tool="select"]').click();await page.locator('#creator-save').click();await ready();const checkpoint=await saved();await page.reload();await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');await ready();assert.equal(await page.locator('#creator-land-layer').inputValue(),'walkability');assert.equal(await page.locator('#creator-map').getAttribute('data-overlay-cells'),'4096');assert.deepEqual((await saved()).checkpoint,checkpoint.checkpoint);assert.equal((await observations()).length,1);
  const p=await point(32,32);await page.mouse.move(p.x,p.y);await page.getByText('Connected to the arrival camp.',{exact:false}).waitFor();assert.deepEqual(errors,[]);
  results.push({biome,fixtureFile:`${biome}.solar-scenario`,fixtureSha256:createHash('sha256').update(fixtureRaw).digest('hex'),cells:4096,unusedQueryCount:0,pointerQueries:0,committedQueries:6,restoredQueries:1,exactViewOnlyCheckpoint:true,exactUndoRedo:true,reloadExact:true,invalidDraftRetainsLabelledPreview:true,queryMs:samplesBeforeReload.map(c=>c.ms)});await page.close();
 }
 const sources={};for(const file of ['src/navigation.rs','src/world.rs','web/editor/index.js','web/editor.html','web/editor/map-view.js','web/pkg/solar_friends_bg.wasm','scripts/verify-editor-navigation-overlay.mjs'])sources[file]=createHash('sha256').update(await readFile(file)).digest('hex');
 await writeFile(`${output}/report.json`,JSON.stringify({schema:1,sources,results,scope:'Three native-valid imported fixtures with an authored separating river; regular layer, river removal, undo/redo, building placement, save/reload and trusted pointer controls. Native query instrumentation observes calls only. Cell-centre graph connectivity ignores temporary pedestrian crowding and does not prove every fractional work approach.'},null,2)+'\n');console.log('PASS: three-biome public navigation overlay, disconnected river component, native building obstruction, exact undo/redo/reload, view-only isolation and no pointer-time graph recomputation.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
