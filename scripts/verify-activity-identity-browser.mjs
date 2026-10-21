import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const server=await serve(),base=`http://127.0.0.1:${server.address().port}`;let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/?dev-scenario=sim-compact');await page.waitForFunction(()=>window.solarDev?.scenario()==='sim-compact'&&window.solarDev.snapshot().village.version===41);
 if(!await page.locator('#dev-dialog').isVisible())await page.locator('#dev-button').click();await page.locator('[data-dev-tab="simulation"]').click();
 await page.locator('#dev-minutes').fill('60');await page.locator('#dev-advance').click();await page.waitForFunction(()=>document.querySelector('#dev-inspection').textContent.includes('60.0 game minutes observed'));
 const before=await page.evaluate(()=>window.solarDev.snapshot()),day=before.village.simulation.days.at(-1);
 assert.equal(before.village.simulation.schema,2);assert(!Array.isArray(day.residents));assert.deepEqual(Object.keys(day.residents).sort(),before.residents.map(r=>String(r.id)).sort());for(const row of Object.values(day.residents))assert(Math.abs(row.reduce((a,b)=>a+b,0)-60)<.001);
 await page.screenshot({path:'/private/tmp/solar-activity-identity.png'});
 const legacy=structuredClone(before);legacy.village.version=32;legacy.village.simulation.schema=1;for(const day of legacy.village.simulation.days)day.residents=Array.from({length:5},(_,id)=>day.residents[id]);legacy.village.events.push('Legacy activity import verification');
 await page.locator('#dev-import-file').setInputFiles({name:'legacy-time-history.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});await page.waitForFunction(()=>window.solarDev.snapshot().village.events.at(-1)==='Legacy activity import verification');
 const after=await page.evaluate(()=>window.solarDev.snapshot());assert.equal(after.village.version,41);assert.deepEqual(after.village.simulation,before.village.simulation);assert.deepEqual(after.residents,before.residents);assert.deepEqual(after.village.skills,before.village.skills);assert.deepEqual(after.village.workforce,before.village.workforce);
 assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),null);assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-sandbox')),null);assert.deepEqual(errors,[]);
 console.log('PASS actual observed resident time in ID-keyed diagnostics, full per-person totals, legacy history import and unchanged accounts, allocator, resident state, skills, work history and normal saves.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
