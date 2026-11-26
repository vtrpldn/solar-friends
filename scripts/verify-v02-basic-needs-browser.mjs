import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {launchBrowser} from './browser.mjs';
import {serve} from './serve.mjs';
import {village,seedSave} from './fixtures.mjs';
import {ensureInfrastructure} from '../web/v02/weekend/infrastructure.js';
const server=await serve(0),browser=await launchBrowser();
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000);
 const {s}=village({sandbox:true,story:true,fast:false,money:1200,materials:{food:0,eggs:0,milk:0,greens:0,beans:0,corn:0,meals:12}});delete s.foodStorage;ensureInfrastructure(s).nodes[0].water[0]=3;s.view={speed:1,paused:true,position:[64,35,64],target:[0,0,0],zoom:1};
 await seedSave(page,s);
 await page.goto(`http://127.0.0.1:${server.address().port}/v2/?mode=story`);await page.locator('#supplies [data-need="water"]').waitFor();
 assert.equal(await page.locator('#supplies [data-need]').count(),3);
 assert.equal(await page.locator('.need-sanitation').count(),0);
 assert.match(await page.locator('#supplies [data-need="water"]').getAttribute('aria-label'),/Sanitation:/);
 await mkdir('/tmp/solar-needs',{recursive:true});
 for(const width of [1440,1280]){
  await page.setViewportSize({width,height:width===1280?720:1000});
  const valid=await page.locator('#supplies').evaluate(e=>{const a=e.getBoundingClientRect(),b=document.querySelector('header > .time').getBoundingClientRect();return a.left>=0&&a.right<=b.left&&a.height<90&&e.scrollWidth<=e.clientWidth;});assert(valid,'inline status stays in existing counters without overlapping clock');
  await page.screenshot({path:`/tmp/solar-needs/needs-${width}.png`});
 }
 for(const [id,title]of [['power','Power'],['water','Water & sanitation'],['food','Food']]){
  await page.locator(`[data-need="${id}"]`).click();await page.locator('#management').waitFor();assert.equal(await page.locator('#management-title').innerText(),title);if(id==='water')assert.match(await page.locator('#management-stats').innerText(),/Toilets & washing/i);await page.locator('#close-management').click();
 }
 assert.deepEqual(errors,[]);console.log('PASS desktop needs summary fit and all three management links');
}finally{await browser.close();server.close();}
