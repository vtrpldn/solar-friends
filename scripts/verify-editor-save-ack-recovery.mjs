import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const output=process.argv[2]??'/tmp/solar-editor-save-ack';await mkdir(output,{recursive:true});const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/editor.html`);await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');await page.locator('[data-preset=camp]').click();
 const ready=()=>page.waitForFunction(()=>document.querySelector('#creator-map').getAttribute('aria-busy')==='false'&&document.querySelector('#creator-save-status').textContent==='Saved on this device');
 await ready();await page.locator('#creator-save').click();await ready();
 const id=new URL(page.url()).searchParams.get('project'),read=()=>page.evaluate(async id=>{const {ContentLibrary}=await import('/content-library.js'),l=new ContentLibrary(undefined,{broadcast:false});try{return await l.getProject(id);}finally{l.close();}},id);
 const before=await read(),normal=await page.evaluate(()=>JSON.stringify({...localStorage})),worker=await readFile('web/project-save-worker.js','utf8');
 // The real worker commits the real IndexedDB transaction. Only its reply is lost.
 await page.route('**/project-save-worker.js',route=>route.fulfill({contentType:'text/javascript',body:'const send=self.postMessage.bind(self);self.postMessage=(value)=>send(value.saved?{error:"Simulated reply lost after commit"}:value);\n'+worker}));
 await page.locator('#creator-title').fill('Our saved clearing');await page.locator('#creator-title').press('Tab');await page.locator('#creator-save').click();await ready();
 const recovered=await read();assert.equal(recovered.revision,before.revision+1);assert.equal(recovered.checkpoint.definition.title,'Our saved clearing');assert.deepEqual(recovered.previous.checkpoint.definition,before.checkpoint.definition);assert.deepEqual(recovered.view,before.view);assert.equal(typeof recovered.saveReceipt,'string');
 assert.equal(await page.evaluate(id=>sessionStorage.getItem('solar-friends-project-recovery:'+id),id),null);assert.doesNotMatch(await page.locator('#creator-toast').textContent(),/Simulated reply|could not be saved|another tab/i);await page.screenshot({path:output+'/saved-after-lost-reply.png'});
 await page.unroute('**/project-save-worker.js');await page.locator('#creator-title').fill('Our next clearing');await page.locator('#creator-title').press('Tab');await page.locator('#creator-save').click();await ready();const following=await read();assert.equal(following.revision,recovered.revision+1);assert.equal(following.checkpoint.definition.title,'Our next clearing');
 await page.route('**/project-save-worker.js',route=>route.fulfill({contentType:'text/javascript',body:'const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==="heads")throw new DOMException("Injected device storage full","QuotaExceededError");return put.apply(this,args);};\n'+worker}));
 await page.locator('#creator-title').fill('Our unsaved clearing');await page.locator('#creator-title').press('Tab');await page.locator('#creator-save').click();await page.waitForFunction(()=>document.querySelector('#creator-save-status').textContent.startsWith('Could not save'));
 assert.deepEqual(await read(),following,'Quota failure must retain every byte of the last good project');
 const recovery=await page.evaluate(id=>JSON.parse(sessionStorage.getItem('solar-friends-project-recovery:'+id)),id);assert.equal(recovery.checkpoint.definition.title,'Our unsaved clearing');
 await page.screenshot({path:output+'/quota-recovery.png'});const downloading=page.waitForEvent('download');await page.locator('#creator-export').click();const downloaded=await downloading;await downloaded.saveAs(output+'/unsaved.solar-scenario');assert.equal(JSON.parse(await readFile(output+'/unsaved.solar-scenario','utf8')).title,'Our unsaved clearing');
 await page.unroute('**/project-save-worker.js');await page.locator('#creator-save').click();await ready();assert.equal((await read()).revision,following.revision+1);assert.equal(await page.evaluate(id=>sessionStorage.getItem('solar-friends-project-recovery:'+id),id),null);
 await page.reload();await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');await ready();assert.equal(await page.locator('#creator-title').inputValue(),'Our unsaved clearing');
 await page.locator('#creator-undo').click();await page.locator('#creator-save').click();await ready();assert.equal((await read()).checkpoint.definition.title,'Our next clearing');
 assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage})),normal);assert.deepEqual(errors,[]);
 await writeFile(output+'/report.json',JSON.stringify({realWorkerCommitted:true,lostReplyReconciled:true,oneCommitOnly:true,previousCheckpointPreserved:true,viewUnchanged:true,recoveryCopyClearedOnlyAfterConfirmation:true,noFalseConflictOrError:true,followingSave:true,injectedQuotaAfterBodyPut:true,injectedQuotaPreservesDurableRecord:true,failedSaveRecoveryCopyRetained:true,unsavedDraftExported:true,quotaRetry:true,reloadAndUndo:true,normalSavesUnchanged:true,browserErrors:errors},null,2)+'\n');
 console.log('PASS public editor Save after a real committed/lost reply, exact previous checkpoint and view, one commit, cleared confirmed recovery copy, following Save, reload, Undo and unchanged normal saves.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
