import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/?dev-scenario=leisure`);
 await page.waitForFunction(()=>window.solarDev?.scenario()==='leisure'&&window.solarDev.snapshot().village.version===44);
 const before=await page.evaluate(()=>window.solarDev.snapshot());
 if(!await page.locator('#dev-dialog').isVisible())await page.locator('#dev-button').click();
 const old=structuredClone(before);old.village.version=35;
 for(const field of ['outside_jobs','outside_committed_days','work_day'])old.village.economy[field]=Object.values(old.village.economy[field]);
 delete old.village.economy.outside_professions;old.village.events.push('Legacy employment import verification');
 await page.locator('#dev-import-file').setInputFiles({name:'legacy-employment.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(old))});
 await page.waitForFunction(()=>window.solarDev.snapshot().village.events.at(-1)==='Legacy employment import verification');
 const after=await page.evaluate(()=>window.solarDev.snapshot());
 assert.equal(after.village.version,44);
 assert.deepEqual(after.village.economy,before.village.economy);
 assert.deepEqual(after.residents,before.residents);assert.deepEqual(after.village.skills,before.village.skills);assert.deepEqual(after.village.workforce,before.village.workforce);assert.deepEqual(after.village.simulation,before.village.simulation);
 assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),null);
 assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-sandbox')),null);assert.deepEqual(errors,[]);
 console.log('PASS browser employment-array migration preserves settings, paid/committed days, residents, experience, activity history, accounts and normal saves.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
