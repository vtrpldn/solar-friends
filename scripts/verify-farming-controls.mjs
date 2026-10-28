import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {checkFarmingControls} from './farming-browser-checks.mjs';
const output='artifacts/farming-controls';await mkdir(output,{recursive:true});
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.solarDev);
 await page.locator('[data-new-mode="story"]').click();await page.locator('#main-menu').waitFor({state:'hidden'});
 const saved=await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story'));
 await page.locator('#help').click();await page.locator('#help-dialog .dev-tools').evaluate(el=>{el.open=true;});await page.locator('#help-open-dev').click();
 await checkFarmingControls({page,saved,capture:async(_label,file)=>page.screenshot({path:output+'/'+file,fullPage:true})});
 assert.deepEqual(errors,[]);console.log('PASS: desktop farm controls, all four matching output icons, reversible paused edits and protected Story save.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
