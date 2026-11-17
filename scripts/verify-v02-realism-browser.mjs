import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {createSandbox,planField,plan,PROJECTS,save,restore} from '../web/v02/weekend/simulation.js';
import {ensureAnimalCare} from '../web/v02/weekend/animal-care.js';
import {weatherStep} from '../web/v02/weekend/weather.js';
import {SANDBOX_SAVE} from '../web/v02/weekend/modes.js';
const out=process.env.REALISM_SCREENSHOTS||'/tmp/solar-realism';await mkdir(out,{recursive:true});
const s=createSandbox(42);assert.equal(planField(s,50,50,[4,4]),'');const field=s.projects.at(-1),bed=field.cultivation.beds[0];Object.assign(bed,{stage:'failed',growth:.5,droughtDamage:1,drySeconds:3200*7,moisture:0});
assert.equal(plan(s,'coop',59,50),'');const coop=s.projects.at(-1);coop.work=PROJECTS.coop.work;coop.animalHealth=55;ensureAnimalCare(s,coop,'coop');
s.view={speed:1,paused:true,position:[64,35,64],target:[44,0,40],zoom:1};weatherStep(s);assert(restore(save(s)));
const server=await serve(0),browser=await chromium.launch({headless:true,args:['--mute-audio']});const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.addInitScript(({key,value})=>{if(!sessionStorage.getItem('realism-fixture')){localStorage.setItem(key,value);sessionStorage.setItem('realism-fixture','1');}},{key:SANDBOX_SAVE,value:save(s)});
 await page.goto(`http://127.0.0.1:${server.address().port}/v2/?mode=sandbox`);await page.waitForSelector('#weather-summary');await page.waitForTimeout(1500);
 await page.locator('#weather-summary').click();assert(await page.locator('#weather-forecast').isVisible());assert.match(await page.locator('#weather-forecast').innerText(),/Day 3/);await page.screenshot({path:`${out}/forecast.png`});await page.locator('#weather-summary').click();
 await page.locator('[data-panel-toggle="projects-panel"]').click();await page.locator('#completed-title').click();
 await page.locator('#completed-tasks button').filter({hasText:'Cultivated field'}).first().click();await page.locator('#farm-inspect-bed').click();await page.waitForSelector('#farm-bed');assert.match(await page.locator('#cultivation-panel').innerText(),/Failed|failed/);
 const clear=page.locator('[data-farm-action="clear"]');assert(await clear.isEnabled());await page.screenshot({path:`${out}/failed-crop.png`});page.once('dialog',dialog=>dialog.accept());await clear.click();assert.match(await page.locator('#cultivation-panel').innerText(),/queued|pending/);await page.locator('#close-farm').click();
 await page.locator('[data-manage="resources"]').first().click();assert.match(await page.locator('#production-sites').innerText(),/feed 0.00 kg.*drinking water 0.0 L/);await page.screenshot({path:`${out}/animal-care.png`});await page.keyboard.press('Escape');
 await page.locator('[data-manage="water"]').first().click();assert.match(await page.locator('#utility-summary').innerText(),/Groundwater.*river reserve/);await page.screenshot({path:`${out}/water.png`});await page.keyboard.press('Escape');
 await page.locator('[data-panel-toggle="people"]').click();assert.match(await page.locator('#resident-detail').innerText(),/Hydration/);await page.screenshot({path:`${out}/hydration.png`});await page.keyboard.press('Escape');
 await page.reload();await page.waitForSelector('#weather-summary');await page.waitForTimeout(500);assert.deepEqual(errors,[]);
 for(const viewport of [{width:1000,height:750},{width:1280,height:720}]){await page.setViewportSize(viewport);await page.locator('#weather-summary').click();assert(await page.locator('#weather-forecast').isVisible());const box=await page.locator('#weather-forecast').boundingBox();assert(box.x>=0&&box.x+box.width<=viewport.width);await page.screenshot({path:`${out}/forecast-${viewport.width}.png`});await page.locator('#weather-summary').click();}
 console.log('PASS desktop forecast disclosure, failed-crop clearing, animal reserves, watershed inspection and reload without browser exceptions');
}finally{await browser.close();server.close();}
