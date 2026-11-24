import assert from 'node:assert/strict';
import {launchBrowser} from './browser.mjs';
import {serve} from './serve.mjs';
import {createWeekend,chooseCamp,save} from '../web/v02/weekend/simulation.js';
import {STORY_SAVE} from '../web/v02/weekend/modes.js';
// At about 6 frames a second the village must still advance at the labelled 16×.
const state=createWeekend(1);chooseCamp(state,'entrance');state.weather={version:1,hour:9,rainMmPerHour:0,cloudCover:.2,temperatureC:22};state.rain=false;
const server=await serve(),browser=await launchBrowser();
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({key,value})=>{
  localStorage.setItem(key,value);localStorage.setItem('solar-friends-audio','{"music":0,"effects":0}');
  const raf=window.requestAnimationFrame.bind(window);window.frames=0;window.frameDelay=0;
  window.requestAnimationFrame=callback=>window.frameDelay?setTimeout(()=>raf(time=>{window.frames++;callback(time);}),window.frameDelay):raf(callback);
 },{key:STORY_SAVE,value:save(state)});
 await page.goto(`http://127.0.0.1:${server.address().port}/v2/?mode=story`);
 const speed=page.locator('#speed');
 for(let i=0;i<4&&(await speed.textContent())!=='16×';i++)await speed.click();
 assert.equal(await speed.textContent(),'16×');
 const sample=()=>page.evaluate(key=>{window.dispatchEvent(new Event('pagehide'));return {time:JSON.parse(localStorage.getItem(key)).time,wall:performance.now(),frames:window.frames};},STORY_SAVE);
 await page.evaluate(()=>{window.frameDelay=200;});
 await page.waitForTimeout(500);
 const before=await sample();await page.waitForTimeout(5000);const after=await sample();
 const wall=(after.wall-before.wall)/1000,fps=(after.frames-before.frames)/wall,rate=(after.time-before.time)/wall;
 assert(fps<8,`frames were throttled, got ${fps.toFixed(1)} fps`);
 assert(rate>14.5&&rate<17.5,`16× holds at ${fps.toFixed(1)} fps, got ${rate.toFixed(1)}×`);
 assert.equal(await speed.textContent(),'16×','a village that keeps up shows its selected speed');
 assert.deepEqual(errors,[]);
 console.log(`PASS: 16× advances ${rate.toFixed(1)} game seconds per second at ${fps.toFixed(1)} fps.`);
}finally{await browser.close();server.close();}
