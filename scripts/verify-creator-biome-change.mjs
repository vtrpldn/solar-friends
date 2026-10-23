import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const server=await serve(),base=`http://127.0.0.1:${server.address().port}`;let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/editor.html');await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
 await page.locator('[data-preset=camp]').click();await page.waitForFunction(()=>!document.querySelector('#creator-test').disabled&&document.querySelector('#creator-save-status').textContent.startsWith('Saved'));
 const id=new URL(page.url()).searchParams.get('project'),normal=await page.evaluate(()=>JSON.stringify({...localStorage}));
 const read=()=>page.evaluate(async id=>{const {ContentLibrary}=await import('/content-library.js');const l=new ContentLibrary();try{return (await l.getProject(id)).checkpoint.definition;}finally{l.close();}},id);
 const original=await read();
 await page.locator('#creator-biome-target').selectOption('caatinga');await page.locator('#creator-biome-preview').click();
 await page.waitForFunction(()=>document.querySelector('#creator-biome-map').width>0);assert(await page.locator('#creator-biome-apply').isDisabled());assert(await page.locator('[data-species-from]').count()>0);
 await page.getByRole('button',{name:'Keep current landscape',exact:true}).click();assert.deepEqual(await read(),original);assert.equal(await page.locator('#creator-biome-target').inputValue(),'mata-atlantica');
 await page.locator('#creator-biome-target').selectOption('caatinga');await page.locator('#creator-biome-preview').click();
 await page.locator('#creator-biome-suggest').click();assert(await page.locator('#creator-biome-apply').isEnabled());
 await page.locator('#creator-biome-weather').selectOption('keep');await page.locator('#creator-biome-ground').selectOption('defaults');
 await page.locator('#creator-biome-map').scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('#creator-biome-map').getAttribute('aria-busy')==='false');await page.screenshot({path:'/private/tmp/solar-biome-change-preview.png'});
 await page.locator('#creator-biome-apply').click();await page.locator('#creator-save').click();await page.waitForFunction(()=>document.querySelector('#creator-save-status').textContent.startsWith('Saved'));
 const changed=await read();assert.equal(changed.map.biome.id,'caatinga');assert.equal(changed.rules.weather.season_days,21);assert.deepEqual(changed.start,original.start);assert.deepEqual(changed.map.river,original.map.river);assert.deepEqual(changed.map.deposits,original.map.deposits);assert.deepEqual(changed.map.nature.map(p=>[p.id,p.x,p.y,p.size]),original.map.nature.map(p=>[p.id,p.x,p.y,p.size]));
 await page.locator('#creator-undo').click();assert.equal(await page.locator('#creator-biome-target').inputValue(),'mata-atlantica');await page.locator('#creator-save').click();assert.deepEqual(await read(),original);
 await page.locator('#creator-redo').click();await page.locator('#creator-save').click();assert.deepEqual(await read(),changed);
 await page.reload();await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');assert.equal(await page.locator('#creator-biome-target').inputValue(),'caatinga');
 await page.locator('#creator-test').click();await page.waitForFunction(()=>window.solarDev&&document.querySelector('.creation-session'));
 const snapshot=await page.evaluate(()=>window.solarDev.snapshot());assert.equal(snapshot.village.scenario.definition.map.biome.id,'caatinga');assert.equal(snapshot.environment.weather.season_days,21);assert.deepEqual(snapshot.village.scenario.definition.start,original.start);
 await page.getByRole('button',{name:'Return to editor',exact:true}).click();await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage})),normal);
 assert.deepEqual(errors,[]);console.log('PASS player biome preview/cancel, explicit plant choices, weather/soil options, one-step undo/redo, durable reload, native playtest and unchanged normal saves.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
