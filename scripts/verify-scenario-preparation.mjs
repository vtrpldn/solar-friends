import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const output=process.argv[2]??'/tmp/solar-scenario-preparation';await mkdir(output,{recursive:true});
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/editor.html`);
 await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
 await page.locator('[data-preset=camp]').click();await page.waitForFunction(()=>!document.querySelector('#creator-test').disabled);
 await page.waitForFunction(()=>document.querySelector('#creator-save-status').textContent==='Saved on this device');
 const stored=()=>page.evaluate(async()=>{const {ContentLibrary}=await import('/content-library.js');const l=new ContentLibrary();try{const projects=await l.listProjects();return {projects,runs:await l.listRuns(),drafts:await Promise.all(projects.map(async p=>{const r=await l.getProject(p.id);return {id:r.id,checkpoint:r.checkpoint,view:r.view};}))};}finally{l.close();}});
 const before=await stored(),url=page.url();
 // Delay the worker's module fetch so cancellation occurs before compilation.
 await page.route('**/scenario-prepare-worker.js',async route=>{await new Promise(resolve=>setTimeout(resolve,1200));try{await route.continue();}catch{}});
 for(const escape of [false,true]){
  await page.locator('#creator-test').click();await page.getByRole('heading',{name:'Preparing your village',exact:true}).waitFor();
  await page.screenshot({path:output+'/preparing.png'});
  if(escape)await page.keyboard.press('Escape');else await page.getByRole('button',{name:'Cancel preparation',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('.creator-prepare-dialog'));
  await page.waitForTimeout(1400);
  assert.equal(page.url(),url);assert.equal((await stored()).runs.length,before.runs.length);
  assert.deepEqual((await stored()).drafts,before.drafts);
  assert.equal(await page.locator('#creator-test').isEnabled(),true);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'creator-test');
 }
 await page.unroute('**/scenario-prepare-worker.js');
 // The actual worker must compile exactly the same opening as the native API.
 const preWorker=await stored();
 const parity=await page.evaluate(async()=>{
  const {ContentLibrary}=await import('/content-library.js'),{prepareScenario}=await import('/editor/prepare-scenario.js'),{Game}=await import('/pkg/solar_friends.js');const l=new ContentLibrary();
  try{const projects=await l.listProjects(),record=await l.getProject(projects[0].id),definition=record.checkpoint.definition,g=new Game();try{const checked=JSON.parse(g.load_scenario(JSON.stringify(definition)));if(!checked.ok)throw Error(JSON.stringify(checked));const expected=g.snapshot(),report=g.report_state(),actual=await prepareScenario(definition);return {snapshot:actual.snapshot===expected,report:JSON.stringify(actual.report)===JSON.stringify(JSON.parse(report))};}finally{g.free();}}finally{l.close();}
 });assert.deepEqual(parity,{snapshot:true,report:true});
 const invalid=await page.evaluate(async()=>{const {prepareScenario}=await import('/editor/prepare-scenario.js');try{await prepareScenario({});return false;}catch(error){return Boolean(error.message)&&!document.querySelector('.creator-prepare-dialog');}});assert.equal(invalid,true);
 const after=await stored();assert.deepEqual(after,preWorker);
 await page.locator('#creator-test').click();await page.waitForURL(/\?run=/);await page.waitForFunction(()=>window.solarDev);
 const final=await stored();assert.equal(final.runs.length,before.runs.length+1);assert.equal(final.runs.at(-1).sessionKind,'playtest');
 assert.deepEqual(errors,[]);
 const result={cancelButton:true,escape:true,noRunAfterCancellation:true,focusRestored:true,workerNativeParity:parity,unchangedDraftAndRunsAfterCancellation:true,unchangedLibraryDuringWorker:true,invalidCompilationPreservesLibrary:true,successfulPlaytest:true,browserErrors:errors};
 await writeFile(output+'/report.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
