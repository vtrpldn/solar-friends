import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {closeValidationBrowser} from './close-validation-browser.mjs';
const output=process.argv[2]??'artifacts/editor-concurrent-tabs';await mkdir(output,{recursive:true});
const paths=['scripts/verify-editor-concurrent-tabs.mjs','web/editor/index.js','web/editor/document.js','web/content-library.js','web/project-save-worker.js'];
const sha=b=>createHash('sha256').update(b).digest('hex'),inputs=Object.fromEntries(await Promise.all(paths.map(async p=>[p,sha(await readFile(p))])));
const server=await serve(0);let browser;
const rows=[];
try{
 browser=await chromium.launch({headless:true});
 for(const notification of ['broadcast','unavailable']){
  const context=await browser.newContext({viewport:{width:1600,height:1000}}),errors=[];
  if(notification==='unavailable')await context.addInitScript(()=>{window.BroadcastChannel=undefined;});
  const a=await context.newPage(),b=await context.newPage();
  for(const p of [a,b]){p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());}
  const url=`http://127.0.0.1:${server.address().port}/editor.html`,ready=p=>p.waitForFunction(()=>document.body.dataset.creatorReady==='true'),saved=p=>p.waitForFunction(()=>document.querySelector('#creator-save-status').textContent.startsWith('Saved')&&document.querySelector('#creator-map').getAttribute('aria-busy')==='false');
  const read=(p,id)=>p.evaluate(async id=>{const {ContentLibrary}=await import('/content-library.js'),l=new ContentLibrary(undefined,{broadcast:false});try{return await l.getProject(id);}finally{l.close();}},id);
  await a.goto(url);await ready(a);await a.locator('[data-preset=camp]').click();await saved(a);
  await a.locator('#creator-title').fill('Shared clearing');await a.locator('#creator-title').press('Tab');await a.locator('#creator-save').click();await saved(a);
  const id=new URL(a.url()).searchParams.get('project');const normal=await a.evaluate(()=>JSON.stringify({...localStorage}));
  await b.goto(url);await ready(b);await b.locator(`[data-open-project="${id}"]`).click();await saved(b);
  await b.locator('#creator-title').fill('Second tab clearing');await b.locator('#creator-title').press('Tab');await b.locator('#creator-save').click();await saved(b);
  const winner=await read(b,id);assert.equal(winner.checkpoint.definition.title,'Second tab clearing');
  if(notification==='broadcast')await a.waitForFunction(()=>document.querySelector('#creator-save-status').textContent.startsWith('Changed in another tab'));
  await a.locator('#creator-title').fill('First tab local clearing');await a.locator('#creator-title').press('Tab');await a.locator('#creator-save').click();
  await a.waitForFunction(()=>document.querySelector('#creator-save-status').textContent.startsWith('Changed in another tab'));
  assert.deepEqual(await read(a,id),winner,'Stale tab overwrote the winner');
  const local=await a.evaluate(id=>JSON.parse(sessionStorage.getItem('solar-friends-project-recovery:'+id)),id);assert.equal(local.checkpoint.definition.title,'First tab local clearing');
  assert(await a.locator('#creator-recovery-copy').isVisible());await a.screenshot({path:`${output}/${notification}-conflict.png`});
  await a.locator('#creator-recovery-copy').click();await a.waitForFunction(old=>new URL(location.href).searchParams.get('project')!==old,id);await saved(a);
  const copyId=new URL(a.url()).searchParams.get('project'),copy=await read(a,copyId),expected=structuredClone(local.checkpoint.definition);
  expected.id=copyId;expected.map.id='map-'+copyId;expected.title+=' · copy';expected.revision=1;expected.map.revision=1;
  assert.deepEqual(copy.checkpoint.definition,expected,'Save a copy lost or changed local authored content');assert.deepEqual(await read(a,id),winner,'Saving the local copy changed the winner');
  await a.reload();await ready(a);await saved(a);assert.equal(await a.locator('#creator-title').inputValue(),expected.title);
  await b.reload();await ready(b);await saved(b);assert.equal(await b.locator('#creator-title').inputValue(),'Second tab clearing');
  const originalAfter=await read(b,id),copyAfter=await read(a,copyId);assert.deepEqual(originalAfter.checkpoint,winner.checkpoint);assert.deepEqual(copyAfter.checkpoint,copy.checkpoint);
  assert.equal(await a.evaluate(()=>JSON.stringify({...localStorage})),normal);assert.deepEqual(errors,[]);await a.screenshot({path:`${output}/${notification}-copy.png`});
  rows.push({notification,conflictDetected:true,winnerExactBeforeAndAfterCopy:true,localRecoveryRetained:true,copyDefinitionExact:true,bothReloadExactly:true,normalSavesUnchanged:true,browserErrors:errors});await context.close();
 }
 for(const p of paths)assert.equal(sha(await readFile(p)),inputs[p]);await writeFile(output+'/report.json',JSON.stringify({completed:true,inputs,rows,scope:'Two real editor tabs in one isolated browser context; ordinary title edits, Save, conflict Save a copy and reload. Broadcast present and unavailable. No direct storage writes or simulated LibraryConflict.'},null,2)+'\n');
 console.log('PASS two real editor tabs preserve both edits, with broadcast and without notifications: revision conflict, recovery copy, exact independent reloads and unchanged normal saves.');
}finally{await closeValidationBrowser(browser,server);}
