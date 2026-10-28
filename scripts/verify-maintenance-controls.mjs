import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {checkMaintenanceControls} from './maintenance-browser-checks.mjs';
const output='artifacts/maintenance-controls';await mkdir(output,{recursive:true});
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.solarDev);
 await page.locator('[data-new-mode="story"]').click();await page.locator('#main-menu').waitFor({state:'hidden'});
 const saved=await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story'));
 await page.locator('#help').click();await page.locator('#help-dialog .dev-tools').evaluate(el=>{el.open=true;});await page.locator('#help-open-dev').click();
 await checkMaintenanceControls({page,saved,capture:async(_label,file)=>page.screenshot({path:output+'/'+file,fullPage:true})});
 await page.locator('#dev-close').click();
 await page.locator('#equipment-wear').uncheck();assert.equal(await page.locator('#maintenance-alert').isVisible(),false);
 await page.getByRole('button',{name:'Close supplies',exact:true}).click();
 await page.locator('#dev-button').click();await page.locator('#dev-scenario').selectOption('maintenance');await page.locator('#dev-load').click();
 await page.waitForFunction(()=>window.solarDev.scenario()==='maintenance');await page.locator('#dev-close').click();
 assert.equal(await page.locator('#supplies-panel').isVisible(),false);assert.equal(await page.locator('#maintenance-alert').isVisible(),true);
 await page.screenshot({path:output+'/upkeep-closed-panel-alert.png',fullPage:true});
 await page.locator('#maintenance-alert').click();assert.equal(await page.locator('#supplies-panel').isVisible(),true);
 assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved);
 assert.deepEqual(errors,[]);console.log('PASS: desktop maintenance purchase, local delivery, attended service, pause/resume, recovery and protected Story save.');
}catch(error){console.error(error);const pages=browser?.contexts().flatMap(c=>c.pages())??[];if(pages[0])console.error(await pages[0].evaluate(()=>({maintenance:window.solarDev?.snapshot().village.maintenance,alert:document.querySelector('#maintenance-alert')?.outerHTML,scenario:window.solarDev?.scenario()})));throw error;}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
