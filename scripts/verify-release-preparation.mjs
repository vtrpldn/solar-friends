import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import init,{Game} from '../web/pkg/solar_friends.js';
import {mixedBuilderFixture} from './mixed-builder-fixture.mjs';
const output=process.argv[2]??'/tmp/solar-release-preparation';await mkdir(output,{recursive:true});
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});const fixtureGame=new Game();let fixture;try{const template=JSON.parse(fixtureGame.scenario_template('sandbox'));template.map=JSON.parse(fixtureGame.generate_biome_property('mata-atlantica',42));fixture=mixedBuilderFixture(fixtureGame,template);}finally{fixtureGame.free();}
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/editor.html`);await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');await page.locator('[data-preset=camp]').click();await page.waitForFunction(()=>document.querySelector('#creator-save-status').textContent==='Saved on this device');await page.waitForFunction(()=>document.querySelector('#creator-map').getAttribute('aria-busy')==='false');await page.locator('#creator-save').click();await page.waitForFunction(()=>document.querySelector('#creator-save-status').textContent==='Saved on this device');
 const stored=()=>page.evaluate(async()=>{const {ContentLibrary}=await import('/content-library.js');const l=new ContentLibrary();try{const projects=await l.listProjects();return {projects,runs:await l.listRuns(),releases:await l.listReleases(),records:await Promise.all(projects.map(p=>l.getProject(p.id)))};}finally{l.close();}});
 const before=await stored(),url=page.url();
 await page.route('**/release-prepare-worker.js',async route=>{await new Promise(resolve=>setTimeout(resolve,1200));try{await route.continue();}catch{}});
 await page.locator('#creator-release').click();await page.locator('#creator-release-author').fill('Our community');
 for(const escape of [false,true]){
  await page.locator('#creator-release-confirm').click();await page.getByRole('heading',{name:'Preparing your release',exact:true}).waitFor();
  if(!escape)await page.screenshot({path:output+'/preparing.png'});
  if(escape)await page.keyboard.press('Escape');else await page.getByRole('button',{name:'Cancel preparation',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('.creator-prepare-dialog'));await page.waitForTimeout(1400);
  assert.equal(page.url(),url);assert.deepEqual(await stored(),before);assert.equal(await page.evaluate(()=>document.activeElement.id),'creator-release-confirm');assert.equal(await page.locator('#creator-release-dialog').evaluate(d=>d.open),true);
 }
 await page.unroute('**/release-prepare-worker.js');
 const parity=await page.evaluate(async definition=>{
  const {Game}=await import('/pkg/solar_friends.js'),{freezeReleaseDefinition}=await import('/release-package.js'),{prepareRelease}=await import('/editor/prepare-release.js'),g=new Game();
  try{const checked=JSON.parse(g.load_scenario(JSON.stringify(definition)));if(!checked.ok)throw Error(JSON.stringify(checked));const expected=freezeReleaseDefinition(definition,{terrain:JSON.parse(g.terrain_template()),snapshot:JSON.parse(g.report_state()),catalog:JSON.parse(g.scenario_catalog())});let last=performance.now(),maximumGapMs=0,ticks=0;const timer=setInterval(()=>{const now=performance.now();maximumGapMs=Math.max(maximumGapMs,now-last);last=now;ticks++;},10),start=performance.now();let actual;try{actual=await prepareRelease(definition);}finally{await new Promise(resolve=>setTimeout(resolve,25));clearInterval(timer);}return {exact:JSON.stringify(actual)===JSON.stringify(expected),elapsedMs:performance.now()-start,maximumGapMs,ticks,buildings:actual.start.buildings.length,residents:actual.start.residents.length};}finally{g.free();}
 },fixture.definition);assert.equal(parity.exact,true);assert.equal(parity.buildings,256);assert.equal(parity.residents,12);assert(parity.ticks>0);assert.deepEqual(await stored(),before);
 const invalid=await page.evaluate(async()=>{const {prepareRelease}=await import('/editor/prepare-release.js');try{await prepareRelease({});return false;}catch(error){return Boolean(error.message)&&!document.querySelector('.creator-prepare-dialog');}});assert.equal(invalid,true);assert.deepEqual(await stored(),before);
 await page.locator('#creator-release-confirm').click();await page.locator('#creator-library-dialog').waitFor({state:'visible'});const after=await stored();assert.equal(after.releases.length,1);assert.equal(after.releases[0].contentRevision,1);assert.equal(after.runs.length,0);
 const frozen=await page.evaluate(async()=>{const {ContentLibrary}=await import('/content-library.js'),{Game}=await import('/pkg/solar_friends.js'),l=new ContentLibrary(),g=new Game();try{const r=await l.getRelease((await l.listReleases())[0].id),checked=JSON.parse(g.validate_scenario(JSON.stringify(r.package)));return {ok:checked.ok,terrain:r.package.definition.map.terrain.length,residents:r.package.definition.start.residents.length,author:r.package.author};}finally{g.free();l.close();}});assert.deepEqual(frozen,{ok:true,terrain:4096,residents:5,author:'Our community'});assert.deepEqual(errors,[]);
 const result={cancelButton:true,escape:true,noLateReleaseAfterCancel:true,unchangedDraftHistoryViewAndLibrary:true,focusRestored:true,invalidCompilationPreservesLibrary:true,denseWorkerNativeParity:parity,successfulFirstReleaseVersion:1,checkedRelease:frozen,browserErrors:errors};await writeFile(output+'/report.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
