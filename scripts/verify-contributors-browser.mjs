import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/?dev-scenario=leisure`);
 await page.waitForFunction(()=>window.solarDev?.scenario()==='leisure'&&window.solarDev.snapshot().village.version===43);
 const before=await page.evaluate(()=>window.solarDev.snapshot());assert(before.village.buildings.length);
 const old=structuredClone(before);old.village.version=37;
 for(const b of [...old.village.buildings,...old.village.production.batches])b.contributors=b.contributors.reduce((mask,id)=>mask|(1<<id),0);
 old.village.buildings[0].contributors=23;old.village.events.push('Legacy contributor import verification');
 if(!await page.locator('#dev-dialog').isVisible())await page.locator('#dev-button').click();
 await page.locator('#dev-import-file').setInputFiles({name:'legacy-contributors.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(old))});
 await page.waitForFunction(()=>window.solarDev.snapshot().village.events.at(-1)==='Legacy contributor import verification');
 const after=await page.evaluate(()=>window.solarDev.snapshot());assert.equal(after.village.version,43);
 assert.deepEqual(after.village.buildings[0].contributors,[0,1,2,4]);
 assert.deepEqual(after.residents,before.residents);assert.deepEqual(after.village.economy,before.village.economy);assert.deepEqual(after.village.skills,before.village.skills);assert.deepEqual(after.village.workforce,before.village.workforce);assert.deepEqual(after.village.simulation,before.village.simulation);assert.deepEqual(after.village.progress,before.village.progress);
 assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),null);assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-sandbox')),null);assert.deepEqual(errors,[]);
 await page.goto(`http://127.0.0.1:${server.address().port}/?resident-preview`);await page.waitForFunction(()=>window.solarDev?.snapshot().village.version===43&&document.querySelector('.artwork-preview-notice'));
 const preview=await page.evaluate(()=>window.solarDev.snapshot());assert.equal(preview.village.map_size,64);assert(preview.village.buildings.every(b=>Array.isArray(b.contributors)));
 const camera=await page.locator('#world').getAttribute('data-camera-center');const centre=JSON.parse(camera);
 const xs=preview.residents.map(r=>r.x),ys=preview.residents.map(r=>r.y);assert(Math.abs(centre.x-(Math.min(...xs)+Math.max(...xs))/2)<1);assert(Math.abs(centre.y-(Math.min(...ys)+Math.max(...ys))/2)<1);
 await page.screenshot({path:'/private/tmp/solar-resident-preview-contributors.png'});assert.deepEqual(errors,[]);
 console.log('PASS legacy building contributor import preserves exact worker identities, learned progress, residents, wages, activity history and normal saves.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
