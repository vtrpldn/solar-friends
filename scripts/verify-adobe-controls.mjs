import {worldPoint} from './browser-world-point.mjs';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const compact=process.argv.includes('--compact'),output=compact?'artifacts/adobe-controls-1280':'artifacts/adobe-controls';await mkdir(output,{recursive:true});
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:compact?{width:1280,height:800}:{width:1600,height:900}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.solarDev);
 await page.locator('[data-new-mode="story"]').click();await page.locator('#main-menu').waitFor({state:'hidden'});
 const saved=await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story'));
 await page.locator('#help').click();await page.locator('#help-dialog .dev-tools').evaluate(el=>{el.open=true;});await page.locator('#help-open-dev').click();
 await page.locator('#dev-scenario').selectOption('circular-night');await page.locator('#dev-load').click();await page.locator('#dev-close').click();
 await page.getByRole('button',{name:'Build',exact:true}).click();await page.locator('[data-build-group="village"]').click();await page.locator('#home-material-method').selectOption('adobe');await page.locator('[data-kind="home"]').click();await page.evaluate(()=>window.solarDev.fixedView());
 assert(await page.evaluate(()=>{
  const before=JSON.stringify(window.solarDev.snapshot()),center=document.querySelector('#world').dataset.cameraCenter;
  for(const focus of [null,{x:0,y:.5},{x:.5,y:1},{x:NaN,y:.5},{x:.5,y:Infinity}]){let refused=false;try{window.solarDev.frameCell(5,5,focus);}catch{refused=true;}if(!refused||document.querySelector('#world').dataset.cameraCenter!==center)return false;}
  return before===JSON.stringify(window.solarDev.snapshot());
 }),'Invalid framing points leave camera and village unchanged');
 const before=await page.evaluate(()=>window.solarDev.snapshot()),point=await worldPoint(page,5,5);await page.mouse.click(point.x,point.y);
 const after=await page.evaluate(()=>window.solarDev.snapshot());
 await page.screenshot({path:output+'/adobe-placement.png',fullPage:true});assert.equal(after.village.buildings.length,before.village.buildings.length+1);assert.equal(after.village.economy.projects.at(-1).recipe,'adobe');assert(after.village.economy.projects.at(-1).appearance>=4);
 assert.deepEqual([after.village.buildings.at(-1).x,after.village.buildings.at(-1).y],[5,5]);
 assert.equal(after.village.buildings.at(-1).progress,0);
 assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved);

 assert.deepEqual(errors,[]);console.log('PASS: player-selected adobe home placement and artwork variant.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
