import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {createSandbox,save} from '../web/v02/weekend/simulation.js';
import {SANDBOX_SAVE} from '../web/v02/weekend/modes.js';
const server=await serve(0),browser=await chromium.launch({headless:true,args:['--mute-audio']});
const out=process.env.GUIDE_SCREENSHOTS||'/tmp/solar-guide';await mkdir(out,{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
 const s=createSandbox(42);s.view={speed:1,paused:false,position:[64,35,64],target:[0,0,0],zoom:1};
 await page.addInitScript(({key,value})=>{localStorage.setItem(key,value);localStorage.setItem('solar-friends-audio','{"music":0,"effects":0}');},{key:SANDBOX_SAVE,value:save(s)});
 console.log('Loading game');await page.goto(`http://127.0.0.1:${server.address().port}/v2/?mode=sandbox`);await page.waitForSelector('#build-field',{state:'attached'});await page.waitForTimeout(500);
 console.log('Opening Guide');await page.locator('#open-guide').click();await page.waitForSelector('#guide-topics button');assert.equal(await page.locator('#guide-topics button').count(),27);
 assert.equal(await page.locator('#pause').getAttribute('aria-label'),'Resume simulation');
 await page.waitForFunction(()=>document.querySelector('.guide-diagram img')?.naturalWidth>0);console.log('Overview loaded');await page.screenshot({path:out+'/overview-1440.png'});console.log('Overview captured');
 await page.locator('#guide-search').fill('cultivation');await page.getByRole('button',{name:'Field and greenhouse cultivation',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.guide-diagram img')?.complete&&document.querySelector('.guide-diagram img').naturalWidth>0);
 assert((await page.locator('.guide-facts').innerText()).includes('45 favorable growth days'));
 await page.getByRole('button',{name:'Zoom in',exact:true}).click();assert.equal(await page.locator('.guide-diagram img').evaluate(e=>e.style.width),'125%');await page.getByRole('button',{name:'Fit width',exact:true}).click();
 await page.screenshot({path:out+'/cultivation-1440.png'});console.log('Cultivation captured');
 await page.locator('#guide-search').fill('no-matching-system');assert.match(await page.locator('#guide-topics').innerText(),/No matching systems/);
 await page.keyboard.press('Escape');assert.equal(await page.locator('#village-guide').isVisible(),false);assert.equal(await page.locator('#pause').getAttribute('aria-label'),'Pause simulation');assert.equal(await page.evaluate(()=>document.activeElement.id),'open-guide');
 await page.locator('#pause').click();await page.locator('#open-guide').click();await page.locator('#guide-search').fill('');await page.locator('#guide-close').click();assert.equal(await page.locator('#pause').getAttribute('aria-label'),'Resume simulation');
 await page.locator('#pause').click();await page.locator('[data-panel-toggle="build"]').click();await page.locator('#open-guide').click();await page.locator('#guide-close').click();assert.equal(await page.locator('#pause').getAttribute('aria-label'),'Resume simulation');await page.locator('[data-panel-toggle="build"]').click();assert.equal(await page.locator('#pause').getAttribute('aria-label'),'Pause simulation');
 for(const [width,height]of [[1280,720],[1920,1080]]){
  await page.setViewportSize({width,height});await page.locator('#open-guide').click();await page.locator('#guide-topics button').first().click();
  const fits=await page.locator('#village-guide').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&e.scrollWidth<=e.clientWidth;});assert(fits);
  assert(await page.locator('#guide-close').isVisible());await page.screenshot({path:`${out}/overview-${width}.png`});await page.locator('#guide-close').click();
 }
 await page.locator('#open-guide').click();
 for(const button of await page.locator('#guide-topics button').all()){console.log('Checking diagram:',await button.innerText());await button.click();await page.waitForFunction(()=>document.querySelector('.guide-diagram img')?.complete&&document.querySelector('.guide-diagram img').naturalWidth>0);}
 assert.deepEqual(errors,[]);console.log('PASS Guide loading, all diagrams, search, facts, zoom, Escape/focus, nested pause restoration and desktop layouts');
}finally{await browser.close();server.close();}
