import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
export async function checkWorkshopPowerControls({page,saved,capture}) {
  const snapshot=()=>page.evaluate(()=>window.solarDev.snapshot());
  if(!await page.locator('#dev-dialog').isVisible())await page.locator('#dev-button').click();
  await page.locator('#dev-import-file').setInputFiles('artifacts/electricity/workshop-outage.json');
  await page.waitForFunction(()=>window.solarDev.snapshot().village.production.batches.some(b=>b.phase==='awaiting_power'));
  await page.locator('#dev-close').click();
  if(!await page.locator('#village-book').isVisible())await page.locator('#open-village').click();
  await page.getByRole('button',{name:'Construction',exact:true}).click();
  if(!await page.locator('#preparation-recipes').isVisible())await page.getByText('Preparing materials',{exact:true}).click();
  const before=await snapshot(),batch=before.village.production.batches.find(b=>b.phase==='awaiting_power');
  const station=before.village.production.sites.find(s=>s.id===batch.site);
  assert(station.powered&&batch.committed&&batch.work>0&&batch.work<10);
  assert.match(await page.locator('#preparation-recipes').innerText(),/switch to hand tools/);
  await page.getByRole('button',{name:'Use hand tools at Workshop 2',exact:true}).scrollIntoViewIfNeeded();
  await capture('Interrupted powered tools keep their committed batch','workshop-power-outage.png');
  await page.getByRole('button',{name:'Use hand tools at Workshop 2',exact:true}).click();
  assert.equal((await snapshot()).village.production.sites.find(s=>s.id===batch.site).powered,false);
  await page.locator('#dev-button').click();await page.locator('#dev-minutes').fill('300');
  await page.locator('#dev-advance').click();await page.locator('#dev-close').click();
  const after=await snapshot();
  assert.equal(after.village.production.batches.find(b=>b.id===batch.id).phase,'complete');
  assert.equal(after.village.production.sites.find(s=>s.id===batch.site).energy_used,station.energy_used);
  assert.equal(after.village.production.accounting.outputs[7],2);
  assert.equal(after.residents.find(r=>r.id===0).help.phase,'complete');
  assert.match(await page.locator('#preparation-recipes').innerText(),/Last batch finished: 2 roof tiles/);
  await page.getByRole('button',{name:'Use powered tools at Workshop 2',exact:true}).scrollIntoViewIfNeeded();
  await capture('Hand tools finish the same batch without more electrical consumption','workshop-power-fallback.png');
  const raw=JSON.stringify(after.village.production);
  await page.getByRole('button',{name:'Use powered tools at Workshop 2',exact:true}).click();
  assert.equal(JSON.stringify((await snapshot()).village.production),raw,'A paused cable cannot enable powered work');
  assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved);
}

