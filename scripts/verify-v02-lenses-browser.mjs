import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {serve} from './serve.mjs';
import {mkdir} from 'node:fs/promises';
const out=process.env.LENS_SCREENSHOTS||'/tmp/solar-lenses';await mkdir(out,{recursive:true});
const server=await serve(0);
const browser=await chromium.launch({headless:true,args:['--mute-audio',...(process.platform==='linux'?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[])]});
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try {
await page.goto(`http://127.0.0.1:${server.address().port}/v2/?utilities-preview&interactions&lighting-hour=12`);
await page.waitForSelector('#lens-toggle');
// The lighting preview starts paused, which also exercises view updates without simulation ticks.
const ids=['power','water','construction','resources','residents','access','food','sanitation','work','land','comfort','ecology','chains'];
for(const id of ids){await page.locator('#lens-toggle').click();await page.locator(`[data-lens="${id}"]`).click();await page.waitForTimeout(850);assert.equal(await page.locator('body').getAttribute('data-lens'),id);assert(await page.locator('#lens-legend').isVisible());console.log(id,await page.locator('#lens-count').innerText());}
await page.locator('#lens-filter').selectOption('food');
await page.waitForTimeout(850);
await page.screenshot({path:`${out}/chains.png`});
await page.keyboard.press('Escape');assert.equal(await page.locator('body').getAttribute('data-lens'),'');
await page.keyboard.press('l');assert(await page.locator('#lens-panel').isVisible());
await page.locator('[data-lens="power"]').click();await page.waitForTimeout(850);
await page.screenshot({path:`${out}/power.png`});
await page.locator('#pause').click(); // Keep buttons clickable while live values refresh.
await page.locator('#lens-results summary').click();await page.locator('#lens-list button').filter({hasText:'Workshop'}).click();
assert(await page.locator('#selection').isVisible());
assert.equal(await page.locator('body').getAttribute('data-lens'),'power');
await page.setViewportSize({width:1000,height:750});await page.screenshot({path:`${out}/small.png`});
await page.keyboard.press('Escape');
await page.locator('#close-selection').click();
assert(!(await page.locator('#selection').isVisible()));
assert.deepEqual(errors,[]);
} finally { await browser.close();server.close(); }
console.log('PASS every lens selector, filter, keyboard dismissal and empty states; no browser exceptions');
