import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/?dev-scenario=leisure`);
 await page.waitForFunction(()=>window.solarDev?.scenario()==='leisure'&&window.solarDev.snapshot().village.version===40);
 const before=await page.evaluate(()=>window.solarDev.snapshot()),old=structuredClone(before);
 old.village.version=36;old.village.progress.friendships=Array(25).fill(0);old.village.progress.friendships[1]=7;old.village.progress.friendships[5]=3;
 old.village.events.push('Legacy friendship import verification');
 if(!await page.locator('#dev-dialog').isVisible())await page.locator('#dev-button').click();
 await page.locator('#dev-import-file').setInputFiles({name:'legacy-friendships.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(old))});
 await page.waitForFunction(()=>window.solarDev.snapshot().village.events.at(-1)==='Legacy friendship import verification');
 const after=await page.evaluate(()=>window.solarDev.snapshot());assert.equal(after.village.version,40);
 assert.deepEqual(after.village.progress.friendships,{0:{1:7},1:{0:3}});
 assert.deepEqual(after.residents,before.residents);assert.deepEqual(after.village.economy,before.village.economy);assert.deepEqual(after.village.skills,before.village.skills);assert.deepEqual(after.village.workforce,before.village.workforce);assert.deepEqual(after.village.simulation,before.village.simulation);
 await page.locator('#dev-close').click();await page.locator('[data-panel=community-panel]').click();await page.locator('#residents [data-resident="0"]').click();
 assert.equal(await page.locator('#person .friendship-note').textContent(),'Shared memories: Bento (7)');
 assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),null);assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-sandbox')),null);
 assert.deepEqual(errors,[]);console.log('PASS real legacy matrix import preserves directional memories, People display, residents, work, wages, experience and normal saves.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
