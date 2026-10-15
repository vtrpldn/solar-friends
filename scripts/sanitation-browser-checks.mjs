import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

export async function checkSanitationControls({page,saved,capture}){
  const snapshot=()=>page.evaluate(()=>window.solarDev.snapshot());
  async function show(){
    await page.locator('[data-hud-resource="water"]').click();
    if(!await page.locator('#local-waste').evaluate(el=>el.open))await page.getByText('Where waste is',{exact:true}).click();
  }
  async function load(name){
    if(!await page.locator('#dev-dialog').isVisible())await page.locator('#dev-button').click();
    await page.locator('[data-dev-tab="simulation"]').click();
    const file=`artifacts/sanitation/${name}.json`,expected=JSON.parse(await readFile(file,'utf8'));
    await page.locator('#dev-import-file').setInputFiles(file);
    await page.waitForFunction(w=>JSON.stringify(window.solarDev.snapshot().village.water_supply)===JSON.stringify(w),expected.village.water_supply);
    await page.locator('#dev-close').click();await show();return expected;
  }
  await load('before');
  assert.match(await page.locator('#local-waste-summary').textContent(),/12 greywater/);
  assert.doesNotMatch(await page.locator('#local-water-stores').textContent(),/greywater|sewage|NaN/);
  if(!await page.locator('#local-water').evaluate(el=>el.open))await page.getByText('Where water is',{exact:true}).click();
  if(!await page.locator('#water-networks').evaluate(el=>el.open))await page.getByText('Pipes & pumps',{exact:true}).click();
  if(!await page.locator('#water-line-planner').evaluate(el=>el.open))await page.getByText('Plan a new water line',{exact:true}).click();
  await page.locator('#pipe-kind').selectOption('greywater');
  await page.getByLabel('Water line supply',{exact:true}).selectOption('0');
  assert.deepEqual(await page.locator('#pipe-to option').evaluateAll(els=>els.map(e=>e.value)),['2'],'Greywater can only feed a reed bed');
  assert(await page.getByRole('button',{name:'Queue resident installation',exact:true}).isEnabled());
  await page.getByLabel('Show water lines on the village',{exact:true}).check();
  await page.locator('#water-line-planner').scrollIntoViewIfNeeded();await capture('Greywater route has its own compatible receiving port and paid kit','sanitation-planner.png');
  await page.getByRole('button',{name:'Queue resident installation',exact:true}).click();
  assert.equal((await snapshot()).village.pipes.lines[0].plan.kind,'greywater');
  assert.equal((await snapshot()).village.pipes.lines[0].phase,'awaiting_inputs');
  await page.getByRole('button',{name:'Cancel installation',exact:true}).click();
  assert.equal((await snapshot()).village.pipes.lines[0].phase,'retired');
  await page.locator('#pipe-kind').selectOption('sewage');
  assert.deepEqual(await page.locator('#pipe-from option').evaluateAll(els=>els.map(e=>e.value)),['3']);
  assert.deepEqual(await page.locator('#pipe-to option').evaluateAll(els=>els.map(e=>e.value)),['4','5']);

  const carrying=await load('greywater-carrying'),loadRow=carrying.village.water_supply.trips.find(h=>h.class==='greywater'&&h.carrying),person=carrying.residents.find(r=>r.id===loadRow.resident);
  assert.match(await page.locator(`[data-waste-carrier="${person.id}"]`).textContent(),new RegExp(`${person.name}.*closed service container`));
  const target=carrying.village.water_supply.tanks.find(p=>p.id===loadRow.to);
  assert.match(await page.locator(`[data-waste-container="${target.id}"]`).textContent(),/on the way · not usable yet/);
  await page.locator('#local-waste').scrollIntoViewIfNeeded();await capture('Local sanitation buffers, reserved delivery and named closed-container carrier','sanitation-stores.png');
  await page.getByRole('button',{name:'Close supplies',exact:true}).click();
  await capture('An actual greywater load uses a closed fitted-lid container','sanitation-carrying.png');
  await page.getByRole('button',{name:new RegExp(`^Select ${person.name}\\.`)}).click();
  assert.match(await page.locator('#person .quote').textContent(),/closed greywater container/);
  await capture('Resident describes the actual closed-container sanitation job','sanitation-resident.png');
  await page.getByRole('button',{name:'Close resident details',exact:true}).click();

  const filtering=await load('filtering'),batch=filtering.village.processes.batches.find(b=>b.kind==='filtration'&&!['complete','cancelled'].includes(b.phase));
  assert.match(await page.locator('#local-waste-summary').textContent(),/12 sealed in processing/);
  const raw=JSON.stringify(await snapshot());await page.locator('#local-waste').scrollIntoViewIfNeeded();await capture('Filtration retains sealed ownership and protects return space','sanitation-filtering.png');
  assert.equal(JSON.stringify(await snapshot()),raw,'Inspecting local buffers cannot move contents');
  const cancel=page.locator(`[data-process-cancel="${batch.id}"]`);
  await cancel.click();assert.equal((await snapshot()).village.processes.batches.find(b=>b.id===batch.id).phase,'cancelled');
  assert.match(await page.locator('#local-waste-stores').textContent(),/Recoverable liquid containers/);

  await load('pumping');assert.match(await page.locator('#water-lines').textContent(),/Greywater · Installed/);
  assert.match(await page.locator('#water-lines').textContent(),/[1-9][\d.,]* units transferred/);
  await page.locator('#water-lines').scrollIntoViewIfNeeded();await capture('Resident-installed greywater line reports metered local flow and energy use','sanitation-pumping.png');
  await page.getByRole('button',{name:'Pause water line',exact:true}).click();
  assert((await snapshot()).village.pipes.lines[0].paused);
  await page.getByLabel('Water line priority',{exact:true}).selectOption('3');
  assert.equal((await snapshot()).village.pipes.lines[0].priority,3);
  await page.getByRole('button',{name:'Resume water line',exact:true}).click();assert(!(await snapshot()).village.pipes.lines[0].paused);

  await load('handed-over');assert.match(await page.locator('#local-waste-stores').textContent(),/sewage handed over.*no village irrigation, gas or compost/);
  assert.doesNotMatch(await page.locator('#circular-stock').textContent(),/\/ 80|\/ 120/);
  for(const name of ['recovered','recovered-night','sewage-carrying']){
    await load(name);await page.getByRole('button',{name:'Close supplies',exact:true}).click();
    await capture(`Separate fitted-lid service containers at ${name}`,'sanitation-'+name+'.png');
  }
  assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved,'Sanitation test scenes cannot replace the real village');
  await page.locator('#dev-button').click();
}
