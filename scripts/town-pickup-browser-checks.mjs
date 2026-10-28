import assert from 'node:assert/strict';
export async function checkTownPickupControls({page,saved,capture}){
  if(!await page.locator('#dev-dialog').isVisible())await page.locator('#dev-button').click();
  // Exercise the real request controls. Building visitors also use a .requests grid.
  await page.locator('#dev-scenario').selectOption('village');await page.locator('#dev-load').click();
  await page.waitForFunction(()=>window.solarDev.scenario()==='village');
  await page.locator('#dev-close').click();
  // Buy a small order for collection through the real Trade controls.
  const stockBefore=await page.evaluate(()=>window.solarDev.snapshot().environment.economy.materials[12].stored);
  await page.getByRole('button',{name:'Village',exact:true}).click();
  await page.getByRole('button',{name:'Trade',exact:true}).click();
  await page.locator('[name="town-transport"][value="pickup"]').check();
  await page.locator('#buy-0').fill('41');
  assert(!await page.locator('#town-order').isEnabled());
  assert((await page.locator('#town-basket-status').textContent()).includes('40 units'));
  await page.locator('#buy-0').fill('0');await page.locator('#buy-12').fill('2');
  await page.locator('#town-catalog-scope').click();
  assert.equal(await page.locator('#buy-12').inputValue(),'2','Focusing needs must preserve the basket');
  assert(await page.locator('#buy-12').isVisible(),'Selected supplies remain available in focused view');
  assert(!await page.locator('#buy-27').isVisible(),'Unneeded late-game livestock stays out of a focused purchase');
  await page.locator('#town-catalog-scope').click();
  assert(await page.locator('#buy-27').isVisible(),'The full supplier catalog remains reachable');
  await page.locator('#pickup-driver').selectOption('0');
  assert((await page.locator('#town-total').textContent()).includes('580'));
  await page.locator('#town-order').click();
  assert((await page.locator('#town-pickup-status').textContent()).includes('Resume time'));
  let pickup=await page.evaluate(()=>window.solarDev.snapshot());
  assert.equal(pickup.residents[0].trip.purpose,'pickup');
  assert.equal(pickup.village.economy.orders[0].status,'collecting');
  assert.equal(pickup.environment.economy.materials[12].stored,stockBefore);
  await page.locator('#dev-button').click();await page.locator('#dev-minutes').fill('90');await page.locator('#dev-advance').click();
  pickup=await page.evaluate(()=>window.solarDev.snapshot());
  for(let elapsed=0;elapsed<360&&pickup.residents[0].trip?.phase==='leaving';elapsed+=5){
    await page.locator('#dev-minutes').fill('5');await page.locator('#dev-advance').click();
    pickup=await page.evaluate(()=>window.solarDev.snapshot());
    assert.equal(pickup.environment.economy.materials[12].stored,stockBefore,'Walking to the property exit cannot deliver the town order');
  }
  assert.equal(pickup.residents[0].trip.phase,'away');
  assert.equal(pickup.environment.economy.materials[12].stored,stockBefore);
  await page.locator('#dev-close').click();await page.locator('[data-citizen="0"]').click();
  assert((await page.locator('#person').textContent()).includes('Driving to collect supplies'));
  await page.getByRole('button',{name:'Close resident details',exact:true}).click();
  await page.locator('#dev-button').click();await page.locator('#dev-minutes').fill('120');await page.locator('#dev-advance').click();
  pickup=await page.evaluate(()=>window.solarDev.snapshot());
  for(let elapsed=0;elapsed<360&&pickup.village.economy.orders[0].status!=='delivered';elapsed+=5){
    await page.locator('#dev-minutes').fill('5');await page.locator('#dev-advance').click();
    pickup=await page.evaluate(()=>window.solarDev.snapshot());
  }
  assert.equal(pickup.village.economy.orders[0].status,'delivered');
  assert.equal(pickup.environment.economy.materials[12].stored,stockBefore+2);
  assert.equal(pickup.environment.economy.materials[12].incoming,0);
  await page.locator('#dev-close').click();await page.getByRole('button',{name:'Village',exact:true}).click();await page.getByRole('button',{name:'Trade',exact:true}).click();
  assert((await page.locator('#town-pickup-status').textContent()).includes('supplies home'));
  await page.locator('#dev-button').click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved);
  // An order awaiting dispatch can switch to pickup without paying twice.
  await page.locator('#dev-load').click();await page.locator('#dev-close').click();
  await page.getByRole('button',{name:'Village',exact:true}).click();await page.getByRole('button',{name:'Trade',exact:true}).click();
  await page.locator('[name="town-transport"][value="delivery"]').check();await page.locator('#buy-10').fill('1');await page.locator('#town-order').click();
  const deliveryFunds=await page.evaluate(()=>window.solarDev.snapshot().village.economy.money);
  const deliveries=page.locator('details').filter({has:page.locator('#town-orders')});if(!await deliveries.evaluate(el=>el.open))await deliveries.locator('summary').click();await page.locator('[data-collect-order="0"]').click();
  await page.locator('#pickup-order-driver').selectOption('1');
  assert((await page.locator('#pickup-order-summary').textContent()).includes('R$ 40'));
  await capture('Choose a driver for same-day town pickup','town-pickup.png');
  await page.locator('#pickup-confirm').click();
  pickup=await page.evaluate(()=>window.solarDev.snapshot());
  assert.equal(pickup.village.economy.money,deliveryFunds+4000);
  assert.equal(pickup.residents[1].trip.purpose,'pickup');
}
