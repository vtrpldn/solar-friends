import assert from 'node:assert/strict';
export async function checkOccupationControls({page,saved,capture}){
  if(!await page.locator('#dev-dialog').isVisible())await page.locator('#dev-button').click();
  // Individual schedules synchronize between Trade and resident details.
  await page.locator('#dev-scenario').selectOption('occupations');await page.locator('#dev-load').click();
  await page.locator('#dev-close').click();await page.getByRole('button',{name:'Village',exact:true}).click();await page.getByRole('button',{name:'Trade',exact:true}).click();
  if(!await page.locator('.outside-jobs').evaluate(el=>el.open))await page.locator('.outside-jobs summary').click();
  assert.equal(await page.locator('.occupation-card').count(),5);
  for(const id of [2,3,4])await page.locator(`[data-outside-job="${id}"]`).uncheck();
  const occupationFunds=await page.evaluate(()=>window.solarDev.snapshot().village.economy.money);
  await page.locator('[data-citizen="1"]').click();
  assert.equal(await page.locator('#person .occupation-title').textContent(),'Bamboo carpenter');
  assert(await page.locator('#person .occupation-toggle').isChecked());
  await page.locator('#person .occupation-toggle').uncheck();await page.getByRole('button',{name:'Close resident details',exact:true}).click();
  await page.getByRole('button',{name:'Village',exact:true}).click();await page.getByRole('button',{name:'Trade',exact:true}).click();
  assert(!await page.locator('[data-outside-job="1"]').isChecked());await page.locator('[data-outside-job="1"]').check();
  await page.locator('#dev-button').click();await page.locator('#dev-minutes').fill('90');await page.locator('#dev-advance').click();
  let work=await page.evaluate(()=>window.solarDev.snapshot());
  for(let elapsed=0;elapsed<300&&!work.residents.slice(0,2).every(r=>r.trip?.purpose==='work'&&r.trip.phase==='away');elapsed+=5){
    await page.locator('#dev-minutes').fill('5');await page.locator('#dev-advance').click();work=await page.evaluate(()=>window.solarDev.snapshot());
    assert.equal(work.village.economy.money,occupationFunds,'Walking to an outside shift cannot pay its wages early');
  }
  assert(work.residents.slice(0,2).every(r=>r.trip?.purpose==='work'&&r.trip.phase==='away'));
  assert(work.residents.slice(2).every(r=>!r.trip));assert.equal(work.village.economy.money,occupationFunds);
  await page.locator('#dev-close').click();await page.locator('[data-citizen="0"]').click();
  assert((await page.locator('#person .person-activity').textContent()).includes('Plant nursery assistant'));
  await capture('Iara at her individual outside occupation','resident-occupation.png');
  await page.locator('#person .occupation-toggle').uncheck();
  assert.equal(await page.evaluate(()=>window.solarDev.snapshot().residents.find(r=>r.id===0).trip?.phase),'away','Disabling future shifts preserves an already committed job');
  const payrollMinute=Math.floor(work.village.minutes/1440)*1440+17*60+1;
  assert(work.village.minutes<payrollMinute,'Both commutes finish before the shift ends');
  await page.locator('#dev-button').click();await page.locator('#dev-minutes').fill(String(payrollMinute-work.village.minutes));await page.locator('#dev-advance').click();
  work=await page.evaluate(()=>window.solarDev.snapshot());
  assert.equal(work.village.economy.money,occupationFunds+40000);
  const paidDay=Math.floor(work.village.minutes/1440);
  assert.equal(work.village.economy.work_day[0],paidDay);assert.equal(work.village.economy.work_day[1],paidDay);
  await page.locator('#dev-minutes').fill('10');await page.locator('#dev-advance').click();
  assert.equal(await page.evaluate(()=>window.solarDev.snapshot().village.economy.money),occupationFunds+40000,'A completed shift cannot pay twice');
  assert.deepEqual(Object.values(work.village.economy.outside_jobs),[false,true,false,false,false]);
  assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved);
}
