import assert from 'node:assert/strict';
import {launchBrowser} from './browser.mjs';
import {serve} from './serve.mjs';
import {village,seedSave} from './fixtures.mjs';
const server=await serve();let browser;
try{
 browser=await launchBrowser();
 for(const [name,hour,rain] of [['day',15.95,false],['rain',15.95,true],['night',22,false]]){
  const {s}=village({fast:false});s.time=(7*1440+hour*60-540)/.45;s.rain=rain;s.weather={version:1,hour:Math.floor(s.time/(3200/24)+9),rainMmPerHour:rain?2:0,cloudCover:.1,temperatureC:21};
  s.view={speed:16,paused:true,position:[20,35,20],target:[1,2,3],zoom:2};
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await seedSave(page,s,{mute:false});
  await page.goto(`http://127.0.0.1:${server.address().port}/v2/?mode=story`);
  await page.waitForFunction(()=>document.querySelector('#weather').textContent.length>0);
  assert.equal(await page.locator('#calendar-date').innerText(),'8 Nov');
  assert((await page.locator('#weather').innerText()).includes(rain?'Rain':name==='night'?'Clear night':'Sunny'));assert.equal(await page.locator('#temperature').innerText(),'21°C');
  assert.match(await page.locator('#temperature').innerText(),/^-?\d+°C$/);
  for(const width of [1440,1000]){
   await page.setViewportSize({width,height:900});
   const clock=await page.locator('.time').boundingBox(),supplies=await page.locator('#supplies').boundingBox();
   assert(clock.x>=0&&clock.x+clock.width<=width,'Clock fits desktop');
   assert(clock.x>=supplies.x+supplies.width||clock.y>=supplies.y+supplies.height,'Clock does not overlap supplies');
   if(width===1440)await page.screenshot({path:`/tmp/solar-environment-${name}.png`});
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS desktop clock: date, sunny/rain/night states, estimated temperature and no overlap at 1440px/1000px.');
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
