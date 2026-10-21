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
 await page.locator('#creator-weather summary').click();
 const days=page.locator('#creator-weather-season_days');await page.locator('#creator-rule-climate').uncheck();assert(await days.isDisabled());
 await page.locator('#creator-rule-climate').check();assert(await days.isEnabled());
 for(const [key,value]of Object.entries({season_days:7,wet_rain_chance:0,dry_rain_chance:100,wet_evaporation:0.7,dry_evaporation:1.8,intro_days:0})){
  const input=page.locator('#creator-weather-'+key);await input.fill(String(value));await input.blur();
 }
 const intro=page.locator('#creator-weather-intro_days');await intro.fill('7');await intro.blur();await intro.fill('0');await intro.blur();
 await page.locator('#creator-undo').click();assert.equal(await intro.inputValue(),'7');
 await page.locator('#creator-redo').click();assert.equal(await page.locator('#creator-weather-intro_days').inputValue(),'0');
 await days.fill('0');await days.blur();assert(await page.locator('#creator-test').isDisabled());assert.match(await page.locator('#creator-issues').innerText(),/7–90/);
 await days.fill('7');await days.blur();await page.locator('#creator-save').click();
 await page.waitForFunction(()=>document.querySelector('#creator-save-status').textContent.startsWith('Saved'));
 await page.reload();await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
 await page.locator('#creator-weather summary').click();assert.equal(await days.inputValue(),'7');
 await page.locator('#creator-weather').scrollIntoViewIfNeeded();await page.screenshot({path:'/private/tmp/solar-creator-weather.png'});
 await page.locator('#creator-test').click();await page.waitForFunction(()=>window.solarDev&&document.querySelector('.creation-session'));
 const weather=await page.evaluate(()=>window.solarDev.snapshot().environment.weather);
 assert.equal(weather.season_days,7);assert.equal(weather.profile.intro_days,0);assert.equal(weather.current.raining,false);assert.equal(weather.current.evaporation,Math.fround(0.7));
 assert(weather.forecast.every(day=>!day.rain_expected));
 await page.getByRole('button',{name:'Return to editor',exact:true}).click();await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
 await page.locator('#creator-weather summary').click();await page.getByRole('button',{name:'Use landscape weather',exact:true}).click();assert.equal(await days.inputValue(),'21');
 assert.deepEqual(errors,[]);console.log('PASS player weather controls, rule enablement, invalid-profile repair, undo/redo, durable reload, native playtest forecasts and default reset.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
