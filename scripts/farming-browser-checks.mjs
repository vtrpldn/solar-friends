import assert from 'node:assert/strict';
export async function checkFarmingControls({page,saved,capture}){
  if(!await page.locator('#dev-dialog').isVisible())await page.locator('#dev-button').click();
  await page.locator('[data-dev-tab="simulation"]').click();
  await page.locator('#dev-scenario').selectOption('farming');await page.locator('#dev-load').click();
  await page.waitForFunction(()=>window.solarDev.scenario()==='farming');await page.locator('#dev-close').click();
  const before=await page.evaluate(()=>JSON.stringify(window.solarDev.snapshot()));
  await capture('Orchard, dairy pasture and apiary share the village terrain and building scale','farming-village.png');
  for(const viewport of [{width:1600,height:900},{width:1280,height:800}]){
    await page.setViewportSize(viewport);
    await page.getByRole('button',{name:'Village',exact:true}).click();await page.getByRole('button',{name:'Buildings',exact:true}).click();
    await page.locator('#building-choice').selectOption('9');
    assert(await page.locator('#farm-controls').isVisible());
    assert.match(await page.locator('#farm-notes').textContent(),/fresh drinking water/);
    assert.match(await page.locator('#farm-detail').textContent(),/Wellbeing 70%/);
    await capture(`Readable goat care and local supplies at ${viewport.width}px` ,`farming-goats-${viewport.width}.png`);
    await page.locator('#farm-active').uncheck();
    assert.equal(await page.evaluate(()=>window.solarDev.snapshot().village.buildings.find(b=>b.id===9).agriculture.enabled),false);
    assert.match(await page.locator('#farm-status').textContent(),/daily feed and care continue/);
    await page.locator('#farm-active').check();
    assert.equal(await page.evaluate(()=>window.solarDev.snapshot().village.buildings.find(b=>b.id===9).agriculture.enabled),true);
    await page.locator('#building-choice').selectOption('10');
    assert.match(await page.locator('#farm-detail').textContent(),/nearby flowering plots/);
    await capture(`Hive forage and inspection controls at ${viewport.width}px`,`farming-bees-${viewport.width}.png`);
    await page.locator('#building-choice').selectOption('8');
    assert.match(await page.locator('#farm-detail').textContent(),/Young fruit trees/);
    await page.locator('#building-choice').selectOption('5');
    assert.equal(await page.locator('#next-crop option').count(),6);
    assert.match(await page.locator('#crop-status').textContent(),/Fodder grass.*fodder/);
    await page.locator('#next-crop').selectOption('cassava');
    assert.equal(await page.evaluate(()=>window.solarDev.snapshot().village.buildings.find(b=>b.id===5).crop.next_kind),'cassava');
    assert.match(await page.locator('#crop-status').textContent(),/Fodder grass/,'Changing the next plan preserves the standing crop');
    await page.locator('#next-crop').selectOption('fodder');
    await page.getByRole('button',{name:'Close buildings',exact:true}).click();
    await page.locator('[data-hud-resource="food"]').click();
    assert.equal(await page.locator('#pantry-stock>span').count(),5);assert.equal(await page.locator('.farm-record').count(),3);
    const overflow=await page.locator('#supplies-panel').evaluate(el=>el.scrollWidth>el.clientWidth+1);assert.equal(overflow,false);
    await capture(`Milk, honey and farm records inside the pantry book at ${viewport.width}px`,`farming-pantry-${viewport.width}.png`);
    await page.locator('[data-farm="9"]').click();assert.equal(await page.locator('#building-choice').inputValue(),'9');
    await page.getByRole('button',{name:'Close buildings',exact:true}).click();
  }
  assert.equal(await page.evaluate(()=>JSON.stringify(window.solarDev.snapshot())),before,'Reversible crop and production controls restore the exact paused scene');
  await page.getByRole('button',{name:'Build',exact:true}).click();await page.locator('[data-build-group="food"]').click();
  for(const kind of ['orchard','goat_pasture','apiary'])assert(await page.locator(`[data-kind="${kind}"]`).isVisible());
  await capture('New farm buildings appear with the same illustrated build controls','farming-build-menu.png');
  await page.getByRole('button',{name:'Close building tools',exact:true}).click();
  await page.getByRole('button',{name:'Village',exact:true}).click();await page.getByRole('button',{name:'Buildings',exact:true}).click();
  await page.locator('#building-choice').selectOption('9');await page.locator('[data-visitor="0"]').click();
  assert.equal(await page.evaluate(()=>window.solarDev.snapshot().residents.find(r=>r.id===0).help.building),9,'A care request binds to this pasture');
  assert.match(await page.locator('#building-response').textContent(),/accepted|help|supplies|ready|saved/i);
  await capture('A named resident accepts a saved, targeted animal-care request','farming-request.png');
  await page.locator('#dev-button').click();
  for(let day=0;day<3;day++){
    const minute=await page.evaluate(()=>window.solarDev.snapshot().village.minutes);await page.locator('#dev-minutes').fill('1440');await page.locator('#dev-advance').click();
    await page.waitForFunction(minute=>window.solarDev.snapshot().village.minutes>=minute+1440,minute);
  }
  await page.locator('#dev-close').click();
  const produced=await page.evaluate(()=>window.solarDev.snapshot());
  assert(produced.village.progress.milk_collected>0,'Real resident deliveries and care yield milk in the browser scene');
  assert(produced.village.progress.honey_collected>0,'Residents inspect the hive and collect honey');
  assert(produced.village.progress.orchard_fruit>0,'Residents collect the first fruit');
  await capture('Resident care and collection advance real farm production','farming-after-care.png');
  assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved,'Farm experiments preserve the player save');
  await page.locator('#dev-button').click();
}
