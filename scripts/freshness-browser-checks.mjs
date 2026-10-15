import assert from 'node:assert/strict';
export async function checkFreshnessControls({page,saved,capture}){
  async function load(file,check){
    if(!await page.locator('#dev-dialog').isVisible())await page.locator('#dev-button').click();
    await page.locator('#dev-import-file').setInputFiles(`artifacts/freshness/${file}.json`);
    await page.waitForFunction(check);
    await page.locator('#dev-close').click();await page.locator('[data-hud-resource="food"]').click();
  }
  await load('use-soon',()=>{const v=window.solarDev.snapshot().village;return v.minutes===6300&&v.food===36;});
  await page.getByText('Keeping food fresh',{exact:true}).click();
  assert.match(await page.locator('#food-freshness').textContent(),/36 to use within a day/);
  assert.match(await page.locator('#food-freshness').textContent(),/No food has spoiled/);
  await page.locator('#food-freshness').scrollIntoViewIfNeeded();
  await capture('Freshness dates and portions to use soon are visible in Supplies','freshness-use-soon.png');
  await page.locator('#dev-button').click();await page.locator('#dev-minutes').fill('1');await page.locator('#dev-advance').click();
  let s=await page.evaluate(()=>window.solarDev.snapshot());assert.equal(s.village.freshness.expired[16],36);assert.equal(s.village.food,0);
  await page.locator('#dev-close').click();await page.locator('[data-hud-resource="food"]').click();
  if(!await page.locator('#food-freshness').isVisible())await page.getByText('Keeping food fresh',{exact:true}).click();
  assert.match(await page.locator('#food-freshness').textContent(),/Spoiled so far: 36 ingredients/);
  assert(!/36 to use within a day/.test(await page.locator('#food-freshness').textContent()));
  await capture('Spoilage removes real portions and reports the loss','freshness-spoiled.png');
  await load('pot-spoiled',()=>window.solarDev.snapshot().village.production.batches.some(b=>b.spoiled));
  assert.match(await page.locator('#kitchen-batches').textContent(),/Previous pot spoiled. Fresh inputs and held gas were recovered/);
  await page.locator('#kitchen-batches').scrollIntoViewIfNeeded();await capture('Interrupted pots recover only fresh inputs and allow replacement','freshness-pot.png');
  assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved);
}
