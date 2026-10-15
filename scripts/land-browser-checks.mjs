import assert from 'node:assert/strict';
export async function checkLandControls({page,saved,capture}){
  async function load(file){
    if(!await page.locator('#dev-dialog').isVisible())await page.locator('#dev-button').click();
    await page.locator('#dev-import-file').setInputFiles(`artifacts/land/${file}.json`);
    await page.waitForFunction(file=>{const v=window.solarDev.snapshot().village;return v.version===21&&v.mode==='sandbox'&&(file==='exhausted'?v.economy.sources.length===3&&v.land.deposits.some(d=>d.remaining===0):v.land.soil.length>0&&v.buildings.length===0);},file);
    await page.locator('#dev-close').click();
  }
  await load('exhausted');
  const baseline=await page.evaluate(()=>JSON.stringify(window.solarDev.snapshot()));
  const normal=await page.locator('#world').screenshot();
  await page.getByRole('button',{name:'Land views',exact:true}).click();
  assert(await page.getByRole('heading',{name:'Read the land',exact:true}).isVisible());
  await page.getByLabel('Land view',{exact:true}).selectOption('stone');
  await page.waitForFunction(()=>document.querySelector('#land-legend').textContent.includes('Blue-grey'));
  const overlay=await page.locator('#world').screenshot();assert(!normal.equals(overlay),'Land selection must actually change the rendered world');
  const world=await page.locator('#world').boundingBox();await page.mouse.move(world.x+world.width*.45,world.y+world.height*.6);
  await page.waitForFunction(()=>/Plot \d+, \d+/.test(document.querySelector('#land-hover').textContent));
  assert.match(await page.locator('#land-hover').textContent(),/Fertility \d+% · water retention/);
  await capture('Saved local stone patches remain visible after resident extraction exhausts one','land-stone.png');
  await page.keyboard.press('Escape');assert(!await page.locator('#land-map').isVisible());
  assert.equal(await page.locator('#land-map-toggle').getAttribute('aria-expanded'),'false');
  assert.equal(await page.evaluate(()=>JSON.stringify(window.solarDev.snapshot())),baseline,'Reading and closing overlays cannot mutate a village');
  await load('disturbed');
  await page.getByRole('button',{name:'Land views',exact:true}).click();
  await page.getByLabel('Land view',{exact:true}).selectOption('disturbance');
  assert.match(await page.locator('#land-legend').textContent(),/foundation work/);
  await capture('Foundation disturbance survives real resident demolition','land-disturbed.png');
  await page.getByLabel('Land view',{exact:true}).selectOption('retention');
  assert.match(await page.locator('#land-legend').textContent(),/not stored water/);
  await page.getByRole('button',{name:'Close land views',exact:true}).click();
  assert(!await page.locator('#land-map').isVisible());
  assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved);
  await page.locator('#dev-button').click();
  assert.match(await page.locator('[data-land-diagnostics]').textContent(),/9 local patches/);
}

