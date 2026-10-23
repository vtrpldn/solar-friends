import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const output=process.argv[2]??'/tmp/solar-terrain-save';await mkdir(output,{recursive:true});const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));let delay=false;
 await page.route('**/terrain-paint-worker.js',async route=>{if(delay)await new Promise(resolve=>setTimeout(resolve,1800));await route.continue().catch(()=>{});});
 await page.goto(`http://127.0.0.1:${server.address().port}/editor.html`);await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');await page.locator('[data-preset=camp]').click();
 await page.waitForFunction(()=>document.querySelector('#creator-map').getAttribute('aria-busy')==='false'&&document.querySelector('#creator-save-status').textContent==='Saved on this device');
 const read=()=>page.evaluate(async()=>{const {ContentLibrary}=await import('/content-library.js'),library=new ContentLibrary(),id=new URLSearchParams(location.search).get('project');try{const project=await library.getProject(id);return {definition:project.checkpoint.definition,preview:await library.getPreview('project',id)};}finally{library.close();}});
 const readUntil=async test=>{const deadline=Date.now()+30000;while(Date.now()<deadline){const value=await read();if(test(value))return value;await new Promise(resolve=>setTimeout(resolve,50));}throw Error('Stored preview did not become ready');};
 const before=await readUntil(value=>!!value.preview);
 delay=true;await page.locator('[data-tool=road]').click();
 const point=await page.locator('#creator-map').evaluate((canvas,[x,y])=>{const o=JSON.parse(canvas.dataset.origin),s=Number(canvas.dataset.scale),r=canvas.getBoundingClientRect();return {x:r.left+o.x+(x-y)*34*s,y:r.top+o.y+(x+y)*17*s};},[before.definition.map.camp[0]+1,before.definition.map.camp[1]+3]);
 await page.mouse.click(point.x,point.y);await page.waitForFunction(()=>document.querySelector('#creator-map').getAttribute('aria-busy')==='true');
 const saveMs=await page.evaluate(()=>{const start=performance.now();document.querySelector('#creator-save').click();return performance.now()-start;});
 await page.waitForFunction(()=>document.querySelector('#creator-save-status').textContent==='Saved on this device');
 assert.equal(await page.locator('#creator-map').getAttribute('aria-busy'),'true','Draft saves before delayed terrain finishes');const pending=await read();assert.equal(pending.definition.start.roads.length,before.definition.start.roads.length+1);assert.equal(pending.preview,before.preview,'Pending paint preserves previous stored preview');
 await page.screenshot({path:output+'/pending.png'});
 await page.waitForFunction(()=>document.querySelector('#creator-map').getAttribute('aria-busy')==='false');
 await page.waitForFunction(()=>document.querySelector('#creator-save-status').textContent==='Saved on this device');
 // Status may still display the earlier save while the ready callback's
 // autosave is scheduled. Read storage until the new preview is committed.
 const completed=await readUntil(value=>!!value.preview&&value.preview!==before.preview);assert.deepEqual(completed.definition,pending.definition);assert.notEqual(completed.preview,before.preview);await page.screenshot({path:output+'/completed.png'});
 await page.reload();await page.waitForFunction(()=>document.body.dataset.creatorReady==='true'&&document.querySelector('#creator-map').getAttribute('aria-busy')==='false');const reopened=await read();assert.deepEqual(reopened.definition,completed.definition);assert.equal(reopened.preview,completed.preview);
 assert.deepEqual(errors,[]);const report={saveSynchronousMs:saveMs,savedAuthoredRoadWhilePainting:true,previousPreviewPreserved:true,completedPreviewUpdatedAutomatically:true,definitionUnchangedByPreview:true,reloadExact:true};await writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
