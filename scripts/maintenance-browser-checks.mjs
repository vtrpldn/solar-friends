import assert from 'node:assert/strict';
import path from 'node:path';
export async function checkMaintenanceControls({page,saved,capture}){
  const snap=()=>page.evaluate(()=>window.solarDev.snapshot());
  async function load(id){if(!await page.locator('#dev-dialog').isVisible())await page.locator('#dev-button').click();await page.locator('[data-dev-tab="simulation"]').click();await page.locator('#dev-scenario').selectOption(id);await page.locator('#dev-load').click();await page.waitForFunction(id=>window.solarDev.scenario()===id,id);await page.locator('#dev-close').click();await page.locator('#maintenance-alert').click();}
  async function advance(minutes){const start=(await snap()).village.minutes;await page.locator('#dev-button').click();await page.locator('#dev-minutes').fill(String(minutes));await page.locator('#dev-advance').click();await page.waitForFunction(t=>window.solarDev.snapshot().village.minutes>=t,start+minutes);await page.locator('#dev-close').click();}
  await load('maintenance');
  const workshop=page.locator('.service-record[data-equipment-kind="workshop"]');
  for(const viewport of [{width:1600,height:900},{width:1280,height:800}]){
    await page.setViewportSize(viewport);assert.equal(await page.locator('#supplies-panel').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
    assert(await page.locator('#equipment-wear').isChecked());assert.equal(await page.locator('.service-record').count(),8);
    await capture(`Equipment condition shares the field book at ${viewport.width}`,`upkeep-${viewport.width}.png`);
  }
  await workshop.getByRole('button',{name:'Schedule service',exact:true}).click();
  const job=(await snap()).village.maintenance.jobs.at(-1);assert.equal(job.equipment.kind,'workshop');
  await workshop.getByRole('button',{name:'Find missing parts in Trade',exact:true}).click();
  assert.equal(await page.locator('#buy-8').inputValue(),'1');assert.equal(await page.locator('#buy-15').inputValue(),'2');
  await capture('The service kit enters the normal town basket','upkeep-spares.png');
  await page.locator('#town-order').click();assert.equal((await snap()).village.economy.orders.at(-1).status,'confirmed');
  await page.locator('#maintenance-alert').click();await advance(1440);
  let partial=false;
  for(let t=0;t<24;t++){
    const j=(await snap()).village.maintenance.jobs.find(j=>j.id===job.id);
    if(j.work>0&&j.finished==null){partial=true;break;}await advance(5);
  }
  assert(partial,'Actual local delivery leads to attended workshop service');
  const before=(await snap()).village.maintenance.jobs.find(j=>j.id===job.id);
  await workshop.getByRole('button',{name:'Pause service',exact:true}).click();await advance(30);
  assert.equal((await snap()).village.maintenance.jobs.find(j=>j.id===job.id).work,before.work);
  await workshop.scrollIntoViewIfNeeded();
  await capture('Paused service retains its consumed kit and partial work','upkeep-paused.png');
  await workshop.getByRole('button',{name:'Resume service',exact:true}).click();
  for(let t=0;t<8&&(await snap()).village.maintenance.jobs.find(j=>j.id===job.id).finished==null;t++)await advance(60);
  const done=(await snap()).village.maintenance.jobs.find(j=>j.id===job.id);assert(done.finished!=null&&!done.cancelled);
  assert((await snap()).village.maintenance.records.find(r=>r.equipment.kind==='workshop').condition>99);
  assert.equal(done.spent[8][1]-done.spent[8][0],1);assert.equal(done.spent[15][1]-done.spent[15][0],2);
  await workshop.scrollIntoViewIfNeeded();
  await capture('Resident work restores workshop condition through the real controls','upkeep-finished.png');
  await load('maintenance-outage');
  const beforeCharge=(await snap()).village.power.stored;await advance(60);assert.equal((await snap()).village.power.stored,beforeCharge,'Failed shared storage retains its energy');
  const truck=page.locator('.service-record[data-equipment-kind="truck"]');await truck.getByRole('button',{name:'Schedule service',exact:true}).click();
  await truck.getByRole('button',{name:'Find missing parts in Trade',exact:true}).click();assert(await page.locator('[name="town-transport"][value="delivery"]').isChecked());
  await capture('A failed pickup can receive spare parts by town delivery','upkeep-truck-recovery.png');
  await page.locator('#maintenance-alert').click();await advance(600);await capture('Night equipment failure preserves charge and exposes recovery','upkeep-night.png');
  await page.locator('#automatic-service').check();assert.equal((await snap()).village.maintenance.automatic,true);
  await page.locator('#automatic-service').uncheck();assert.equal((await snap()).village.maintenance.automatic,false);
  assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved,'Protected maintenance experiments preserve the player save');
  await page.locator('#dev-button').click();
}

export async function checkMaintenanceSandboxSave({browser,base,output,screenshots,errors}){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  async function open(){await page.locator('#open-village').click();await page.locator('[data-panel="supplies-panel"]').click();await page.locator('#supply-tab-ecology').click();}
  async function reload(){await page.reload();await page.locator('[data-continue="sandbox"]').click();await page.locator('#main-menu').waitFor({state:'hidden'});await page.locator('#pause').click();await open();}
  try{
    await page.goto(base);await page.waitForFunction(()=>window.solarDev);
    await page.locator('[data-new-mode="sandbox"]').click();await page.locator('#main-menu').waitFor({state:'hidden'});await page.locator('#pause').click();await open();
    assert(!await page.locator('#equipment-wear').isChecked());assert(await page.locator('#automatic-service').isDisabled());
    await page.locator('#equipment-wear').check();await page.locator('#automatic-service').check();
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('solar-friends-v3-sandbox')).village.maintenance);
    assert(saved.enabled&&saved.automatic);assert(saved.records.length>0);
    await reload();assert(await page.locator('#equipment-wear').isChecked());assert(await page.locator('#automatic-service').isChecked());
    const file='upkeep-sandbox-reload.png';await page.screenshot({path:path.join(output,file),fullPage:true});screenshots.push({label:'Sandbox wear and automatic service survive Continue sandbox',file});
    await page.locator('#equipment-wear').uncheck();await reload();assert(!await page.locator('#equipment-wear').isChecked());assert(await page.locator('#automatic-service').isDisabled());
    assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),null,'Sandbox upkeep never creates a Story save');
  }finally{await context.close();}
}
