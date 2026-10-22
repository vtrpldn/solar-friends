import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/editor.html`);await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
 const fixtures=await page.evaluate(async()=>{
  const {ContentLibrary}=await import('/content-library.js'),library=new ContentLibrary();await library.listProjects();
  const project={id:'damaged-draft',revision:9,title:'Damaged draft',schema:999,checkpoint:{definition:null,history:['retain this']},previous:{checkpoint:{definition:{title:'Earlier draft'}}},unknown:{keep:true}};
  const run={id:'future-village',revision:3,title:'Future village',schema:999,sessionKind:'scenario',snapshot:'unreadable future snapshot',previousSnapshot:'previous snapshot',definition:null,unknown:[1,2,3]};
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('solar-friends-creations',6);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  await new Promise((resolve,reject)=>{const tx=db.transaction(['projects','runs','heads'],'readwrite');for(const [kind,store,record]of [['project','projects',project],['run','runs',run]]){tx.objectStore(store).put(record);tx.objectStore('heads').put({key:kind+':'+record.id,kind,id:record.id,title:record.title,revision:record.revision,sessionKind:record.sessionKind,updatedAt:Date.now()});}tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();library.close();return {project,run};
 });
 await page.reload();await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
 for(const [kind,record]of Object.entries(fixtures)){
  const downloadPromise=page.waitForEvent('download');await page.locator(`[data-backup-${kind}="${record.id}"]`).click();const download=await downloadPromise;
  assert.deepEqual(JSON.parse(await readFile(await download.path(),'utf8')),{format:'solar-friends-recovery',schema:1,kind,record});
 }
 const retained=await page.evaluate(async()=>{const {ContentLibrary}=await import('/content-library.js'),l=new ContentLibrary();try{return {project:await l.getProject('damaged-draft'),run:await l.getRun('future-village')};}finally{l.close();}});
 assert.deepEqual(retained,fixtures);
 const backup=await page.evaluate(async()=>{const {Game}=await import('/pkg/solar_friends.js'),g=new Game();try{return {format:'solar-friends-recovery',schema:1,kind:'project',record:{format:'solar-friends-project',schema:1,id:'original-backup',checkpoint:{schema:1,definition:null},previous:{checkpoint:{schema:1,definition:JSON.parse(g.scenario_template('sandbox'))}},attribution:[]}};}finally{g.free();}});
 await page.locator('#creator-import').setInputFiles({name:'recover.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
 await page.locator('#creator-library-dialog').waitFor({state:'hidden'});await page.waitForFunction(()=>document.querySelector('#creator-save-status').textContent.startsWith('Saved'));
 assert(!page.url().includes('original-backup'));
 const recoveryCheck=await page.evaluate(async()=>{const {ContentLibrary}=await import('/content-library.js'),l=new ContentLibrary();try{const heads=await l.listProjects();return {count:heads.length,original:await l.getProject('damaged-draft'),copy:await l.getProject(new URL(location.href).searchParams.get('project'))};}finally{l.close();}});
 assert.equal(recoveryCheck.count,2);assert.deepEqual(recoveryCheck.original,fixtures.project);assert(recoveryCheck.copy.checkpoint.definition.start.residents.length>0);
 const refusal=await page.evaluate(async()=>{const {recoveredDraft}=await import('/editor/record-recovery.js');let rejected=0;for(const file of [{format:'solar-friends-recovery',schema:99,kind:'project'},{format:'solar-friends-recovery',schema:1,kind:'run'}])try{recoveredDraft(file,()=>({ok:true}));}catch{rejected++;}return rejected;});assert.equal(refusal,2);
 assert.deepEqual(errors,[]);console.log('PASS: public backups preserve damaged/future draft and village records, unknown fields, history and previous checkpoints without mutation; previous-checkpoint import creates an independent validated draft and rejects unsupported envelopes.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
