import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {createWeekend,chooseCamp,save} from '../web/v02/weekend/simulation.js';
import {STORY_SAVE} from '../web/v02/weekend/modes.js';
const s=createWeekend(42);chooseCamp(s,'entrance');s.weather={version:1,hour:9,rainMmPerHour:0,cloudCover:.2,temperatureC:22};s.rain=false;s.view={speed:1,paused:true,position:[20,35,20],target:[1,2,3],zoom:1};
const server=await serve(),browser=await chromium.launch({headless:true,args:['--mute-audio']});
const initialize = ({key,value})=>{
  localStorage.setItem(key,value);localStorage.setItem('solar-friends-audio','{"music":0,"effects":0}');window.worldDraws=0;window.worldTextures=[];
  for(const name of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced']){const original=WebGL2RenderingContext.prototype[name];WebGL2RenderingContext.prototype[name]=function(...args){if(this.canvas.id==='world')window.worldDraws++;return original.apply(this,args);};}
  for(const name of ['texImage2D','texStorage2D']){const original=WebGL2RenderingContext.prototype[name];WebGL2RenderingContext.prototype[name]=function(...args){if(this.canvas.id==='world'&&typeof args[3]==='number'&&typeof args[4]==='number')window.worldTextures.push([args[3],args[4]]);return original.apply(this,args);};}
 };
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.addInitScript(initialize,{key:STORY_SAVE,value:save(s)});
 await page.goto(`http://127.0.0.1:${server.address().port}/v2/?mode=story&performance=1`);await page.locator('#performance').waitFor();await page.waitForTimeout(5000);
 assert(await page.evaluate(()=>worldTextures.some(([w,h])=>w===2048&&h===2048)),'desktop shadows use a 2048 map');
 const draws=()=>page.evaluate(()=>window.worldDraws);
 let before=await draws();await page.waitForTimeout(1000);assert.equal(await draws(),before,'idle paused village does not submit identical geometry');
 before=await draws();
 await page.evaluate(async()=>{const canvas=document.querySelector('#world'),extension=canvas.getContext('webgl2').getExtension('WEBGL_lose_context');const restored=new Promise(resolve=>canvas.addEventListener('webglcontextrestored',resolve,{once:true}));extension.loseContext();await new Promise(r=>setTimeout(r,150));extension.restoreContext();await restored;});
 await page.waitForTimeout(1500);assert((await draws())>before,'restored WebGL context redraws even while paused');
 const clip={x:400,y:200,width:400,height:300};const initial=await page.screenshot({clip});
 await page.mouse.move(650,400);await page.mouse.wheel(0,-350);await page.waitForTimeout(1800);assert((await draws())>before,'camera zoom redraws a paused scene');
 assert(!initial.equals(await page.screenshot({clip})),'paused camera zoom visibly changes the scene');
 before=await draws();await page.setViewportSize({width:1000,height:700});await page.waitForTimeout(1500);assert((await draws())>before,'resizing redraws the scene');
 assert(await page.evaluate(()=>worldTextures.some(([w,h])=>w===1024&&h===1024)),'smaller desktop window reallocates a 1024 shadow map');
 await page.setViewportSize({width:1280,height:720});await page.waitForTimeout(1000);
 await page.locator('[data-panel-toggle="build"]').click();await page.locator('#build-search').fill('Basic shelter');await page.locator('#build-shelter').click();before=await draws();await page.mouse.move(600,300);await page.waitForTimeout(600);assert((await draws())>before,'placement previews redraw while paused');await page.keyboard.press('Escape');
 await page.waitForTimeout(1500);await page.locator('#pause').click();await page.waitForTimeout(500);before=await draws();await page.waitForTimeout(1200);assert((await draws())>before,'resuming simulation keeps rendering');
 await page.close();
 const retina=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2});await retina.addInitScript(initialize,{key:STORY_SAVE,value:save(s)});await retina.goto(`http://127.0.0.1:${server.address().port}/v2/?mode=story`);await retina.locator('#supplies [data-need]').first().waitFor();await retina.waitForTimeout(2000);assert(await retina.evaluate(()=>worldTextures.some(([w,h])=>w===4096&&h===4096)),'retina desktop retains a 4096 shadow map');await retina.close();
 const rain=await browser.newPage({viewport:{width:1280,height:720}});const wet=structuredClone(s);wet.rain=true;wet.weather.rainMmPerHour=1;await rain.addInitScript(initialize,{key:STORY_SAVE,value:save(wet)});await rain.goto(`http://127.0.0.1:${server.address().port}/v2/?mode=story`);await rain.locator('#supplies [data-need]').first().waitFor();await rain.waitForTimeout(1500);before=await rain.evaluate(()=>worldDraws);await rain.waitForTimeout(1000);assert((await rain.evaluate(()=>worldDraws))>before,'paused rain retains its animation');await rain.close();
 console.log('PASS paused idle render suppression, context restoration, visible zoom, desktop resize, placement previews, simulation resume, rain and desktop/retina shadow allocations');
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
