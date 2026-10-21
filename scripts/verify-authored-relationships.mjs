import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {readFile} from 'node:fs/promises';
import {relationshipStrength,newFriendships} from '../web/relationships.js';
assert.equal(relationshipStrength({42:{900:3}},42,900),3);assert.equal(relationshipStrength({},42,900),0);
assert(newFriendships({}, {42:{900:3}}));assert(!newFriendships({42:{900:3}},{42:{900:4}}));
const server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/editor.html`);await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
 await page.locator('[data-preset=camp]').click();
 await page.locator('#creator-residents > summary').click();
 for(const id of ['iara','bento']){
  const person=page.locator(`[data-resident="resident-${id}"]`);await person.locator(':scope > summary').click();
  await person.locator('[data-resident-field=name]').fill('Sam');await person.locator('[data-resident-field=name]').dispatchEvent('change');
 }
 await page.locator('#creator-residents > summary').click();
 await page.locator('#creator-relationships > summary').click();
 const bond=page.locator('[data-bond-from="resident-iara"][data-bond-to="resident-bento"]');
 await bond.fill('8');await bond.dispatchEvent('change');assert.equal(await bond.inputValue(),'8');
 await page.locator('#creator-undo').click();assert.equal(await bond.inputValue(),'0');
 await page.locator('#creator-redo').click();assert.equal(await bond.inputValue(),'8');
 await page.locator('[data-clear-bonds]').click();assert.equal(await bond.inputValue(),'0');
 await page.locator('#creator-undo').click();assert.equal(await bond.inputValue(),'8');
 await page.locator('#creator-save').click();await page.waitForFunction(()=>document.querySelector('#creator-save-status').textContent.startsWith('Saved'));
 await page.reload();await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
 assert.equal(await bond.inputValue(),'8');
 await page.locator('#creator-relationships').evaluate(el=>el.open=true);
 await bond.scrollIntoViewIfNeeded();await page.screenshot({path:'/private/tmp/solar-shared-history-editor.png'});
 const downloadPromise=page.waitForEvent('download');await page.locator('#creator-export').click();
 const download=await downloadPromise,path='/private/tmp/solar-shared-history.solar-scenario';await download.saveAs(path);
 const shared=JSON.parse(await readFile(path,'utf8'));assert.deepEqual(shared.start.relationships,[{from:'resident-iara',to:'resident-bento',memories:8}]);
 const previousUrl=page.url();await page.locator('#creator-library').click();await page.locator('#creator-import').setInputFiles(path);
 await page.waitForFunction(previous=>location.href!==previous,previousUrl);await page.waitForFunction(()=>!document.querySelector('#creator-test').disabled&&document.querySelector('#creator-save-status').textContent.startsWith('Saved'));
 assert.equal(await bond.inputValue(),'8');
 await page.locator('#creator-test').click();await page.waitForFunction(()=>window.solarDev&&document.querySelector('.creation-session'));
 const state=await page.evaluate(()=>window.solarDev.snapshot());assert.equal(state.village.version,39);
 assert.deepEqual(state.village.progress.friendships,{0:{1:8},1:{0:8}});
 assert.equal(state.village.scenario.definition.start.relationships[0].from,'resident-iara');
 await page.locator('[data-panel=community-panel]').click();await page.locator('#residents [data-resident="0"]').click();
 assert.equal(await page.locator('#person .friendship-note').textContent(),'Shared memories: Sam (8)');
 await page.screenshot({path:'/private/tmp/solar-shared-history-person.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS stable-ID shared-history controls, duplicate names, undo/redo/clear, durable editor reload, native playtest and real People memories.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
