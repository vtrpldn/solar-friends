import assert from 'node:assert/strict';

export async function checkKitchenControls({page,saved,capture}){
  async function load(file){
    if(!await page.locator('#dev-dialog').isVisible())await page.locator('#dev-button').click();
    await page.locator('#dev-import-file').setInputFiles(`artifacts/kitchen/${file}.json`);
    await page.waitForFunction(()=>window.solarDev.snapshot().village.production.batches.some(b=>b.material===17&&b.phase==='processing'));
    await page.locator('#dev-close').click();
    await page.locator('[data-hud-resource="food"]').click();
  }
  await load('working');
  const before=await page.evaluate(()=>window.solarDev.snapshot());
  const batch=before.village.production.batches.find(b=>b.material===17&&b.phase==='processing');
  assert(batch&&batch.work>0&&batch.work<10);
  assert.equal(await page.locator('#preparation-recipes .production-worksite').filter({hasText:'Kitchen'}).count(),0);
  await page.getByRole('button',{name:'Pause Kitchen 2',exact:true}).click();
  assert(await page.getByRole('button',{name:'Resume Kitchen 2',exact:true}).isVisible());
  await page.locator('#dev-button').click();
  await page.locator('#dev-minutes').fill('60');await page.locator('#dev-advance').click();
  let s=await page.evaluate(()=>window.solarDev.snapshot());
  assert.equal(s.village.production.batches.find(b=>b.id===batch.id).work,batch.work);
  assert.equal(s.village.meals,0);
  await page.locator('#dev-close').click();
  await page.locator('[data-hud-resource="food"]').click();
  await page.getByRole('button',{name:'Cancel batch at Kitchen 2',exact:true}).scrollIntoViewIfNeeded();
  await capture('Kitchen pot keeps its labour while the station is paused','kitchen-paused.png');
  const food=s.village.food;
  await page.getByRole('button',{name:'Resume Kitchen 2',exact:true}).click();
  await page.getByRole('button',{name:'Cancel batch at Kitchen 2',exact:true}).click();
  s=await page.evaluate(()=>window.solarDev.snapshot());
  assert.equal(s.village.food,food+3);assert.equal(s.village.meals,0);
  assert.equal(s.village.production.batches.find(b=>b.id===batch.id).phase,'cancelled');
  assert(s.village.production.sites.find(site=>site.id===batch.site).paused);
  await page.getByLabel('Prepared meals reserve',{exact:true}).fill('5');
  await page.getByRole('button',{name:'Set prepared meals reserve',exact:true}).click();
  assert.equal((await page.evaluate(()=>window.solarDev.snapshot())).village.production.targets[17],5);
  await capture('A cancelled pot returns its ingredients and meal reserves stay bounded','kitchen-recovery.png');
  await load('working');
  await page.getByRole('button',{name:'Buildings',exact:true}).click();
  await page.getByLabel('Choose a building',{exact:true}).selectOption('1');
  assert((await page.locator('#building-activity').textContent()).includes('Saved pot'));
  assert(await page.getByRole('heading',{name:'Ask a neighbour to cook',exact:true}).isVisible());
  await page.locator('#dev-button').click();
  await page.locator('#dev-minutes').fill('60');await page.locator('#dev-advance').click();
  s=await page.evaluate(()=>window.solarDev.snapshot());
  assert.equal(s.village.production.batches.find(b=>b.id===batch.id).phase,'complete');
  assert.equal(s.village.production.accounting.outputs[17],5);
  assert.equal(s.residents.find(r=>r.id===0).help.phase,'complete');
  await page.locator('#dev-close').click();
  await page.locator('[data-hud-resource="food"]').click();
  await page.locator('#kitchen-batches').scrollIntoViewIfNeeded();
  await capture('Resumed kitchen work finishes the same pot at its selected pantry','kitchen-finished.png');
  assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved);
}
