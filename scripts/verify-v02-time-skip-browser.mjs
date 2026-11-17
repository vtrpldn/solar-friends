import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {createWeekend,chooseCamp,save,restore} from '../web/v02/weekend/simulation.js';
import {STORY_SAVE} from '../web/v02/weekend/modes.js';
const state=createWeekend(1);chooseCamp(state,'entrance');state.weather={version:1,hour:9,rainMmPerHour:0,cloudCover:.2,temperatureC:22};state.rain=false;state.view={paused:true};
const server=await serve(),browser=await chromium.launch({headless:true,args:['--mute-audio',...(process.platform==='darwin'?['--use-angle=metal']:[])]});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({key,value})=>{localStorage.setItem(key,value);localStorage.setItem('solar-friends-audio','{"music":0,"effects":0}');window.draws=0;for(const name of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced']){const original=WebGL2RenderingContext.prototype[name];WebGL2RenderingContext.prototype[name]=function(...args){if(this.canvas.id==='world')window.draws++;return original.apply(this,args);};}},{key:STORY_SAVE,value:save(state)});
 await page.goto(`http://127.0.0.1:${server.address().port}/v2/?mode=story`);await page.locator('#time-skip').click();await page.locator('#skip-days').fill('1');assert(await page.locator('#skip-milestone-note').isVisible());await page.locator('#skip-start').click();await page.waitForFunction(()=>document.querySelector('#skip-progress').value>0);const during=await page.evaluate(()=>window.draws);await page.locator('#skip-close').click();await page.waitForFunction(()=>!document.querySelector('#time-skip-dialog').open);
 const loaded=restore(await page.evaluate(key=>localStorage.getItem(key),STORY_SAVE));assert(loaded);assert(loaded.time>state.time);assert(loaded.view.paused);assert.equal(loaded.rain,false,'controlled dry-weather village');
 await page.waitForTimeout(100);assert((await page.evaluate(()=>window.draws))>during,'completed skip redraws the updated paused world');await page.waitForTimeout(500);const n=await page.evaluate(()=>window.draws);await page.waitForTimeout(600);assert.equal(await page.evaluate(()=>window.draws),n,'stopped dry village returns to idle rendering');assert.deepEqual(errors,[]);
 console.log('PASS advance-days milestones, partial progress, stop, saved pause and idle rendering');
}finally{await browser.close();server.close();}
