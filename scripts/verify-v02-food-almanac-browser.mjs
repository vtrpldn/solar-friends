import {launchBrowser} from './browser.mjs';
import {mkdir} from 'node:fs/promises';
await mkdir('artifacts/food-almanac',{recursive:true});
import {serve} from './serve.mjs';
import {createWeekend,chooseCamp,save,PROJECTS} from '../web/v02/weekend/simulation.js';
import assert from 'node:assert/strict';
const s=createWeekend(42);chooseCamp(s,'entrance');s.projects.push({id:s.nextId++,key:'kitchen',x:s.stock.x+3,z:s.stock.z+3,rotation:0,work:PROJECTS.kitchen.work,delivered:0});
const server=await serve();const browser=await launchBrowser();
try{for(const [width,height]of [[1440,1000],[1280,800]]){
 const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message);});page.setDefaultTimeout(10000);
 await page.addInitScript(raw=>localStorage.setItem('solar-friends-v02-first-weekend-2',raw),save(s));
 await page.goto(`http://127.0.0.1:${server.address().port}/v2/?mode=story`);
 await page.locator('#supplies [data-panel="food"]').waitFor();
 await page.keyboard.press('i');await page.locator('.management-tabs [data-manage="food"]').click();
 // On by default; switching it off and on again still works.
 await page.getByRole('button',{name:'Automatic food management: on',exact:true}).click();
 await page.getByRole('button',{name:'Automatic food management: off',exact:true}).click();
 await page.getByLabel('Fresh-meal target (days)',{exact:true}).fill('2');await page.getByLabel('Fresh-meal target (days)',{exact:true}).press('Tab');
 await page.getByLabel('Chill first',{exact:true}).selectOption('meals');
 assert.equal(await page.getByLabel('Fresh-meal target (days)',{exact:true}).inputValue(),'2');
 assert.equal(await page.getByLabel('Chill first',{exact:true}).inputValue(),'meals');
 assert.equal(await page.getByRole('button',{name:'Automatic food management: on'}).getAttribute('aria-pressed'),'true');
 const main=await page.locator('.management-main').boundingBox(),side=await page.locator('.management-side').boundingBox();assert(side.x>=main.x+main.width,'town purchases must remain beside the pantry');
 await page.screenshot({path:`artifacts/food-almanac/controls-${width}.png`});
 await page.getByText('On the shelves',{exact:true}).scrollIntoViewIfNeeded();
 assert(await page.getByRole('rowheader',{name:'Dried provisions',exact:true}).isVisible());
 await page.screenshot({path:`artifacts/food-almanac/pantry-${width}.png`});
 await page.getByText('Food reserves & delivery',{exact:true}).click();
 await page.getByRole('spinbutton',{name:'Food reserve in days',exact:true}).fill('7');await page.getByRole('spinbutton',{name:'Food reserve in days',exact:true}).press('Tab');
 assert.match(await page.locator('.food-forecast').textContent(),/of 105 planned portions/);
 await page.locator('.management-tabs [data-manage="resources"]').click();assert.equal(await page.getByText('Food reserves & delivery',{exact:true}).count(),0);
 await page.getByRole('button',{name:'Manage food in the Food Almanac',exact:true}).click();assert.equal(await page.locator('#management-title').textContent(),'Food');
 await page.keyboard.press('Escape');await page.locator('#supplies [data-panel="food"]').click();assert.equal(await page.locator('#management-title').textContent(),'Food');
 assert.deepEqual(errors,[]);await page.close();console.log(`PASS Food navigation, HUD, policies, pantry and reserve controls at ${width}×${height}`);
}}finally{await browser.close();await new Promise(r=>server.close(r));}
