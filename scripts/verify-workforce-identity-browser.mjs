import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const server=await serve(),base=`http://127.0.0.1:${server.address().port}`;let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/?dev-scenario=learning');await page.waitForFunction(()=>window.solarDev?.scenario()==='learning'&&window.solarDev.snapshot().village.version===36);if(await page.locator('#dev-dialog').isVisible())await page.locator('#dev-close').click();
 await page.locator('#resident-strip [data-citizen="0"]').click();await page.locator('.work-preferences summary').click();
 await page.getByLabel('Iara: Hauling preference',{exact:true}).selectOption('2');await page.getByLabel('Iara: Materials preference',{exact:true}).selectOption('0');
 const before=await page.evaluate(()=>window.solarDev.snapshot());assert.equal(before.village.workforce.schema,2);assert(!Array.isArray(before.village.workforce.preferences));assert.deepEqual(before.village.workforce.preferences[0],[1,2,1,0,1]);
 await page.locator('.work-preference-response').scrollIntoViewIfNeeded();await page.screenshot({path:'/private/tmp/solar-workforce-identity.png'});
 await page.locator('.close-person').click();await page.locator('#dev-button').click();
 assert.notEqual(before.village.workforce.preferences[2][4],2);
 const old=structuredClone(before);old.village.version=31;delete old.village.workforce.schema;old.village.workforce.preferences=Array.from({length:5},(_,id)=>old.village.workforce.preferences[id]);for(const day of old.village.workforce.days)day.residents=Array.from({length:5},(_,id)=>day.residents[id]);old.village.workforce.preferences[2][4]=2;
 await page.locator('#dev-import-file').setInputFiles({name:'legacy-workforce.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(old))});await page.waitForFunction(()=>window.solarDev.snapshot().village.workforce.preferences[2][4]===2);
 const after=await page.evaluate(()=>window.solarDev.snapshot());assert.equal(after.village.version,36);assert.equal(after.village.workforce.schema,2);assert.deepEqual(after.residents,before.residents);assert.deepEqual(after.village.workforce.days,before.village.workforce.days);assert.deepEqual(after.village.skills,before.village.skills);
 const context=await browser.newContext({viewport:{width:1600,height:900}}),normal=await context.newPage();normal.on('pageerror',e=>errors.push(e.message));
 try{
  await normal.goto(base);await normal.waitForFunction(()=>window.solarDev);await normal.locator('[data-new-mode="sandbox"]').click();await normal.locator('#main-menu').waitFor({state:'hidden'});await normal.locator('#pause').click();
  const open=async()=>{await normal.locator('#resident-strip [data-citizen="0"]').click();await normal.locator('.work-preferences summary').click();};
  await open();await normal.getByLabel('Iara: Hauling preference',{exact:true}).selectOption('2');assert.equal(await normal.evaluate(()=>JSON.parse(localStorage.getItem('solar-friends-v3-sandbox')).village.workforce.preferences[0][1]),2);
  await normal.reload();await normal.locator('[data-continue="sandbox"]').click();await normal.locator('#main-menu').waitFor({state:'hidden'});await normal.locator('#pause').click();await open();assert.equal(await normal.getByLabel('Iara: Hauling preference',{exact:true}).inputValue(),'2');assert.equal(await normal.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),null);
 }finally{await context.close();}
 assert.deepEqual(errors,[]);console.log('PASS ID-keyed player work preferences, legacy workforce import, preserved resident/skill/history state and independent Sandbox save/reload.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
