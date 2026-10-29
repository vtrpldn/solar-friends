import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {applyExampleResidentLooks,exampleResidentLooks} from './example-resident-looks.mjs';
const output='artifacts/example-modular-authoring',sha=b=>createHash('sha256').update(b).digest('hex'),server=await serve(0);let browser;
const withoutCosmetics=d=>{const v=structuredClone(d);delete v.id;delete v.map.id;for(const r of v.start.residents)delete r.appearance;return v;};
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await mkdir(output,{recursive:true});
 for(const id of Object.keys(exampleResidentLooks)){
  const file=`web/examples/${id}.solar-scenario`,beforeRaw=await readFile(file,'utf8'),before=JSON.parse(beforeRaw);await page.goto(`http://127.0.0.1:${server.address().port}/editor.html`);await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');await page.locator('#creator-import').setInputFiles(file);await page.locator('#creator-library-dialog').waitFor({state:'hidden'});
  const captures=[];await applyExampleResidentLooks(page,id,{capture:async(name,page)=>{const file=`${id}-${captures.length+1}.png`;await page.screenshot({path:output+'/'+file});captures.push({name,file});}});
  const pending=page.waitForEvent('download');await page.locator('#creator-export').click();const raw=await readFile(await(await pending).path(),'utf8'),after=JSON.parse(raw);assert.deepEqual(withoutCosmetics(after),withoutCosmetics(before),'Appearance authoring altered noncosmetic scenario fields');
  assert.deepEqual(after.start.residents.map(r=>r.id),before.start.residents.map(r=>r.id),'Resident identities changed');for(const name of Object.keys(exampleResidentLooks[id]))assert.equal(after.start.residents.find(r=>r.name===name).appearance.schema,2);
  await writeFile(output+'/'+id+'-before.solar-scenario',beforeRaw);await writeFile(output+'/'+id+'-report.json',JSON.stringify({id,beforeSha256:sha(beforeRaw),afterSha256:sha(raw),residentIdsPreserved:true,noncosmeticsPreserved:true,newCopyDocumentIds:true,captures,scope:'Public import, character creator appearance controls and export. Import gives the document/map new copy identities; resident IDs and all noncosmetic scenario data remain exact. Completion requires a new playthrough.'},null,2)+'\n');await writeFile(file,raw);
 }
 assert.deepEqual(errors,[]);console.log('PASS both example casts authored with modular appearances through public controls; all resident identities and noncosmetic scenario data preserved.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
