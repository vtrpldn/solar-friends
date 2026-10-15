import assert from 'node:assert/strict';

export async function checkFoodControls({page,saved,capture}){
  await page.locator('#dev-button').click();
  await page.locator('#dev-import-file').setInputFiles('artifacts/food/cooked.json');
  await page.waitForFunction(()=>{const v=window.solarDev.snapshot().village;return v.buildings.length===1&&v.buildings[0].kind==='kitchen'&&v.meals===5;});
  await page.locator('#dev-close').click();
  await page.locator('[data-hud-resource="food"]').click();
  if(!await page.locator('#material-inventory').isVisible())await page.getByText('Stored supplies',{exact:true}).click();
  assert.equal(await page.locator('.material-slot').count(),21);
  assert((await page.locator('.material-slot[data-item="17"]').textContent()).includes('5 free'));
  const location=page.locator('.storage-location').filter({hasText:'Kitchen pantry 1'});
  assert((await location.textContent()).includes('3 ingredients · 5 prepared meals'));
  await location.scrollIntoViewIfNeeded();
  await capture('Cooked portions and delivered ingredients remain in the kitchen pantry','food-pantry.png');
  await page.getByRole('button',{name:'Trade',exact:true}).click();
  await page.locator('#town-clear').click();await page.locator('[name="town-transport"][value="delivery"]').check();
  for(const item of ['ingredients','prepared meals','eggs'])await page.getByRole('button',{name:`Add one ${item}`,exact:true}).click();
  const before=await page.evaluate(()=>window.solarDev.snapshot());
  await page.getByRole('button',{name:'Buy supplies',exact:true}).click();
  const ordered=await page.evaluate(()=>window.solarDev.snapshot());
  assert.deepEqual(ordered.village.economy.orders.at(-1).items.slice(16,19),[1,1,1]);
  assert.equal(ordered.village.economy.money,before.village.economy.money-7500);
  await capture('Town food purchases use the real trade controls','food-trade.png');
  await page.locator('#dev-button').click();await page.locator('#dev-import-file').setInputFiles('artifacts/food/eating-route.json');
  await page.waitForFunction(()=>window.solarDev.snapshot().residents.find(r=>r.id===0).help?.task==='eat');
  const portions=await page.evaluate(()=>window.solarDev.snapshot().village.supplies.portions_eaten);
  await page.locator('#dev-minutes').fill('60');await page.locator('#dev-advance').click();
  const fed=await page.evaluate(()=>window.solarDev.snapshot());
  assert(fed.village.supplies.portions_eaten>portions);assert(fed.residents.find(r=>r.id===0).hunger<30);
  assert.equal(fed.residents.find(r=>r.id===0).help.phase,'complete');
  await page.locator('#dev-close').click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved);
}
