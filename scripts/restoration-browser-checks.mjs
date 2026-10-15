import assert from 'node:assert/strict';
export async function checkRestorationControls({page,saved,capture}){
  const state=()=>page.evaluate(()=>window.solarDev.snapshot());
  async function load(file){
    if(!await page.locator('#dev-dialog').isVisible())await page.locator('#dev-button').click();
    await page.locator('#dev-import-file').setInputFiles(`artifacts/restoration/${file}.json`);
    await page.waitForFunction(file=>{const j=window.solarDev.snapshot().village.restoration[0];return file==='working'?j?.work>0&&j.finished==null:j?.cancelled;},file);
    await page.locator('#dev-close').click();
    if(!await page.locator('#land-map').isVisible())await page.getByRole('button',{name:'Land views',exact:true}).click();
  }
  await load('working');
  let before=await state();
  assert.match(await page.locator('#land-restoration-jobs').textContent(),/Compost has been mixed in/);
  await capture('Delivered compost and saved resident labour restore the ground gradually','soil-restoration.png');
  await page.getByRole('button',{name:'Cancel soil work',exact:true}).click();
  let after=await state();
  assert(after.village.restoration[0].cancelled);
  assert.deepEqual(after.village.land.soil,before.village.land.soil,'Cancellation preserves actual partial soil work');
  assert.equal(after.village.progress.compost,before.village.progress.compost,'Mixed compost is not refunded');
  assert(!after.residents.some(r=>r.task==='restore'),'Cancelled workers detach from the ended order immediately');
  assert.match(await page.locator('#land-restoration-jobs').textContent(),/partial soil work remains/);
  await load('cancelled');
  await page.evaluate(()=>window.solarDev.fixedView());
  const point=await page.evaluate(async()=>{const {project}=await import('./projection.js');const box=document.querySelector('#world').getBoundingClientRect(),scale=Math.max(.45,Math.min(box.width/1900,box.height/1050)),p=project(18,18,{x:box.width*.49,y:box.height*.5-459*scale},scale);return{x:box.left+p.x,y:box.top+p.y};});
  await page.mouse.click(point.x,point.y);
  await page.waitForFunction(()=>document.querySelector('#land-hover').textContent.includes('4 cells'));
  assert.match(await page.locator('#land-restoration-note').textContent(),/18, 18 · 2 × 2 cells/);
  before=await state();await page.getByRole('button',{name:'Restore ground · 2 compost',exact:true}).click();
  after=await state();const queued=after.village.restoration.at(-1);
  assert.equal(queued.work,0);assert.equal(queued.finished,null);assert.equal(after.village.progress.compost,before.village.progress.compost);
  assert.deepEqual(after.village.land.soil,before.village.land.soil,'Queueing and preview do not apply soil improvement');
  assert.match(await page.locator('#land-restoration-jobs').textContent(),/Waiting for compost delivery/);
  await capture('A marked grid plot reserves compost and waits for actual resident delivery','soil-restoration-queued.png');
  await page.getByRole('button',{name:'Cancel soil work',exact:true}).click();
  after=await state();assert(after.village.restoration.at(-1).cancelled);assert.equal(after.environment.economy.materials[19].reserved,0);
  await load('working');
  await page.locator('#dev-button').click();await page.locator('#dev-minutes').fill('60');await page.locator('#dev-advance').click();
  after=await state();assert.equal(after.village.restoration[0].work,32);assert(after.village.restoration[0].finished!=null);assert(!after.village.restoration[0].cancelled);
  assert.match(await page.locator('[data-soil-diagnostics]').textContent(),/0 active/);
  await page.locator('#dev-close').click();
  await page.waitForFunction(()=>document.querySelector('#land-restoration-jobs').textContent.includes('Soil restored'));
  await capture('Resident work finishes and its soil improvements remain on the land','soil-restoration-complete.png');
  await page.getByRole('button',{name:'Close land views',exact:true}).click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved,'Soil work in dev scenes must never overwrite the saved village');
  await page.locator('#dev-button').click();
}
