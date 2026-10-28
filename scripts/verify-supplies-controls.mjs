import {checkKitchenControls} from './kitchen-browser-checks.mjs';
import {checkWorkshopPowerControls,checkElectricalControls} from './electricity-browser-checks.mjs';
import {checkBatteryControls} from './battery-browser-checks.mjs';
import {checkGatheringControls} from './gathering-browser-checks.mjs';
import {checkFreshnessControls} from './freshness-browser-checks.mjs';
import {checkProcessControls} from './process-browser-checks.mjs';
import {checkOrganicControls} from './organics-browser-checks.mjs';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {checkFoodControls} from './food-browser-checks.mjs';
const output='artifacts/supplies-controls';await mkdir(output,{recursive:true});
const files=['scripts/verify-supplies-controls.mjs',...['food','kitchen','electricity','battery','gathering','freshness','process','organics'].map(name=>'scripts/'+name+'-browser-checks.mjs'),'web/main.js','web/materials.js','web/pkg/solar_friends_bg.wasm'],sha=bytes=>createHash('sha256').update(bytes).digest('hex'),inputs=Object.fromEntries(await Promise.all(files.map(async file=>[file,sha(await readFile(file))]))),results=[],screenshots=[];
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.solarDev);
 await page.locator('[data-new-mode="story"]').click();await page.locator('#main-menu').waitFor({state:'hidden'});
 const saved=await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story'));
 await page.locator('#help').click();await page.locator('#help-dialog .dev-tools').evaluate(el=>{el.open=true;});await page.locator('#help-open-dev').click();
 for(const check of [checkFoodControls,checkKitchenControls,checkWorkshopPowerControls,checkElectricalControls,checkBatteryControls,checkGatheringControls,checkFreshnessControls,checkProcessControls,checkOrganicControls]){console.log('Checking '+check.name);await check({page,saved,capture:async(label,file)=>{await page.screenshot({path:output+'/'+file,fullPage:true});console.log(label);screenshots.push({label,file});}});results.push(check.name);console.log('PASS '+check.name);}
 assert.deepEqual(errors,[]);for(const file of files)assert.equal(sha(await readFile(file)),inputs[file]);await writeFile(output+'/report.json',JSON.stringify({completed:true,browser:browser.version(),viewport:{width:1600,height:900},results,screenshots,inputs,scope:'Actual desktop food, kitchen, electrical, battery, gathering, freshness, passive-process and organic controls with protected Story saves. This focused group does not replace the complete browser journey or builder release gates.'},null,2)+'\n');console.log('PASS: food, kitchen, electricity, batteries, gathering, freshness, processes and organics controls with protected Story save.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
