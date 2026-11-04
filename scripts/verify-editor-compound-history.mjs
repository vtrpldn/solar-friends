import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import init,{Game} from '../web/pkg/solar_friends.js';
import {canonical} from '../web/editor/journal.js';
import {maximumHistoryBase,historyFixture} from './maximum-history-fixture.mjs';
import {serve} from './serve.mjs';
import {closeValidationBrowser} from './close-validation-browser.mjs';
const output=process.argv[2]??'artifacts/editor-compound-history';
await mkdir(output,{recursive:true});await writeFile(output+'/report.json','{"complete":false}\n');
await init({module_or_path:await readFile('web/pkg/solar_friends_bg.wasm')});
const game=new Game();let base,fixture;
try{base=maximumHistoryBase(game).definition;base.id='compound-public-history';base.map.id='map-compound-public-history';fixture=historyFixture(base,'compound');assert(JSON.parse(game.validate_scenario(JSON.stringify(fixture.checkpoint.definition))).ok);}finally{game.free();}
const digest=v=>createHash('sha256').update(canonical(v)).digest('hex');
const server=await serve(0),cleanup=[];let browser;
try{
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1600,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const origin=`http://127.0.0.1:${server.address().port}`;
 await page.goto(origin+'/');await page.evaluate(async checkpoint=>{const {ContentLibrary}=await import('/content-library.js'),l=new ContentLibrary();try{await l.saveProject({id:'compound-public-history',checkpoint,view:{center:[32,32],zoom:1.3,workspace:'village',grid:true}});}finally{l.close();}},fixture.checkpoint);
 const ready=()=>page.waitForFunction(()=>document.querySelector('#creator-save-status')?.textContent.startsWith('Saved')&&document.querySelector('#creator-map')?.getAttribute('aria-busy')==='false'&&!document.querySelector('.creator-prepare-dialog'));
 const state=()=>page.evaluate(async()=>{const {ContentLibrary}=await import('/content-library.js'),l=new ContentLibrary();try{const cp=(await l.getProject('compound-public-history')).checkpoint,h=cp.history;return {definition:cp.definition,steps:h.past.length+h.future.length,past:h.past.length,future:h.future.length,bytes:new TextEncoder().encode(JSON.stringify(h)).length};}finally{l.close();}});
 const exactCheckpoint=()=>page.evaluate(async()=>{const {ContentLibrary}=await import('/content-library.js'),l=new ContentLibrary();try{return(await l.getProject('compound-public-history')).checkpoint;}finally{l.close();}});
 await page.goto(origin+'/editor.html');await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
 await page.locator('[data-open-project="compound-public-history"]').click();await page.waitForURL('**project=compound-public-history');await ready();assert.equal(digest(await exactCheckpoint()),digest(fixture.checkpoint));
 function expected(stage){const d=structuredClone(base);d.title='Compound history step '+stage;for(let i=0;i<1080;i++)d.map.terrain[i].fertility=stage%2?.25:.75;return d;}
 for(const direction of ['undo','redo']){
  for(let n=1;n<=64;n++){await page.locator('#creator-'+direction).click();await ready();const actual=await state(),stage=direction==='undo'?80-n:16+n;assert.equal(digest(actual.definition),digest(expected(stage)),direction+' '+n);assert.equal(actual.steps,64);assert(actual.bytes>7.5*1024*1024&&actual.bytes<8*1024*1024);if(n%16===0)console.log('PASS compound public',direction,n);}
  assert(await page.locator('#creator-'+direction).isDisabled());
 }
 await page.locator('#creator-undo').click();await ready();await page.locator('#creator-title').fill('A new direction');await page.locator('#creator-title').press('Tab');await ready();const branch=await state(),target=expected(79);target.title='A new direction';assert.equal(digest(branch.definition),digest(target));assert.equal(branch.past,64);assert.equal(branch.future,0);assert(await page.locator('#creator-redo').isDisabled());
 await page.locator('#creator-save').click();await ready();const saved=await exactCheckpoint();await page.screenshot({path:output+'/compound-history.png'});await page.reload();await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');await ready();assert.equal(digest(await exactCheckpoint()),digest(saved));assert.deepEqual(errors,[]);
}finally{await closeValidationBrowser(browser,server,{onStage:s=>cleanup.push(s)});}
const files=['scripts/verify-editor-compound-history.mjs','scripts/maximum-history-fixture.mjs','web/editor/document.js','web/editor/index.js','web/editor/journal.js','web/editor/prepare-draft.js','web/editor/run-preparation.js','web/pkg/solar_friends_bg.wasm'];
const inputs=Object.fromEntries(await Promise.all(files.map(async f=>[f,createHash('sha256').update(await readFile(f)).digest('hex')])));
await writeFile(output+'/report.json',JSON.stringify({complete:true,summary:fixture.summary,publicUndo:64,publicRedo:64,independentWholeDefinitions:true,bothLimitsThroughout:true,branchClearsRedo:true,exactReload:true,cleanup,inputs,scope:'Isolated desktop Chromium public opening, complete history traversal, branching and durable reload. Initial 80 edits seeded via document/library APIs. Not public long-stroke creation or responsiveness/hardware acceptance.'},null,2)+'\n');console.log('PASS public simultaneous-limit history and bounded cleanup.');
