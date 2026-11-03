import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {closeValidationBrowser} from './close-validation-browser.mjs';
const output=process.argv[2]??'artifacts/editor-publication-race';await mkdir(output,{recursive:true});
const paths=['scripts/verify-editor-publication-race.mjs','web/editor/index.js','web/editor/map-sharing-controls.js','web/editor/validate-publication.js','web/content-library.js','web/publication-validation-worker.js'];
const sha=b=>createHash('sha256').update(b).digest('hex'),inputs=Object.fromEntries(await Promise.all(paths.map(async p=>[p,sha(await readFile(p))])));
const server=await serve(0),url=`http://127.0.0.1:${server.address().port}/editor.html`;let browser;const rows=[];
try{
 browser=await chromium.launch({headless:true});
 for(const kind of ['map','release']){
  const context=await browser.newContext({viewport:{width:1600,height:1000}});await context.addInitScript(()=>{window.BroadcastChannel=undefined;});
  const a=await context.newPage(),b=await context.newPage(),errors=[];for(const p of [a,b]){p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());}
  const ready=p=>p.waitForFunction(()=>document.body.dataset.creatorReady==='true'),saved=p=>p.waitForFunction(()=>document.querySelector('#creator-save-status').textContent.startsWith('Saved')&&document.querySelector('#creator-map').getAttribute('aria-busy')==='false');
  const inspect=(p,id)=>p.evaluate(async({id,kind})=>{const {ContentLibrary}=await import('/content-library.js'),l=new ContentLibrary(undefined,{broadcast:false});try{return {project:await l.getProject(id),packages:await l[kind==='map'?'listMaps':'listReleases']()};}finally{l.close();}},{id,kind});
  await a.goto(url);await ready(a);await a.locator('[data-preset=camp]').click();await saved(a);const id=new URL(a.url()).searchParams.get('project');
  const normal=await a.evaluate(()=>JSON.stringify({...localStorage}));
  const ui=kind==='map'?{open:'#creator-save-map',dialog:'#creator-map-save-dialog',author:'#creator-map-author',confirm:'#creator-map-save-confirm',cancel:'#creator-map-save-cancel',status:'#creator-map-save-status'}:{open:'#creator-release',dialog:'#creator-release-dialog',author:'#creator-release-author',confirm:'#creator-release-confirm',cancel:'#creator-release-cancel',status:'#creator-release-status'};
  let reached,release;const entered=new Promise(r=>{reached=r;}),gate=new Promise(r=>{release=r;});
  await a.route('**/publication-validation-worker.js',async route=>{reached();await gate;await route.continue();});
  await a.locator(ui.open).click();await a.locator(ui.author).fill('Our friends');await a.locator(ui.confirm).click();
  let timer;try{await Promise.race([entered,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Publication did not reach the real validation worker')),30000);})]);}finally{clearTimeout(timer);}
  // The first tab has captured its source revision and is awaiting validation.
  // The other tab now opens that durable revision and performs a public edit.
  await b.goto(url+'?project='+id);await ready(b);await saved(b);await b.locator('#creator-title').fill('Newer shared '+kind);await b.locator('#creator-title').press('Tab');await b.locator('#creator-save').click();await saved(b);
  const winner=await inspect(b,id);assert.equal(winner.project.checkpoint.definition.title,'Newer shared '+kind);assert.equal(winner.packages.length,0);
  release();await a.waitForFunction(selector=>/another tab/i.test(document.querySelector(selector).textContent),ui.status);assert(await a.locator(ui.dialog).isVisible());assert(await a.locator(ui.confirm).isEnabled());assert(await a.locator(ui.cancel).isEnabled());
  assert.match(await a.locator('#creator-save-status').textContent(),/^Changed in another tab/);assert(await a.locator('#creator-recovery-copy').isVisible());assert.deepEqual(await inspect(a,id),winner,'Refused publication modified draft or package library');await a.screenshot({path:`${output}/${kind}-conflict.png`});
  await a.locator(ui.cancel).click();await a.unroute('**/publication-validation-worker.js');await a.reload();await ready(a);await saved(a);assert.equal(await a.locator('#creator-title').inputValue(),'Newer shared '+kind);
  await a.locator(ui.open).click();await a.locator(ui.author).fill('Our friends');await a.locator(ui.confirm).click();await a.locator(ui.dialog).waitFor({state:'hidden'});await a.locator('#creator-library-dialog').waitFor({state:'visible'});
  const after=await inspect(a,id);assert.equal(after.packages.length,1);assert.equal(after.packages[0].contentRevision,1,'Refused publication consumed a version');
  const frozen=await a.evaluate(async({kind,id})=>{const {ContentLibrary}=await import('/content-library.js'),l=new ContentLibrary(undefined,{broadcast:false});try{return await l[kind==='map'?'getMap':'getRelease'](id);}finally{l.close();}},{kind,id:after.packages[0].id});
  assert.equal(frozen.package.title,'Newer shared '+kind);assert.equal(frozen.package.content_revision,1);
  assert.equal(after.project.checkpoint.definition.title,'Newer shared '+kind);assert.equal(await a.evaluate(()=>JSON.stringify({...localStorage})),normal);assert.deepEqual(errors,[]);await a.screenshot({path:`${output}/${kind}-retry.png`});
  rows.push({kind,heldRealValidationWorker:true,secondTabPublicEdit:true,stalePublicationRefused:true,durableWinnerAndLibraryUnchanged:true,dialogRecoverable:true,headerConflictAndCopyAvailable:true,reloadedNewerDraft:true,retryVersion:1,frozenTitle:frozen.package.title,normalSavesUnchanged:true,browserErrors:errors});await context.close();
 }
 for(const p of paths)assert.equal(sha(await readFile(p)),inputs[p]);await writeFile(output+'/report.json',JSON.stringify({completed:true,inputs,rows,scope:'Public Save map/release, delayed worker loading, real second-tab title edit, native validation and atomic publication conflict, public reload/retry. Notifications unavailable to exercise commit-time source comparison.'},null,2)+'\n');console.log('PASS public map and release publication refuse newer second-tab drafts; dialogs recover, library remains unchanged and retries publish version 1 from the newer source.');
}finally{await closeValidationBrowser(browser,server);}
