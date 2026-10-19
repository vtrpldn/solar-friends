import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:n%100?2:0,maximumFractionDigits:2}).format(n/100);
export async function checkSupplierControls({page,saved,capture}){
  const snap=()=>page.evaluate(()=>window.solarDev.snapshot());
  if(await page.locator('#dev-dialog').isVisible())await page.locator('#dev-close').click();
  await page.locator('[data-hud-resource="fund"]').click();await page.locator('#buy-0').fill('2');await page.locator('[name="town-transport"][value="pickup"]').check();
  await page.locator('#dev-button').click();await page.locator('[data-dev-tab="simulation"]').click();await page.locator('#dev-scenario').selectOption('suppliers');await page.locator('#dev-load').click();
  await page.waitForFunction(()=>window.solarDev.scenario()==='suppliers');await page.locator('#dev-close').click();await page.locator('[data-hud-resource="fund"]').click();
  assert.equal(await page.locator('#buy-0').inputValue(),'0','Changing villages clears the previous shopping list');assert(await page.locator('[name="town-transport"][value="delivery"]').isChecked());
  const original=await snap(),offer=original.environment.economy.market.current.offer,regular=original.environment.economy.materials[offer.material].price;
  assert(!await page.locator('#supplier-option').isVisible());assert.match(await page.locator('#supplier-offer-stock').textContent(),/offer units left/);
  for(const viewport of [{width:1600,height:900},{width:1280,height:800}]){
    await page.setViewportSize(viewport);await page.locator('#supplier-board').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('#town-panel').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
    await capture(`Town offer uses the existing trade book at ${viewport.width}px`,`suppliers-board-${viewport.width}.png`);
  }
  await page.locator('#jobs-outlook').click();assert(await page.locator('.outside-jobs').evaluate(el=>el.open));assert.equal(await page.locator('.occupation-card').count(),5);await page.locator('.outside-jobs summary').click();
  await page.locator('#supplier-future summary').click();assert.equal(await page.locator('#supplier-calendar li').count(),7);
  assert.match(await page.locator('#supplier-next').textContent(),/Next restock/);assert.match(await page.locator('#supplier-price-watch').textContent(),/→/);
  await page.locator('#supplier-calendar').scrollIntoViewIfNeeded();await capture('Seeded restock prices and the freight calendar are visible before buying','suppliers-forecast.png');
  await page.locator('#supplier-future summary').click();
  await page.locator('#supplier-add-offer').click();assert.equal(Number(await page.locator(`#buy-${offer.material}`).inputValue()),offer.remaining);
  await page.locator(`#buy-${offer.material}`).fill(String(offer.stock+1));
  const cost=offer.stock*offer.unit_price+regular+6000;
  assert.equal(await page.locator('#town-total').textContent(),money(cost));assert.match(await page.locator('#town-delivery').textContent(),/agreed arrival/);
  await page.locator(`#buy-${offer.material}`).fill('1.5');assert(await page.locator('#town-order').isDisabled());assert.match(await page.locator('#town-basket-status').textContent(),/whole quantities/);
  await page.locator(`#buy-${offer.material}`).fill(String(offer.stock+1));
  const mutations=await page.locator('#supplier-board').evaluate(el=>new Promise(resolve=>{let n=0;const observer=new MutationObserver(records=>n+=records.length);observer.observe(el,{subtree:true,attributes:true,childList:true,characterData:true});setTimeout(()=>{observer.disconnect();resolve(n);},600);}));
  assert.equal(mutations,0,'Paused supplier notices do not churn');
  await page.locator('#town-order').click();const purchased=(await snap()).village.economy.orders.at(-1);
  assert.equal(purchased.paid,cost);assert.equal(purchased.terms.discount.units,offer.stock);assert.equal((await snap()).village.economy.money,original.village.economy.money-cost);
  assert(await page.locator('#supplier-add-offer').isDisabled());assert.match(await page.locator('#supplier-offer-stock').textContent(),/regular supplies are still available/);
  await page.locator('details').filter({has:page.locator('#town-orders')}).locator('summary').click();
  assert.match(await page.locator('#town-orders').textContent(),/Price agreed Day 15/);await page.locator('#town-orders').scrollIntoViewIfNeeded();
  await capture('Confirmed receipts preserve the partial offer price and arrival date','suppliers-receipt.png');
  await page.locator(`[data-cancel-order="${purchased.id}"]`).click();assert.equal((await snap()).village.economy.money,original.village.economy.money);assert.equal((await snap()).environment.economy.market.current.offer.remaining,offer.stock);
  await page.locator('[name="town-transport"][value="pickup"]').check();await page.locator('#supplier-add-offer').click();
  assert.equal(await page.locator('#town-total').textContent(),money(offer.stock*offer.unit_price+2000));await page.locator('#town-order').click();
  const pickup=(await snap()).village.economy.orders.at(-1);assert.equal(pickup.status,'collecting');assert.equal(pickup.terms.arrival,null);
  const minute=(await snap()).village.minutes;await page.locator('#dev-button').click();await page.locator('#dev-minutes').fill('360');await page.locator('#dev-advance').click();await page.waitForFunction(t=>window.solarDev.snapshot().village.minutes>=t,minute+360);await page.locator('#dev-close').click();
  assert.equal((await snap()).village.economy.orders.find(o=>o.id===pickup.id).status,'delivered');assert.equal((await snap()).village.economy.orders.find(o=>o.id===pickup.id).paid,pickup.paid);
  await page.locator('#town-orders').scrollIntoViewIfNeeded();await capture('A resident returns the purchased offer through a real town pickup','suppliers-pickup.png');
  const freightFixture=JSON.parse(await readFile('artifacts/suppliers/freight-before.json','utf8'));
  await page.locator('#dev-button').click();await page.locator('#dev-import-file').setInputFiles('artifacts/suppliers/freight-before.json');await page.waitForFunction(t=>window.solarDev.snapshot().village.minutes===t,freightFixture.village.minutes);await page.locator('#dev-close').click();await page.locator('[data-hud-resource="fund"]').click();
  await page.locator('#town-clear').click();await page.locator('[name="town-transport"][value="delivery"]').check();await page.locator('#buy-8').fill('1');
  const due=(await snap()).environment.economy.next_delivery;
  assert.match(await page.locator('#town-delivery').textContent(),new RegExp(`Day ${1+Math.floor(due/1440)}`));await page.locator('#town-order').click();assert.equal((await snap()).village.economy.orders.at(-1).arrival,due);
  if(!await page.locator('details').filter({has:page.locator('#town-orders')}).evaluate(el=>el.open))await page.locator('details').filter({has:page.locator('#town-orders')}).locator('summary').click();
  await page.locator('#town-orders').scrollIntoViewIfNeeded();await capture('A delayed freight date is quoted and retained in the confirmed order','suppliers-freight.png');
  const rollover=JSON.parse(await readFile('artifacts/suppliers/weekly-rollover.json','utf8'));
  await page.locator('#dev-button').click();await page.locator('#dev-import-file').setInputFiles('artifacts/suppliers/weekly-rollover.json');await page.waitForFunction(t=>window.solarDev.snapshot().village.minutes===t,rollover.village.minutes);await page.locator('#dev-close').click();await page.locator('[data-hud-resource="fund"]').click();
  const market=(await snap()).environment.economy.market;
  const item=market.current.prices.findIndex((price,i)=>price!==market.next.prices[i]&&i!==20&&i!==market.current.offer.material&&i!==market.next.offer.material);assert(item>=0);
  await page.locator('#town-clear').click();await page.locator(`#buy-${item}`).fill('3');assert.equal(await page.locator('#town-total').textContent(),money(market.current.prices[item]*3+6000));
  await page.locator('#pause').click();await page.locator(`#buy-${item}`).click();
  await page.waitForFunction(({due,total})=>window.solarDev.snapshot().village.minutes>=due&&document.querySelector('#town-total').textContent===total,{due:28*1440,total:money(market.next.prices[item]*3+6000)});
  assert.equal(await page.locator(`#buy-${item}`).evaluate(el=>el===document.activeElement),true,'New weekly prices preserve the focused quantity control');assert.equal(await page.locator(`#buy-${item}`).inputValue(),'3');
  await page.locator('#pause').click();await capture('A real midnight restock updates prices without replacing the focused basket','suppliers-midnight.png');
  assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved,'Supplier experiments protect the player save');await page.locator('#dev-button').click();
}
export async function checkSupplierSandboxSave({browser,base,output,screenshots,errors}){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  async function open(){await page.locator('#open-village').click();await page.locator('[data-panel="town-panel"]').click();}
  async function reload(){await page.reload();await page.locator('[data-continue="sandbox"]').click();await page.locator('#main-menu').waitFor({state:'hidden'});await page.locator('#pause').click();await open();}
  try{
    await page.goto(base);await page.waitForFunction(()=>window.solarDev);await page.locator('[data-new-mode="sandbox"]').click();await page.locator('#main-menu').waitFor({state:'hidden'});await page.locator('#pause').click();
    await open();assert(!await page.locator('#supplier-variation').isChecked());assert(await page.locator('#supplier-option').isVisible());
    await page.locator('#supplier-variation').check();
    assert(await page.evaluate(()=>window.solarDev.snapshot().environment.economy.market.active),'Sandbox variation starts immediately');
    assert(await page.evaluate(()=>JSON.parse(localStorage.getItem('solar-friends-v3-sandbox')).village.market.enabled));
    await reload();assert(await page.locator('#supplier-variation').isChecked());assert(await page.locator('#supplier-offer').isVisible());
    await page.locator('#supplier-board').scrollIntoViewIfNeeded();const file='suppliers-sandbox-reload.png';await page.screenshot({path:path.join(output,file),fullPage:true});screenshots.push({label:'Sandbox supplier variation survives Continue sandbox',file});
    await page.locator('#supplier-variation').uncheck();await reload();assert(!await page.locator('#supplier-variation').isChecked());assert.match(await page.locator('#supplier-notice').textContent(),/Steady town prices/);
    assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),null,'Sandbox supplier options never create a Story save');
  }finally{await context.close();}
}
