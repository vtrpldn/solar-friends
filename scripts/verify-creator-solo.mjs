import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.stack));
 page.on('console',async message=>{if(message.type()==='error')for(const arg of message.args())console.error(await arg.evaluate(e=>e?.stack??String(e)));});
 await page.goto(`http://127.0.0.1:${server.address().port}/editor.html`);
 await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');await page.locator('[data-preset=camp]').click();
 await page.locator('#creator-residents').evaluate(el=>el.open=true);
 const cards=page.locator('#creator-residents-fields > details');
 while(await cards.count()){await cards.last().evaluate(el=>el.open=true);await cards.last().locator('[data-remove-resident]').click();}
 assert(await page.locator('#creator-test').isDisabled());await page.locator('[data-add-resident]').click();
 await page.locator('#creator-test').click();
 await page.waitForFunction(()=>window.solarDev||document.querySelector('#load-status')?.textContent.includes('could not load'));
 assert(await page.evaluate(()=>!!window.solarDev),'Solo player initialization must finish');
 assert.equal((await page.evaluate(()=>window.solarDev.snapshot())).residents.length,1);
 assert.equal(await page.locator('#community-count').textContent(),'1');assert.equal(await page.locator('#happiness').textContent(),'75%');
 assert.deepEqual(errors,[]);console.log('PASS: an empty player draft becomes a playable one-resident village with correct HUD.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
