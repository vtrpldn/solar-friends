import assert from 'node:assert/strict';
export async function checkGatheringControls({page,saved,capture}){
  async function load(file){
    if(!await page.locator('#dev-dialog').isVisible())await page.locator('#dev-button').click();
    await page.locator('#dev-import-file').setInputFiles(`artifacts/gathering/${file}.json`);
    await page.waitForFunction(file=>{const v=window.solarDev.snapshot().village;return v.buildings[0]?.kind==='square'&&(file==='start'?v.progress.gathering_delivery==null:v.progress.gathering_delivery?.phase==='preparing'&&v.logistics.shipments.some(h=>h.material===17&&h.carrying));},file);
    await page.locator('#dev-close').click();
  }
  await load('start');await page.getByRole('button',{name:'People',exact:true}).click();
  await page.getByRole('button',{name:'Host a gathering',exact:true}).click();
  let s=await page.evaluate(()=>window.solarDev.snapshot());
  assert.equal(s.village.meals,10);assert.equal(s.village.progress.gathering_delivery.phase,'preparing');
  assert.equal(s.environment.economy.materials[17].reserved,5);
  assert(!await page.locator('#host-gathering').isEnabled());
  assert((await page.locator('#gathering-status').textContent()).includes('0/5 meals delivered'));
  await capture('Planning reserves five meals while neighbours prepare delivery','gathering-planned.png');
  await page.locator('[data-hud-resource="food"]').click();
  await page.getByRole('tab',{name:'Stores',exact:true}).click();
  if(!await page.locator('#material-inventory').isVisible())await page.getByText('Stored supplies',{exact:true}).click();
  assert((await page.locator('.material-slot[data-item="17"]').textContent()).includes('5 free · 5 reserved'));
  await page.getByRole('tab',{name:'Pantry',exact:true}).click();
  await page.locator('#shared-table').scrollIntoViewIfNeeded();
  assert(await page.getByRole('button',{name:'Cancel gathering from Supplies',exact:true}).isVisible());
  await load('cargo');await page.locator('[data-hud-resource="food"]').click();
  assert((await page.locator('#shared-table-status').textContent()).includes('5 on the way'));
  await page.getByRole('button',{name:'Cancel gathering from Supplies',exact:true}).click();
  s=await page.evaluate(()=>window.solarDev.snapshot());
  assert.equal(s.village.meals,10);assert.equal(s.village.progress.gathering_delivery.phase,'cancelled');
  assert.equal(s.environment.economy.materials[17].reserved,0);
  // Inspect the actual recovery handoff before another neighbour can reclaim it.
  await page.locator('#dev-button').click();await page.getByRole('button',{name:'Single tick · ¼ second',exact:true}).click();
  s=await page.evaluate(()=>window.solarDev.snapshot());
  assert(s.village.logistics.stores.some(p=>p.owner.kind==='ground'&&p.items[17]>0));
  await page.locator('#dev-close').click();await page.locator('[data-hud-resource="food"]').click();
  await page.locator('#shared-table').scrollIntoViewIfNeeded();
  await capture('Cancelling carried gathering food leaves its portions recoverable','gathering-recovery.png');
  await load('start');await page.getByRole('button',{name:'People',exact:true}).click();
  await page.getByRole('button',{name:'Host a gathering',exact:true}).click();
  await page.locator('#dev-button').click();await page.locator('#dev-minutes').fill('200');await page.locator('#dev-advance').click();
  s=await page.evaluate(()=>window.solarDev.snapshot());
  assert.equal(s.village.progress.gathering_delivery.phase,'complete');assert.equal(s.village.progress.gatherings,1);
  assert.equal(s.village.progress.gathering_delivery.spent_after,5);
  await page.locator('#dev-close').click();await page.locator('[data-hud-resource="food"]').click();
  assert((await page.locator('#shared-table-status').textContent()).includes('1 gathering shared'));
  assert(!await page.getByRole('button',{name:'Cancel gathering from Supplies',exact:true}).isVisible());
  await page.locator('#shared-table').scrollIntoViewIfNeeded();
  await capture('Delivered portions are shared once and friendships grow through attendance','gathering-complete.png');
  assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved);
}
