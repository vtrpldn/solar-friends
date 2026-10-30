import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const output=process.argv[2]??'/tmp/solar-preparation-recovery';await mkdir(output,{recursive:true});
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/editor.html`);await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
 await page.locator('[data-preset=camp]').click();await page.waitForFunction(()=>document.querySelector('#creator-save-status').textContent==='Saved on this device');await page.waitForFunction(()=>document.querySelector('#creator-map').getAttribute('aria-busy')==='false');await page.locator('#creator-save').click();await page.waitForFunction(()=>document.querySelector('#creator-save-status').textContent==='Saved on this device');
 const result=await page.evaluate(async()=>{
  const {runPreparation}=await import('/editor/run-preparation.js'),{ContentLibrary}=await import('/content-library.js');
  const stored=async()=>{const l=new ContentLibrary();try{const projects=await l.listProjects();return JSON.stringify({projects,records:await Promise.all(projects.map(p=>l.getProject(p.id))),runs:await l.listRuns(),maps:await l.listMaps(),releases:await l.listReleases()});}finally{l.close();}};
  const before=await stored(),normal=JSON.stringify({...localStorage}),rows=[];
  for(const kind of ['messageerror','error','null','unknown','callback','post','constructor','timeout','cancel','constructor-cancel','success']){
   let terminated=0,sent=0,worker;const button=document.querySelector('#creator-test');button.focus();
   const promise=runPreparation({request:{privateDraft:'unchanged'},title:'Preparing recovery check',starting:'Checking…',note:'The draft stays unchanged.',cancelMessage:'Cancelled',failureMessage:'Please retry preparation.',timeoutMessage:'Preparation timed out.',timeoutMs:kind==='timeout'?5:1000,result:data=>{if(kind==='callback')throw Error('Cannot receive result');return data.ready;},workerFactory:()=>{
    if(kind==='constructor')throw Error('Cannot start worker');
    worker={terminate(){terminated++;},postMessage(){sent++;if(kind==='post')throw Error('Cannot send');}};
    if(kind==='constructor-cancel')document.querySelector('.creator-prepare-dialog button').click();return worker;
   }});
   if(kind==='messageerror')worker.onmessageerror();if(kind==='error')worker.onerror({preventDefault(){}});
   if(kind==='null')worker.onmessage({data:null});if(kind==='unknown')worker.onmessage({data:{unexpected:true}});
   if(kind==='callback')worker.onmessage({data:{ready:true}});if(kind==='cancel')document.querySelector('.creator-prepare-dialog button').click();
   if(kind==='success'){worker.onmessage({data:{stage:'Finishing…'}});worker.onmessage({data:{ready:{accepted:true}}});}
   let value,error;try{value=await promise;}catch(e){error={name:e.name,message:e.message};}
   if(worker?.onmessage)worker.onmessage({data:{ready:{late:true}}});
   rows.push({kind,terminated,sent,value,error,dialogRemoved:!document.querySelector('.creator-prepare-dialog'),focusRestored:document.activeElement===button,unchanged:await stored()===before&&JSON.stringify({...localStorage})===normal});
  }
  return rows;
 });
 for(const row of result){assert.equal(row.dialogRemoved,true,row.kind);assert.equal(row.focusRestored,true,row.kind);assert.equal(row.unchanged,true,row.kind);assert.equal(row.terminated,row.kind==='constructor'?0:1,row.kind);if(row.kind==='success')assert.deepEqual(row.value,{accepted:true});else assert(row.error?.message,row.kind);}
 await page.route('**/scenario-prepare-worker.js',route=>route.fulfill({contentType:'text/javascript',body:'self.onmessage=()=>self.postMessage({unexpected:true});'}));
 await page.locator('#creator-test').click();await page.waitForFunction(()=>!document.querySelector('.creator-prepare-dialog')&&!document.querySelector('#creator-toast').hidden&&document.querySelector('#creator-toast').textContent.includes('could not be prepared'));
 assert(await page.locator('#creator-test').isEnabled());await page.screenshot({path:output+'/retry-feedback.png'});await page.unroute('**/scenario-prepare-worker.js');
 assert.deepEqual(errors,[]);await writeFile(output+'/report.json',JSON.stringify({rows:result,publicMalformedWorkerFeedback:true,browserErrors:errors},null,2)+'\n');console.log('PASS eleven preparation failure/success paths and public malformed-worker feedback: immediate rejection, worker disposal, late-result isolation, dialog cleanup, focus restoration and unchanged draft/library/normal saves.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
