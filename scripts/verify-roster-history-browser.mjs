import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/?dev-scenario=cook`);await page.waitForFunction(()=>window.solarDev?.scenario()==='cook'&&window.solarDev.snapshot().village.version===44);
 if(!await page.locator('#dev-dialog').isVisible())await page.locator('#dev-button').click();
 await page.getByRole('button',{name:'Single tick · ¼ second',exact:true}).click();
 const before=await page.evaluate(()=>window.solarDev.snapshot()),old=structuredClone(before);assert(before.village.situations.active);
 old.village.version=41;old.village.situations.cooking=old.village.situations.cooking.map(day=>Array.from({length:5},(_,id)=>day[id]??0));
 Object.assign(old.village.situations.active,{response:'day_off',agreed:old.village.minutes,helpers:2,recovery:36});
 old.village.logistics.schema=1;old.village.logistics.retry_after=[old.village.minutes+20,0,0,0,0];old.village.events.push('Legacy roster history browser check');
 await page.locator('#dev-import-file').setInputFiles({name:'old-roster-history.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(old))});
 await page.waitForFunction(()=>window.solarDev.snapshot().village.events.at(-1)==='Legacy roster history browser check');
 const after=await page.evaluate(()=>window.solarDev.snapshot());assert.equal(after.village.version,44);assert.equal(after.village.logistics.schema,2);
 assert.deepEqual(after.village.situations.cooking,before.village.situations.cooking);assert.deepEqual(after.village.situations.active.helpers,[1]);assert.equal(after.village.situations.active.recovery,36);
 assert.deepEqual(after.village.logistics.retry_after,{0:old.village.minutes+20});assert.deepEqual(after.residents,before.residents);
 for(const field of ['economy','skills','workforce','simulation'])assert.deepEqual(after.village[field],before.village[field]);
 await page.locator('#dev-close').click();await page.locator('#open-situations').click();
 assert.match(await page.locator('.situation-progress').textContent(),/1\/1 neighbour cooked · Bento/);assert.match(await page.locator('.situation-progress').textContent(),/36\/72/);
 await page.screenshot({path:'/private/tmp/solar-roster-history.png'});
 assert.deepEqual(await page.evaluate(()=>window.solarDev.snapshot()),after);
 assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),null);assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-sandbox')),null);assert.deepEqual(errors,[]);
 console.log('PASS actual legacy history import preserves cooking, agreement, helpers, recovery and transport cooldown; Situations shows the right helper and progress while needs/jobs/skills and normal saves remain unchanged.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
