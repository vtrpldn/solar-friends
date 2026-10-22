import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/?dev-scenario=leisure`);await page.waitForFunction(()=>window.solarDev?.scenario()==='leisure');
 const source=JSON.parse(await readFile('artifacts/gathering/table.json','utf8')),legacy=structuredClone(source),p=legacy.village.progress;
 legacy.village.version=40;p.hobby_mask=21;p.social_mask=10;delete p.hobby_people;delete p.social_people;delete p.gathering_delivery.portions;delete p.gathering_delivery.required_guests;
 const mask=ids=>ids.reduce((value,id)=>value|(1<<id),0);
 p.invited=mask(p.invited);p.attended=mask(p.attended);p.gathering_delivery.invited=mask(p.gathering_delivery.invited);p.gathering_delivery.attended=mask(p.gathering_delivery.attended);
 legacy.village.events.push('Legacy participation browser check');
 if(!await page.locator('#dev-dialog').isVisible())await page.locator('#dev-button').click();
 await page.locator('#dev-import-file').setInputFiles({name:'old-participation.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});
 await page.waitForFunction(()=>window.solarDev.snapshot().village.events.at(-1)==='Legacy participation browser check');
 const after=await page.evaluate(()=>window.solarDev.snapshot());assert.equal(after.village.version,45);assert.deepEqual(after.village.progress.hobby_people,[0,2,4]);assert.deepEqual(after.village.progress.social_people,[1,3]);
 for(const field of ['invited','attended','gathering_delivery'])assert.deepEqual(after.village.progress[field],source.village.progress[field]);
 assert.deepEqual(after.residents,source.residents);
 for(const field of ['economy','skills','workforce','simulation','logistics','supplies'])assert.deepEqual(after.village[field],source.village[field]);
 await page.locator('#dev-close').click();await page.locator('[data-panel=community-panel]').click();
 assert.match(await page.locator('#gathering-status').textContent(),new RegExp(`${after.village.progress.attended.length} ${after.village.progress.attended.length===1?'neighbour':'neighbours'} arrived`));
 await page.screenshot({path:'/private/tmp/solar-social-participation.png'});
 await page.locator('#dev-button').click();await page.locator('#dev-minutes').fill('200');await page.locator('#dev-advance').click();
 const complete=await page.evaluate(()=>window.solarDev.snapshot());assert.equal(complete.village.progress.gathering_delivery.phase,'complete');assert(complete.village.progress.gathering_delivery.attended.length>=3);assert.equal(complete.village.supplies.portions_eaten,5);
 await page.locator('#dev-close').click();await page.locator('[data-panel=community-panel]').click();assert.match(await page.locator('#gathering-status').textContent(),/1 gathering shared/);
 assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),null);assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-sandbox')),null);assert.deepEqual(errors,[]);
 console.log('PASS legacy milestone/attendance import preserves live delivery, jobs, needs, skills and stock; People displays real arrivals and completes the gathering once without touching normal saves.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
