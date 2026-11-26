import assert from 'node:assert/strict';
import {launchBrowser} from './browser.mjs';
import {serve} from './serve.mjs';
import {save,restore} from '../web/v02/weekend/simulation.js';
import {village} from './fixtures.mjs';
import {STORY_SAVE} from '../web/v02/weekend/modes.js';
const state=village({seed:1,fast:false}).s;state.weather={version:1,hour:9,rainMmPerHour:0,cloudCover:.2,temperatureC:22};state.rain=false;state.view={paused:true};
const server=await serve(),browser=await launchBrowser();
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({key,value})=>{localStorage.setItem(key,value);localStorage.setItem('solar-friends-audio','{"music":0,"effects":0}');window.draws=0;for(const name of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced']){const original=WebGL2RenderingContext.prototype[name];WebGL2RenderingContext.prototype[name]=function(...args){if(this.canvas.id==='world')window.draws++;return original.apply(this,args);};}},{key:STORY_SAVE,value:save(state)});
 await page.goto(`http://127.0.0.1:${server.address().port}/v2/?mode=story`);await page.locator('#time-skip').click();await page.locator('#skip-days').fill('1');assert(await page.locator('#skip-milestone-note').isVisible());await page.locator('#skip-start').click();await page.waitForFunction(()=>document.querySelector('#skip-progress').value>0);const during=await page.evaluate(()=>window.draws);await page.locator('#skip-close').click();await page.waitForFunction(()=>!document.querySelector('#time-skip-dialog').open);await page.locator('#skip-summary-dialog').waitFor({state:'visible'});await page.keyboard.press('Enter');await page.locator('#skip-summary-dialog').waitFor({state:'hidden'});
 const loaded=restore(await page.evaluate(key=>localStorage.getItem(key),STORY_SAVE));assert(loaded);assert(loaded.time>state.time);assert(loaded.view.paused);assert.equal(loaded.rain,false,'controlled dry-weather village');
 await page.waitForTimeout(100);assert((await page.evaluate(()=>window.draws))>during,'completed skip redraws the updated paused world');await page.waitForTimeout(500);const n=await page.evaluate(()=>window.draws);await page.waitForTimeout(600);assert.equal(await page.evaluate(()=>window.draws),n,'stopped dry village returns to idle rendering');assert.deepEqual(errors,[]);
 // Simulate the browser visibility events and elapsed wall time without making CI wait a minute.
 const hiddenMinute = () => page.evaluate(() => {
   const realNow=Date.now;
   try {
     Object.defineProperty(document,'hidden',{configurable:true,value:true});
     document.dispatchEvent(new Event('visibilitychange'));
     Date.now=()=>realNow()+60000;
     Object.defineProperty(document,'hidden',{configurable:true,value:false});
     document.dispatchEvent(new Event('visibilitychange'));
   } finally {Date.now=realNow;delete document.hidden;}
 });
 const readTime=()=>page.evaluate(key=>{
   window.dispatchEvent(new Event('pagehide'));
   return JSON.parse(localStorage.getItem(key)).time;
 },STORY_SAVE);
 const pausedTime=await readTime();
 await hiddenMinute();
 await page.waitForTimeout(200);
 assert.equal(await readTime(),pausedTime,'a paused hidden village stays paused');
 await page.locator('#pause').click();
 const runningTime=await readTime();
 await hiddenMinute();
 await page.waitForFunction(()=>!document.querySelector('#speed').textContent.includes('Catching up'));
 await page.waitForFunction(({start,key})=>{
   window.dispatchEvent(new Event('pagehide'));
   return JSON.parse(localStorage.getItem(key)).time>=start+59.9;
 },{start:runningTime,key:STORY_SAVE},{timeout:10000,polling:100});
 assert((await readTime())<runningTime+75,'hidden time is replayed only once at the selected 1× speed');
 assert.deepEqual(errors,[]);
 console.log('PASS advance-days milestones, partial progress, stop, saved pause and idle rendering');
}finally{await browser.close();server.close();}
