import assert from 'node:assert/strict';
export async function checkPlantingControls({page,saved,capture}){
  const state=()=>page.evaluate(()=>window.solarDev.snapshot());
  async function load(file){
    if(!await page.locator('#dev-dialog').isVisible())await page.locator('#dev-button').click();
    await page.locator('#dev-import-file').setInputFiles(`artifacts/planting/${file}.json`);
    await page.waitForFunction(file=>{const s=window.solarDev.snapshot();return s.village.version===33&&(file==='forestry-cargo'?s.village.logistics.shipments.some(h=>h.carrying&&h.material===22):file==='vegetable-cargo'?s.village.logistics.shipments.some(h=>h.carrying&&h.material===21):file==='planting-work'?s.residents.some(r=>r.task==='source'&&r.activity_material===0)&&!s.village.economy.sources[0].planted:s.village.economy.sources.length===2&&s.village.logistics.shipments.length===0);},file);
    await page.locator('#dev-close').click();
  }
  async function supplies(){await page.locator('[data-hud-resource="food"]').click();await page.getByRole('tab',{name:'Ecology',exact:true}).click();if(!await page.locator('[data-planting-supplies]').evaluate(el=>el.open))await page.locator('[data-planting-supplies] summary').click();await page.locator('[data-planting-supplies]').scrollIntoViewIfNeeded();}
  await load('forestry-cargo');await supplies();
  assert.match(await page.locator('[data-planting-cargo]').allTextContents().then(rows=>rows.join(' ')),/Iara.*carrying 4 timber seedlings/);
  assert.match(await page.locator('[data-planting-supplies]').textContent(),/one bamboo start/);
  await capture('Residents carry separate timber seedlings and bamboo starts to marked plots','planting-forestry-cargo.png');
  await load('queued');await page.locator('#open-village').click();await page.getByRole('button',{name:'Construction',exact:true}).click();
  if(!await page.locator('#land-sources').evaluate(el=>el.closest('details').open))await page.getByText('Our land resources',{exact:true}).click();
  assert.match(await page.locator('#land-sources').textContent(),/Awaiting resident planting/);assert.match(await page.locator('#land-sources').textContent(),/0 \/ 4 timber seedlings at this plot/);
  await capture('Marked forestry plots expose delivered stock and attended planting requirements','planting-queued.png');
  await page.getByRole('button',{name:'Trade',exact:true}).click();
  await page.getByRole('spinbutton',{name:'Order Timber seedlings',exact:true}).fill('1');await page.getByRole('spinbutton',{name:'Order Bamboo starts',exact:true}).fill('1');await page.locator('#town-order').click();
  let s=await state();assert.equal(s.village.economy.orders.at(-1).items[22],1);assert.equal(s.village.economy.orders.at(-1).items[23],1);
  await load('planting-work');await page.locator('#dev-button').click();await page.locator('#dev-minutes').fill('60');await page.locator('#dev-advance').click();
  s=await state();assert(s.village.economy.sources[0].planted);assert.equal(s.village.economy.stock[22],0);assert(!s.village.progress.timber_replanted);await page.locator('#dev-close').click();
  await load('vegetable-cargo');await supplies();
  assert.match(await page.locator('[data-planting-cargo]').textContent(),/carrying 1 vegetable seedling to Garden 2/);
  await capture('A greenhouse seedling travels to an outdoor garden before its planting bonus','planting-vegetable-cargo.png');
  await page.getByRole('button',{name:'Close supplies',exact:true}).click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved);
  await page.locator('#dev-button').click();
}
