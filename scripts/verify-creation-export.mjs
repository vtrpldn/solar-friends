import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import init,{Game} from '../web/pkg/solar_friends.js';
import {mixedBuilderFixture} from './mixed-builder-fixture.mjs';
const output=process.argv[2]??'/tmp/solar-creation-export';await mkdir(output,{recursive:true});
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});const fixtureGame=new Game();let fixture;try{const template=JSON.parse(fixtureGame.scenario_template('sandbox'));template.map=JSON.parse(fixtureGame.generate_biome_property('mata-atlantica',42));fixture=mixedBuilderFixture(fixtureGame,template);}finally{fixtureGame.free();}
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true}),errors=[],downloads=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('download',download=>downloads.push(download));
 await page.goto(`http://127.0.0.1:${server.address().port}/editor.html`);await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');await page.locator('[data-preset=camp]').click();await page.waitForFunction(()=>document.querySelector('#creator-save-status').textContent==='Saved on this device');await page.waitForFunction(()=>document.querySelector('#creator-map').getAttribute('aria-busy')==='false');await page.locator('#creator-save').click();await page.waitForFunction(()=>document.querySelector('#creator-save-status').textContent==='Saved on this device');
 const stored=()=>page.evaluate(async()=>{const {ContentLibrary}=await import('/content-library.js');const l=new ContentLibrary();try{const projects=await l.listProjects();return {projects,runs:await l.listRuns(),records:await Promise.all(projects.map(p=>l.getProject(p.id)))};}finally{l.close();}});
 const before=await stored(),url=page.url();
 await page.route('**/creation-export-worker.js',async route=>{await new Promise(resolve=>setTimeout(resolve,1200));try{await route.continue();}catch{}});
 for(const escape of [false,true]){
  await page.locator('#creator-export').click();await page.getByRole('heading',{name:'Preparing your creation file',exact:true}).waitFor();
  const heartbeat=await page.evaluate(()=>new Promise(resolve=>{let ticks=0;const timer=setInterval(()=>ticks++,10);setTimeout(()=>{clearInterval(timer);resolve(ticks);},150);}));assert(heartbeat>=3,'Export preparation must leave UI timers responsive');
  if(!escape)await page.screenshot({path:output+'/preparing.png'});
  if(escape)await page.keyboard.press('Escape');else await page.getByRole('button',{name:'Cancel preparation',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('.creator-prepare-dialog'));await page.waitForTimeout(1400);
  assert.equal(page.url(),url);assert.equal(downloads.length,0);assert.deepEqual(await stored(),before);assert.equal(await page.evaluate(()=>document.activeElement.id),'creator-export');
 }
 await page.unroute('**/creation-export-worker.js');
 const parity=await page.evaluate(async()=>{
  const {ContentLibrary}=await import('/content-library.js'),{Game}=await import('/pkg/solar_friends.js'),{creationFile,freezeCreation}=await import('/editor/files.js'),{prepareCreationExport}=await import('/editor/prepare-export.js'),l=new ContentLibrary(),g=new Game();
  try{const records=await l.listProjects(),definition=(await l.getProject(records[0].id)).checkpoint.definition,checked=JSON.parse(g.load_scenario(JSON.stringify(definition)));if(!checked.ok)throw Error(JSON.stringify(checked));const context={terrain:JSON.parse(g.terrain_template()),snapshot:JSON.parse(g.report_state()),catalog:JSON.parse(g.scenario_catalog())},expected=creationFile(freezeCreation(definition,context)),actual=await prepareCreationExport(definition,context),invalid={...definition,title:'',description:'An unfinished draft'};return {expected,actual,invalidExact:await prepareCreationExport(invalid,null)===creationFile(invalid)};}finally{g.free();l.close();}
 });assert.equal(parity.actual,parity.expected);assert.equal(parity.invalidExact,true);assert.deepEqual(await stored(),before);
 const dense=await page.evaluate(async definition=>{
  const {Game}=await import('/pkg/solar_friends.js'),{creationFile,freezeCreation}=await import('/editor/files.js'),{prepareCreationExport}=await import('/editor/prepare-export.js'),g=new Game();
  try{const checked=JSON.parse(g.load_scenario(JSON.stringify(definition)));if(!checked.ok)throw Error(JSON.stringify(checked));const context={terrain:JSON.parse(g.terrain_template()),snapshot:JSON.parse(g.report_state()),catalog:JSON.parse(g.scenario_catalog())},expected=creationFile(freezeCreation(definition,context));let last=performance.now(),maximumGapMs=0,ticks=0;const timer=setInterval(()=>{const now=performance.now();maximumGapMs=Math.max(maximumGapMs,now-last);last=now;ticks++;},10),start=performance.now();let actual;try{actual=await prepareCreationExport(definition,context);}finally{await new Promise(resolve=>setTimeout(resolve,25));clearInterval(timer);}return {exact:actual===expected,bytes:new TextEncoder().encode(actual).length,elapsedMs:performance.now()-start,maximumGapMs,ticks};}finally{g.free();}
 },fixture.definition);assert.equal(dense.exact,true);assert(dense.ticks>0);assert.deepEqual(await stored(),before);
 const downloadEvent=page.waitForEvent('download');await page.locator('#creator-export').click();const downloaded=await downloadEvent;assert.equal(await readFile(await downloaded.path(),'utf8'),parity.expected);assert(downloaded.suggestedFilename().endsWith('.solar-scenario'));assert.equal(await page.evaluate(()=>document.activeElement.id),'creator-export');assert.deepEqual(await stored(),before);
 const failure=await page.evaluate(async()=>{const {prepareCreationExport}=await import('/editor/prepare-export.js');const checks=[];for(const [definition,context]of [[{title:'too large',description:'x'.repeat(2*1024*1024+1)},null],[{title:'clone error'},{bad:()=>{}}]]){try{await prepareCreationExport(definition,context);checks.push(false);}catch(error){checks.push(Boolean(error.message)&&!document.querySelector('.creator-prepare-dialog'));}}return checks;});assert.deepEqual(failure,[true,true]);assert.equal(downloads.length,1);assert.deepEqual(await stored(),before);assert.deepEqual(errors,[]);
 const result={cancelButton:true,escape:true,responsiveWhilePreparing:true,noLateDownloadAfterCancel:true,focusRestored:true,byteExactFrozenExport:true,byteExactIncompleteExport:true,realDownload:true,denseFixture:fixture.summary,denseExport:dense,oversizedAndCloneErrorsCleanUp:true,unchangedDraftHistoryViewAndLibrary:true,browserErrors:errors};await writeFile(output+'/report.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