export async function checkElectricalControls({page,saved,capture}) {
  const snapshot=()=>page.evaluate(()=>window.solarDev.snapshot());
  const start=JSON.parse(await readFile('artifacts/electricity/before.json','utf8'));
  if(!await page.locator('#dev-dialog').isVisible())await page.locator('#dev-button').click();
  await page.locator('#dev-import-file').setInputFiles('artifacts/electricity/before.json');
  await page.waitForFunction(()=>window.solarDev.snapshot().village.minutes===540&&window.solarDev.snapshot().village.pipes.lines.length===0);
  await page.locator('#dev-close').click();
  async function show(){
    if(!await page.locator('#village-book').isVisible())await page.locator('#open-village').click();
    if(!await page.locator('#power-panel').isVisible())await page.getByRole('button',{name:'Power',exact:true}).click();
  }
  async function advance(minutes){
    await page.locator('#dev-button').click();await page.locator('#dev-minutes').fill(String(minutes));await page.locator('#dev-advance').click();await page.locator('#dev-close').click();await show();
  }
  await show();
  const port=id=>String(start.village.power.network.nodes.find(n=>n.owner.kind==='building'&&n.owner.id===id).id);
  assert.match(await page.locator('#power-load-1').innerText(),/No local cable supply/);
  assert.equal(await page.locator('#cable-from option').filter({hasText:'Home 4'}).count(),0,'Private rooftops cannot export charge');
  await page.getByText('Plan an electrical cable',{exact:true}).click();
  await page.getByLabel('First electrical port',{exact:true}).selectOption(port(0));await page.getByLabel('Second electrical port',{exact:true}).selectOption(port(1));
  await page.getByLabel('Show cables on the village',{exact:true}).check();
  await page.waitForFunction(()=>document.querySelector('#world').dataset.electricalPreview==='true');
  assert.match(await page.locator('#cable-quote').innerText(),/minutes of attended work/);
  await page.getByRole('button',{name:'Locate cable route',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#world').dataset.cameraMoving==='false');
  await capture('The Power panel previews a grid-aligned resident-installed cable','electrical-planner.png');
  await page.getByRole('button',{name:'Queue cable installation',exact:true}).click();
  let s=await snapshot(),row=s.village.pipes.lines.at(-1),id=row.id;
  assert.equal(row.phase,'awaiting_inputs');assert.equal(row.work,0);assert.equal(row.kit[9],0);assert.equal(row.kit[14],0);
  await page.getByRole('button',{name:'Find missing cable parts in Trade',exact:true}).click();
  for(const i of [8,10])assert.equal(await page.locator('#buy-'+i).inputValue(),String(row.kit[i]));
  assert.equal(await page.locator('#buy-14').inputValue(),'0');
  await page.getByRole('radio',{name:'Drive to collect',exact:false}).check();await page.locator('#pickup-driver').selectOption('4');await page.getByRole('button',{name:'Buy & collect',exact:true}).click();
  s=await snapshot();assert(s.village.economy.orders.some(o=>o.pickup_by===4));assert(s.residents.find(r=>r.id===4).trip);
  await show();
  assert.equal(await page.locator('#cable-buy-parts').isEnabled(),false,'Supplies already ordered are not offered for duplicate purchase');
  for(let i=0;i<8*12;i++){s=await snapshot();if(s.village.pipes.lines.find(p=>p.id===id).phase==='active')break;await advance(120);}
  s=await snapshot();assert.equal(s.village.pipes.lines.find(p=>p.id===id).phase,'active');assert(s.environment.power.connections.find(c=>c.id===1).connected);
  assert.match(await page.locator('#electrical-circuits').innerText(),/Workshop 2/);
  await page.getByRole('button',{name:`Pause cable ${id}`,exact:true}).click();
  assert.equal((await snapshot()).environment.power.connections.find(c=>c.id===1).connected,false);
  assert.match(await page.locator('#power-load-1').innerText(),/No local cable supply/);
  await page.getByRole('button',{name:`Resume cable ${id}`,exact:true}).click();
  await page.getByLabel(`Cable ${id} installation priority`,{exact:true}).selectOption('3');
  assert.equal((await snapshot()).village.pipes.lines.find(p=>p.id===id).priority,3);
  await page.locator(`[data-electrical-line="${id}"]`).scrollIntoViewIfNeeded();await capture('Commissioned cable, local charge, pause and resident dismantling controls','electrical-installed.png');
  const received=(await snapshot()).village.simulation.materials.received;
  await page.getByRole('button',{name:`Dismantle cable ${id}`,exact:true}).click();
  s=await snapshot();assert.equal(s.village.pipes.lines.find(p=>p.id===id).phase,'removing');assert.equal(s.village.pipes.lines.find(p=>p.id===id).removal_work,0);
  for(let i=0;i<8*12;i++){s=await snapshot();if(s.village.pipes.lines.find(p=>p.id===id).phase==='retired')break;await advance(120);}
  s=await snapshot();assert.equal(s.village.pipes.lines.find(p=>p.id===id).phase,'retired');
  for(const i of [8,10])assert.equal(s.village.simulation.materials.received[i]-received[i],Math.floor(row.kit[i]/2));
  await page.getByLabel('Second electrical port',{exact:true}).selectOption(port(2));await page.getByRole('button',{name:'Queue cable installation',exact:true}).click();
  const unstarted=(await snapshot()).village.pipes.lines.at(-1).id;
  await page.getByRole('button',{name:`Cancel installation of cable ${unstarted}`,exact:true}).click();
  assert.equal((await snapshot()).village.pipes.lines.find(p=>p.id===unstarted).phase,'retired');
  assert.equal(await page.locator('#world').getAttribute('data-water-lines'),'0');
  assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved);
}
