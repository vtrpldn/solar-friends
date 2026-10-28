import {worldPoint} from './browser-world-point.mjs';
import assert from 'node:assert/strict';
export async function checkCultivationControls({page,saved,capture}){
  async function load(name){
    if(!await page.locator('#dev-dialog').isVisible())await page.locator('#dev-button').click();
    await page.locator('#dev-import-file').setInputFiles(`artifacts/cultivation/${name}.json`);
    await page.waitForFunction(name=>{const v=window.solarDev.snapshot().village;return v.version===45&&(name==='shade'?v.buildings.some(b=>b.kind==='solar_farm')&&v.buildings.some(b=>b.kind==='grove'):v.buildings.some(b=>b.kind==='garden'&&b.crop.planted)&&v.land.soil.some(s=>s.nutrients<.5));},name);
    await page.locator('#dev-close').click();
    await page.locator('#center').click();
  }
  async function point(x,y){const p=await worldPoint(page,x,y);await page.mouse.move(p.x,p.y);await page.waitForFunction(({x,y})=>document.querySelector('#land-hover').textContent.includes(`Plot ${x}, ${y} ·`),{x,y});}
  await load('depleted-growing');
  await page.locator('#open-village').click();if(!await page.locator('#building-panel').isVisible())await page.getByRole('button',{name:'Buildings',exact:true}).click();await page.locator('#building-choice').selectOption('0');
  assert.match(await page.locator('#crop-status').textContent(),/At current soil and supplies: \d+–\d+ food/);
  assert.match(await page.locator('#crop-details').textContent(),/Root-zone wetness.*tree shade.*Growth ×0\./);
  await page.locator('#building-panel [data-close-panel]').click();
  await page.locator('[data-hud-resource="food"]').click();await page.getByRole('tab',{name:'Ecology',exact:true}).click();
  if(!await page.locator('[data-growing-plots]').evaluate(el=>el.open))await page.locator('[data-growing-plots] summary').click();
  assert.match(await page.locator('[data-growing-plots]').textContent(),/Soil fertility.*moisture.*tree shade.*growth ×/);
  await capture('Actual resident-tended crops show persistent soil conditions and adjusted growing time','cultivation-soil.png');
  await page.getByRole('button',{name:'Close supplies',exact:true}).click();
  const before=await page.evaluate(()=>JSON.stringify(window.solarDev.snapshot()));
  await page.getByRole('button',{name:'Land views',exact:true}).click();await page.getByLabel('Land view',{exact:true}).selectOption('moisture');await point(5,5);
  const v=await page.evaluate(()=>window.solarDev.snapshot().village),moisture=Math.round(v.land.water[5*v.map_size+5]*100);
  assert((await page.locator('#land-hover').textContent()).includes(`Moisture ${moisture}%`));
  assert.match(await page.locator('#land-hover').textContent(),/Crop growth ×0\./);
  await capture('Saved root-zone water and crop potential are inspectable on the actual plot','cultivation-moisture.png');
  await page.getByRole('button',{name:'Close land views',exact:true}).click();
  assert.equal(await page.evaluate(()=>JSON.stringify(window.solarDev.snapshot())),before);
  await load('shade');await page.getByRole('button',{name:'Land views',exact:true}).click();await page.getByLabel('Land view',{exact:true}).selectOption('shade');await point(18,18);
  const text=await page.locator('#land-hover').textContent();assert(!text.includes('tree shade 0%'));assert(!text.includes('Solar exposure 100%'));
  await capture('Visible tree canopy reduces solar exposure beside the generator','cultivation-shade.png');
  await page.keyboard.press('Escape');assert(!await page.locator('#land-map').isVisible());
  assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved);
  await page.locator('#dev-button').click();
}
