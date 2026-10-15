import assert from 'node:assert/strict';
export async function checkOrganicControls({page,saved,capture}){
  if(!await page.locator('#dev-dialog').isVisible())await page.locator('#dev-button').click();
  await page.locator('#dev-import-file').setInputFiles('artifacts/organics/compost-cargo.json');
  await page.waitForFunction(()=>window.solarDev.snapshot().village.logistics.shipments.some(h=>h.carrying&&h.material===19));
  await page.locator('#dev-close').click();await page.locator('[data-hud-resource="food"]').click();
  await page.locator('[data-organic-supplies] summary').click();
  assert.match(await page.locator('[data-organic-supplies]').textContent(),/Mature compost must reach a growing plot/);
  await page.locator('[data-organic-supplies]').scrollIntoViewIfNeeded();
  await capture('Scraps and compost use local stores and resident cargo','organic-supplies.png');
  assert.equal(await page.locator('.material-slot[data-item="19"] strong').textContent(),'Mature compost');
  assert.equal(await page.locator('.material-slot[data-item="20"] strong').textContent(),'Kitchen scraps');
  await page.getByRole('button',{name:'Trade',exact:true}).click();
  assert.equal(await page.locator('#buy-20').count(),0,'Scraps are a local cooking byproduct');
  const input=page.getByRole('spinbutton',{name:'Order Mature compost',exact:true});await input.fill('1');
  await capture('Town sells mature compost while kitchen scraps stay in the local loop','organic-trade.png');
  await page.locator('#town-order').click();
  const s=await page.evaluate(()=>window.solarDev.snapshot());assert.equal(s.village.economy.orders.at(-1).items[19],1);assert.equal(s.village.economy.orders.at(-1).items[20],0);
  assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved);
}
