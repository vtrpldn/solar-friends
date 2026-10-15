import assert from 'node:assert/strict';
export async function checkProcessControls({page,saved,capture}){
  const owned=(s,id)=>s.village.processes.batches.find(b=>b.building===id&&['processing','paused','awaiting_output'].includes(b.phase));
  async function load(file,check){
    if(!await page.locator('#dev-dialog').isVisible())await page.locator('#dev-button').click();
    await page.locator('#dev-import-file').setInputFiles(`artifacts/processes/${file}.json`);await page.waitForFunction(check);
    await page.locator('#dev-close').click();await page.locator('[data-hud-resource="food"]').click();
  }
  await load('working',()=>window.solarDev.snapshot().village.processes.batches.some(b=>b.kind==='digestion'&&b.remaining===360));
  assert.match(await page.locator('#passive-processes').textContent(),/Biodigester 1/);
  assert.match(await page.locator('#passive-processes').textContent(),/Biodigester 2/);
  await page.getByRole('button',{name:'Pause Biodigester 1',exact:true}).click();
  assert(await page.getByRole('button',{name:'Resume Biodigester 1',exact:true}).isVisible());
  await page.locator('#dev-button').click();await page.locator('#dev-minutes').fill('60');await page.locator('#dev-advance').click();
  let s=await page.evaluate(()=>window.solarDev.snapshot());assert.equal(owned(s,0).remaining,360);assert.equal(owned(s,1).remaining,300);
  await page.locator('#dev-close').click();await page.locator('[data-hud-resource="food"]').click();
  await page.locator('#passive-processes').scrollIntoViewIfNeeded();await capture('Two digesters retain independent batches while one is paused','processes-paused.png');
  const waste=s.village.circular.waste,scraps=s.village.progress.scraps;
  await page.getByRole('button',{name:'Recover batch at Biodigester 2',exact:true}).click();s=await page.evaluate(()=>window.solarDev.snapshot());
  assert.equal(s.village.circular.waste,waste+2);assert.equal(s.village.progress.scraps,scraps+2);assert.equal(s.village.circular.biogas,0);assert(!owned(s,1));assert(s.village.processes.paused.includes(1));
  assert.equal(await page.getByRole('button',{name:'Recover batch at Biodigester 2',exact:true}).count(),0);
  await capture('Recovering a sealed batch returns its inputs once and pauses that site','processes-recovered.png');
  await load('curing',()=>window.solarDev.snapshot().village.circular.pending_compost===4);
  assert.equal(await page.locator('#passive-processes .production-worksite').filter({hasText:'Digestate curing'}).count(),2);
  assert.match(await page.locator('#digester-status').textContent(),/4 digestate curing/);
  await page.locator('#passive-processes').scrollIntoViewIfNeeded();await capture('Independent sealed digestate stores keep their full curing period','processes-curing.png');
  await page.locator('#dev-button').click();await page.locator('#dev-minutes').fill('1440');await page.locator('#dev-advance').click();s=await page.evaluate(()=>window.solarDev.snapshot());assert.equal(s.village.progress.compost,4);assert.equal(s.village.circular.pending_compost,0);
  await page.locator('#dev-close').click();await page.locator('[data-hud-resource="food"]').click();assert.match(await page.locator('#passive-processes').textContent(),/4 compost ready for the soil/);assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved);
}
