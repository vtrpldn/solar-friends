import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const output=process.argv[2]??'artifacts/authored-import-errors';await mkdir(output,{recursive:true});
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/editor.html`);await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');await page.locator('[data-preset=camp]').click();
 const ready=()=>page.waitForFunction(()=>document.querySelector('#creator-map').getAttribute('aria-busy')==='false'&&document.querySelector('#creator-save-status').textContent.startsWith('Saved'));await ready();
 const id=new URL(page.url()).searchParams.get('project');
 const stored=()=>page.evaluate(async id=>{const {ContentLibrary}=await import('/content-library.js'),library=new ContentLibrary(undefined,{broadcast:false});try{return {project:await library.getProject(id),projects:await library.listProjects(),presets:await library.listResidentPresets(),maps:await library.listMaps(),releases:await library.listReleases()};}finally{library.close();}},id);
 const samples=['null','[]','42','"a resident"','true','{"name": "private-import-marker",','<script>window.importExecuted=true</script>'];let checked=0;
 await page.locator('#creator-library').click();await page.waitForFunction(()=>document.querySelector('#creator-library-dialog').open);const before=await stored();
 for(const raw of samples){
  await page.locator('#creator-import').setInputFiles({name:'invalid.solar-scenario',mimeType:'application/json',buffer:Buffer.from(raw)});await page.waitForFunction(()=>document.querySelector('#creator-import').files.length===0);
  const message=await page.locator('#creator-library-status').textContent();assert.match(message,/readable creation/i);assert.doesNotMatch(message,/Cannot read|Unexpected token|JSON|private-import-marker|<script>/i);assert.deepEqual(await stored(),before);checked++;
 }
 await page.screenshot({path:output+'/creation-error.png'});assert.equal(await page.evaluate(()=>window.importExecuted),undefined);assert.deepEqual(errors,[]);
 const inputs={};for(const file of ['web/editor/index.js','web/editor/import-object.js','scripts/verify-authored-import-errors.mjs'])inputs[file]=createHash('sha256').update(await readFile(file)).digest('hex');
 await writeFile(output+'/report.json',JSON.stringify({passed:true,checked,samples,libraryUnchanged:true,draftIdentityUnchanged:true,noFileContentInErrors:true,noExecution:true,browserErrors:errors,inputs,scope:'Actual creation file controls reject malformed text and nonobject roots with readable messages. Exact saved project and collection heads retained. Not all native schema constraints or supported-package sharing.'},null,2)+'\n');console.log('PASS: 7 malformed creation imports use readable errors and preserve saved content.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
