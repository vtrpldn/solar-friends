import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const server=await serve(),base=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/editor.html');await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
 await page.locator('[data-preset=camp]').click();await page.waitForFunction(()=>!document.querySelector('#creator-test').disabled);
 await page.locator('[data-workspace=land]').click();await page.locator('#creator-weather summary').click();
 const days=page.locator('#creator-weather-season_days');await page.locator('[data-workspace=village]').click();await page.locator('#creator-rule-climate').uncheck();assert(await days.isDisabled());
 await page.locator('[data-workspace=village]').click();await page.locator('#creator-rule-climate').check();assert(await days.isEnabled());
 await page.locator('[data-workspace=land]').click();
 for(const [key,value]of Object.entries({season_days:7,wet_rain_chance:0,dry_rain_chance:100,wet_evaporation:0.7,dry_evaporation:1.8,intro_days:0})){
  const input=page.locator('#creator-weather-'+key);await input.fill(String(value));await input.blur();
 }
 const intro=page.locator('#creator-weather-intro_days');await intro.fill('7');await intro.blur();await intro.fill('0');await intro.blur();
 await page.locator('#creator-undo').click();assert.equal(await intro.inputValue(),'7');
 await page.locator('#creator-redo').click();assert.equal(await page.locator('#creator-weather-intro_days').inputValue(),'0');
 await days.fill('0');await days.blur();assert(await page.locator('#creator-test').isDisabled());assert.match(await page.locator('#creator-issues').innerText(),/7–90/);
 await days.fill('7');await days.blur();
 const openingDay=page.locator('[data-opening-day]'),openingTime=page.locator('[data-opening-time]'),applyOpening=page.locator('[data-opening-apply]');
 assert.match(await page.locator('[data-opening-status]').textContent(),/Wet season/);
 await openingDay.fill('3473');await openingTime.fill('05:21');await applyOpening.click();
 assert.match(await page.locator('[data-opening-status]').textContent(),/through Day 3473 at 05:20/);
 await openingDay.fill('8');await openingTime.fill('08:30');await applyOpening.click();
 assert.match(await page.locator('[data-opening-status]').textContent(),/Dry season · day 1 of 7/);
 await page.locator('#creator-undo').click();assert.equal(await openingDay.inputValue(),'1');
 await page.locator('#creator-redo').click();assert.equal(await openingDay.inputValue(),'8');
 await page.locator('#creator-save').click();
 await page.waitForFunction(()=>document.querySelector('#creator-save-status').textContent.startsWith('Saved'));
 await page.reload();await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
 await page.locator('[data-workspace=land]').click();await page.locator('#creator-weather summary').click();assert.equal(await days.inputValue(),'7');assert.equal(await openingDay.inputValue(),'8');assert.equal(await openingTime.inputValue(),'08:30');
 await page.locator('[data-workspace=land]').click();await page.locator('#creator-weather').scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('#creator-map').getAttribute('aria-busy')==='false');await page.screenshot({path:'/private/tmp/solar-creator-weather.png'});
 await page.locator('#creator-test').click();await page.waitForFunction(()=>window.solarDev&&document.querySelector('.creation-session'));
 const weather=await page.evaluate(()=>window.solarDev.snapshot().environment.weather);
 assert.equal(weather.season_days,7);assert.equal(weather.profile.intro_days,0);assert.equal(weather.current.raining,false);assert.equal(weather.current.evaporation,Math.fround(1.8));
 assert.equal(await page.evaluate(()=>window.solarDev.snapshot().village.minutes),7*1440+510);
 assert(weather.forecast.every(day=>day.rain_expected && day.season==='dry'));
 await page.getByRole('button',{name:'Return to editor',exact:true}).click();await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
 await page.locator('[data-workspace=land]').click();await page.locator('#creator-weather summary').click();await page.getByRole('button',{name:'Use landscape weather',exact:true}).click();assert.equal(await days.inputValue(),'21');
 assert.deepEqual(errors,[]);console.log('PASS opening date bounds, season, history, reload and playtest. PASS player weather controls, rule enablement, invalid-profile repair, undo/redo, durable reload, native playtest forecasts and default reset.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
