import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const server=await serve(),base=`http://127.0.0.1:${server.address().port}`;let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/?dev-scenario=leisure');await page.waitForFunction(()=>window.solarDev?.scenario()==='leisure'&&window.solarDev.snapshot().village.version===34);
 const before=await page.evaluate(()=>window.solarDev.snapshot());assert.deepEqual(before.residents.map(r=>r.routine_preferences.preferred_bedtime),[1290,1335,1260,1380,1305]);
 if(!await page.locator('#dev-dialog').isVisible())await page.locator('#dev-button').click();
 const old=structuredClone(before);old.village.version=33;for(const r of old.residents)delete r.routine_preferences;old.village.events.push('Legacy personal routine import verification');
 await page.locator('#dev-import-file').setInputFiles({name:'legacy-personal-routines.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(old))});await page.waitForFunction(()=>window.solarDev.snapshot().village.events.at(-1)==='Legacy personal routine import verification');
 const after=await page.evaluate(()=>window.solarDev.snapshot());assert.equal(after.village.version,34);assert.deepEqual(after.residents,before.residents);assert.deepEqual(after.village.skills,before.village.skills);assert.deepEqual(after.village.workforce,before.village.workforce);assert.deepEqual(after.village.simulation,before.village.simulation);
 await page.locator('#dev-close').click();await page.screenshot({path:'/private/tmp/solar-personal-routines.png'});
 assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),null);assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-sandbox')),null);assert.deepEqual(errors,[]);
 console.log('PASS browser legacy routine import: pinned founding preferences restored, complete resident sleep/needs/activity state preserved, other records and normal saves unchanged.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
