import assert from 'node:assert/strict';
import {closeValidationBrowser} from './close-validation-browser.mjs';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
let notifyHeld;const held=new Promise(resolve=>{notifyHeld=resolve;});
const output=process.argv[2]??'artifacts/editor-interrupted-write',profile=await mkdtemp(join(tmpdir(),'solar-editor-write-crash-')),server=await serve(0,{async handle(_req,res,path){if(path==='/__write-held'){notifyHeld();res.writeHead(200).end('held');return true;}return false;}}),base=`http://127.0.0.1:${server.address().port}`;
const sha=b=>createHash('sha256').update(b).digest('hex'),paths=['scripts/verify-editor-interrupted-write.mjs','web/editor/index.js','web/editor/map-view.js','web/editor/document.js','web/content-library.js'];
const report={completed:false,inputs:Object.fromEntries(await Promise.all(paths.map(async p=>[p,sha(await readFile(p))]))),scope:'Abrupt SIGKILL of an explicitly owned disposable browser after a real project put succeeds inside a deliberately held-open IndexedDB transaction. Relaunch same isolated profile/origin and compare the last committed project/history. No power-loss or disk-failure claim.'};let context;
await mkdir(output,{recursive:true});
try{
 const launch=()=>chromium.launchPersistentContext(profile,{headless:true,args:['--enable-automation'],viewport:{width:1600,height:1000}});
 context=await launch();let page=context.pages()[0]??await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.crashProbeInstalled=true;window.addEventListener('beforeunload',()=>localStorage.setItem('solar-crash-test-unload','fired'));});
 await page.goto(base+'/editor.html');await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');await page.locator('[data-preset=camp]').click();
 const ready=()=>page.waitForFunction(()=>document.querySelector('#creator-map').getAttribute('aria-busy')==='false'&&document.querySelector('#creator-save-status').textContent.startsWith('Saved'));
 const saved=()=>page.evaluate(async()=>{const {ContentLibrary}=await import('/content-library.js'),library=new ContentLibrary(undefined,{broadcast:false});try{return await library.getProject(new URL(location.href).searchParams.get('project'));}finally{library.close();}});
 await ready();await page.locator('#creator-title').fill('Crash recovery clearing');await page.locator('#creator-title').press('Tab');await page.locator('[data-workspace=village]').click();await page.locator('[data-tool=road]').click();await page.locator('#creator-grid').uncheck();await page.locator('#creator-save').click();await ready();const initial=await saved();
 const point=async(x,y)=>page.locator('#creator-map').evaluate((canvas,{x,y})=>{const origin=JSON.parse(canvas.dataset.origin),scale=Number(canvas.dataset.scale),box=canvas.getBoundingClientRect();return {x:box.x+origin.x+(x-y)*34*scale,y:box.y+origin.y+(x+y)*17*scale};},{x,y});
 const stroke=async(from,to,release)=>{const a=await point(...from),b=await point(...to);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:6});if(release)await page.mouse.up();};
 await stroke([30,35],[32,35],true);await page.locator('#creator-save').click();await ready();const committed=await saved();assert(committed.checkpoint.definition.start.roads.length>initial.checkpoint.definition.start.roads.length,'Completed road stroke was not saved');
 const projectId=new URL(page.url()).searchParams.get('project');await writeFile(output+'/committed-project.json',JSON.stringify(committed,null,2)+'\n');
 // Hold the actual worker transaction alive with requests after its project put
 // succeeds. Notify through HTTP, independently of the worker save reply.
 const worker=await readFile('web/project-save-worker.js','utf8');
 const injection=`const originalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){const request=originalPut.apply(this,args);if(this.name==='projects'&&args[0]?.checkpoint?.definition?.title==='Interrupted transaction title'){request.addEventListener('success',()=>{const store=this;const keepAlive=()=>{const next=store.get('__validation_hold__');next.onsuccess=keepAlive;};keepAlive();fetch('/__write-held');});}return request;};\n`;
 await page.route('**/project-save-worker.js',route=>route.fulfill({contentType:'text/javascript',body:injection+worker}));
 await page.locator('#creator-title').fill('Interrupted transaction title');await page.locator('#creator-title').press('Tab');await page.locator('#creator-save').click();
 let timer;try{await Promise.race([held,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Real worker did not reach its held write transaction')),30000);})]);}finally{clearTimeout(timer);}
 report.writePhase={projectPutSucceeded:true,transactionKeptAlive:true,saveAcknowledged:false};assert(await page.locator('#creator-toast').isHidden()||await page.locator('#creator-toast').textContent()!=='Your creation is saved.','Stale saved toast during interrupted save');
 assert.equal(await page.evaluate(()=>window.crashProbeInstalled),true);assert.doesNotMatch(await page.locator('#creator-save-status').textContent(),/^Saved/);await page.screenshot({path:output+'/before-crash.png'});
 const browser=context.browser();assert(browser,'Need an owned persistent browser');const root=await browser.newBrowserCDPSession();const {arguments:args}=await root.send('Browser.getBrowserCommandLine');assert(args.includes('--user-data-dir='+profile),'Refuse to terminate a browser outside this disposable profile');const info=await root.send('SystemInfo.getProcessInfo'),owners=info.processInfo.filter(p=>p.type==='browser');assert.equal(owners.length,1);const pid=owners[0].id;assert(Number.isSafeInteger(pid)&&pid>1&&pid!==process.pid);
 report.ownedProcess={pid,profile,ownershipConfirmed:true,browserVersion:browser.version()};
 // Never send this signal to a PID inferred from a port or user browser.
 process.kill(pid,'SIGKILL');
 const deadline=Date.now()+10000;let gone=false;while(Date.now()<deadline){try{process.kill(pid,0);}catch(e){if(e.code==='ESRCH'){gone=true;break;}throw e;}await new Promise(r=>setTimeout(r,50));}assert(gone,'Owned browser process has not exited; do not relaunch it');report.processExitConfirmed=true;
 await context.close().catch(()=>{});context=null;context=await launch();page=context.pages()[0]??await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/editor.html');await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');assert.equal(await page.evaluate(()=>localStorage.getItem('solar-crash-test-unload')),null,'Crash unexpectedly ran graceful beforeunload handling');
 const durableBeforeOpen=await page.evaluate(async id=>{const {ContentLibrary}=await import('/content-library.js');const l=new ContentLibrary(undefined,{broadcast:false});try{return await l.getProject(id);}finally{l.close();}},projectId);assert.deepEqual(durableBeforeOpen,committed,'Interrupted write changed durable project metadata before opening');
 await page.locator(`[data-open-project="${projectId}"]`).click();await ready();const restored=await saved();assert.deepEqual(restored.checkpoint,committed.checkpoint,'Last committed document/history did not survive browser termination');assert.deepEqual(restored.view,committed.view,'Saved editor view did not survive browser termination');assert.equal(await page.locator('#creator-grid').isChecked(),false);assert.equal(await page.locator('#creator-title').inputValue(),'Crash recovery clearing');
 await page.screenshot({path:output+'/recovered.png'});await page.locator('#creator-undo').click();await page.locator('#creator-save').click();await ready();const undone=await saved();assert.deepEqual(undone.checkpoint.definition.start.roads,initial.checkpoint.definition.start.roads,'Recovered undo did not remove exactly the completed stroke');
 await page.locator('#creator-redo').click();await page.locator('#creator-save').click();await ready();const redone=await saved();assert.deepEqual(redone.checkpoint.definition,committed.checkpoint.definition,'Recovered redo changed the authored scenario');assert.deepEqual(errors,[]);
 report.projectId=projectId;report.checks={noStaleSavedToast:true,wholeRecordExact:true,checkpointExact:true,viewExact:true,uncommittedWriteExcluded:true,noGracefulUnload:true,undoExact:true,redoExact:true};for(const p of paths)assert.equal(sha(await readFile(p)),report.inputs[p]);report.completed=true;await writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');console.log('PASS real held-open project write, owned-browser SIGKILL, same-profile public-library recovery, exact committed checkpoint/view, no partial write or graceful unload and exact undo/redo.');
}finally{try{await closeValidationBrowser(context?.browser(),server);}finally{await rm(profile,{recursive:true,force:true});}}
