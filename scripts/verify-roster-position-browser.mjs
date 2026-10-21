import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/editor.html`);await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
 await page.locator('[data-preset=camp]').click();await page.waitForFunction(()=>!document.querySelector('#creator-test').disabled&&document.querySelector('#creator-save-status').textContent.startsWith('Saved'));
 await page.locator('#creator-test').click();await page.waitForFunction(()=>window.solarDev&&document.querySelector('.creation-session'));
 const initial=await page.evaluate(()=>window.solarDev.snapshot());assert.deepEqual(initial.village.camp,[32,32]);
 await page.locator('[data-speed="8"]').click();
 if(await page.locator('#pause').getAttribute('aria-label')==='Resume simulation')await page.locator('#pause').click();
 await page.waitForFunction(target=>window.solarDev.snapshot().village.minutes>=target,initial.village.minutes+120);
 if(await page.locator('#pause').getAttribute('aria-label')==='Pause simulation')await page.locator('#pause').click();
 const after=await page.evaluate(()=>window.solarDev.snapshot());assert(after.village.minutes>=initial.village.minutes+119.9);assert(after.village.arrived);
 const quiet=after.residents.filter(r=>['idle','nature_walk','birdwatch','stretch','daydream','stargaze'].includes(r.task));assert(quiet.length>0,'Actual arrival reaches ordinary leisure');
 for(const r of quiet){assert(Math.hypot(r.target_x-32,r.target_y-32)<20,`${r.name} should relax near the authored camp`);assert(r.target_x>=0.3&&r.target_x<=63.7&&r.target_y>=0.3&&r.target_y<=63.7);}
 await page.screenshot({path:'/private/tmp/solar-roster-position-playtest.png'});
 const save=page.getByRole('button',{name:'Save checkpoint',exact:true});await save.click();await page.waitForFunction(()=>[...document.querySelectorAll('.creation-session button')].find(b=>b.textContent==='Save checkpoint')?.disabled===false);
 await page.reload();await page.waitForFunction(()=>window.solarDev&&document.querySelector('.creation-session'));assert.deepEqual((await page.evaluate(()=>window.solarDev.snapshot())).residents,after.residents);
 assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),null);assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-sandbox')),null);assert.deepEqual(errors,[]);
 console.log(`PASS public creator playtest reaches actual leisure near the centered camp (${quiet.length} residents), stays within land bounds, reloads positions exactly and preserves normal saves.`);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
