import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {createSandbox,save} from '../web/v02/weekend/simulation.js';
import {ensureInfrastructure} from '../web/v02/weekend/infrastructure.js';
import {STORY_SAVE} from '../web/v02/weekend/modes.js';
const server=await serve(0),browser=await chromium.launch({headless:true,args:['--mute-audio']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000);
 const s=createSandbox(42);s.mode='story';s.money=1200;for(const id of ['food','eggs','milk','greens','beans','corn'])s.materials[id]=0;s.materials.meals=12;delete s.foodStorage;ensureInfrastructure(s).nodes[0].water[0]=3;s.view={speed:1,paused:true,position:[64,35,64],target:[0,0,0],zoom:1};
 await page.addInitScript(({key,value})=>{localStorage.setItem(key,value);localStorage.setItem('solar-friends-audio','{"music":0,"effects":0}');},{key:STORY_SAVE,value:save(s)});
 await page.goto(`http://127.0.0.1:${server.address().port}/v2/?mode=story`);await page.locator('.need-sanitation').waitFor();
 assert.equal(await page.locator('#supplies [data-need]').count(),4);
 await mkdir('/tmp/solar-needs',{recursive:true});
 for(const width of [1440,1280]){
  await page.setViewportSize({width,height:width===1280?720:1000});
  const valid=await page.locator('#supplies').evaluate(e=>{const a=e.getBoundingClientRect(),b=document.querySelector('header > .time').getBoundingClientRect();return a.left>=0&&a.right<=b.left&&a.height<90&&e.scrollWidth<=e.clientWidth;});assert(valid,'inline status stays in existing counters without overlapping clock');
  assert(await page.locator('#open-guide').evaluate(e=>e.getBoundingClientRect().top>=document.querySelector('header > .time').getBoundingClientRect().bottom),'Guide clears expanded clock');
  await page.screenshot({path:`/tmp/solar-needs/needs-${width}.png`});
 }
 for(const [id,title]of [['power','Power'],['water','Water & sanitation'],['food','Food'],['sanitation','Water & sanitation']]){
  await page.locator(`[data-need="${id}"]`).click();await page.locator('#management').waitFor();assert.equal(await page.locator('#management-title').innerText(),title);await page.locator('#close-management').click();
 }
 assert.deepEqual(errors,[]);console.log('PASS desktop needs summary fit and all four management links');
}finally{await browser.close();server.close();}
