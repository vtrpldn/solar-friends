import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

export async function checkPipeControls({page,saved,capture}){
  const snapshot=()=>page.evaluate(()=>window.solarDev.snapshot());
  async function show(){
    await page.locator('[data-hud-resource="water"]').click();
    if(!await page.locator('#local-water').evaluate(el=>el.open))await page.getByText('Where water is',{exact:true}).click();
    if(!await page.locator('#water-networks').evaluate(el=>el.open))await page.getByText('Pipes & pumps',{exact:true}).click();
  }
  async function load(name){
    if(!await page.locator('#dev-dialog').isVisible())await page.locator('#dev-button').click();
    await page.locator('[data-dev-tab="simulation"]').click();
    const file=`artifacts/pipes/${name}.json`,expected=JSON.parse(await readFile(file,'utf8'));
    await page.locator('#dev-import-file').setInputFiles(file);
    await page.waitForFunction(p=>JSON.stringify(window.solarDev.snapshot().village.pipes)===JSON.stringify(p),expected.village.pipes);
    await page.locator('#dev-close').click();await show();return expected;
  }
  async function advance(minutes){
    await page.locator('#dev-button').click();await page.locator('#dev-minutes').fill(String(minutes));
    await page.locator('#dev-advance').click();await page.locator('#dev-close').click();await show();
  }
  await load('before');
  await page.getByText('Plan a new water line',{exact:true}).click();
  await page.getByLabel('Water line supply',{exact:true}).selectOption('0');
  await page.getByLabel('Water line destination',{exact:true}).selectOption('1');
  await page.getByLabel('Show water lines on the village',{exact:true}).check();
  assert.match(await page.locator('#pipe-quote').textContent(),/5 corridor cells · 32 minutes/);
  assert.match(await page.locator('#pipe-quote').textContent(),/whole kit needs sourcing/);
  await page.waitForFunction(()=>document.querySelector('#world').dataset.waterPreview==='true');
  await capture('Exact corridor preview and actual installation kit','pipes-planner.png');
  await page.getByRole('button',{name:'Queue resident installation',exact:true}).click();
  let s=await snapshot(),id=s.village.pipes.lines[0].id;
  assert.equal(s.village.pipes.lines[0].phase,'awaiting_inputs');assert.equal(s.village.pipes.lines[0].work,0);
  assert.match(await page.locator('#water-lines').textContent(),/Waiting for the kit/);
  await page.getByRole('button',{name:'Find missing parts in Trade',exact:true}).click();
  for(const [i,n]of [[8,2],[9,3],[10,1],[14,1]])assert.equal(await page.locator('#buy-'+i).inputValue(),String(n));
  await page.getByRole('radio',{name:'Drive to collect',exact:false}).check();
  await page.locator('#pickup-driver').selectOption('4');
  await page.getByRole('button',{name:'Buy & collect',exact:true}).click();
  assert.match(await page.locator('#town-pickup-status').textContent(),/Nina is collecting/);
  s=await snapshot();assert(s.village.economy.orders.some(o=>o.pickup_by===4)&&s.residents[4].trip,'The UI creates an actual collection trip');
  await page.getByRole('button',{name:'Close town',exact:true}).click();await show();
  await page.getByRole('button',{name:'Cancel installation',exact:true}).click();
  assert.equal((await snapshot()).village.pipes.lines[0].phase,'retired');

  const carrying=await load('kit-carrying');
  const delivery=carrying.village.logistics.shipments.find(h=>h.carrying&&carrying.village.logistics.stores.some(p=>p.id===h.to&&p.owner.kind==='utility'));
  assert(delivery);assert.match(await page.locator('#water-lines').textContent(),new RegExp(`${carrying.residents.find(r=>r.id===delivery.resident).name} is carrying`));
  await page.locator('#water-lines').scrollIntoViewIfNeeded();await capture('Named resident bringing parts to the route','pipes-kit-delivery.png');
  const dismantling=await load('dismantling'),crew=dismantling.residents.find(r=>r.task==='utility');assert(crew);
  await page.getByRole('button',{name:'Close supplies',exact:true}).click();
  await page.getByRole('button',{name:new RegExp(`^Select ${crew.name}\\.`)}).click();
  assert.match(await page.locator('#person .quote').textContent(),/Dismantling/);
  assert.equal(await page.locator('#person .person-activity').textContent(),'Working on water lines');
  await capture('An existing installer reports the switch to resident dismantling','pipes-resident-work.png');
  await page.getByRole('button',{name:'Close resident details',exact:true}).click();
  const partial=await load('installing');id=partial.village.pipes.lines[0].id;
  await page.getByRole('button',{name:'Pause water line',exact:true}).click();
  await advance(60);s=await snapshot();assert.equal(s.village.pipes.lines[0].work,partial.village.pipes.lines[0].work);assert(s.village.pipes.lines[0].paused);
  await page.getByLabel('Water line priority',{exact:true}).selectOption('3');
  assert.equal((await snapshot()).village.pipes.lines[0].priority,3);
  await capture('Paused corridor work retains progress and priority','pipes-installation-paused.png');
  await page.getByRole('button',{name:'Resume water line',exact:true}).click();
  for(let hour=0;hour<72&&(await snapshot()).village.pipes.lines[0].phase!=='active';hour++)await advance(60);
  s=await snapshot();assert.equal(s.village.pipes.lines[0].phase,'active','Resumed resident work must commission the complete route');
  const raw=JSON.stringify(s),churn=await page.locator('#water-networks').evaluate(el=>new Promise(resolve=>{
    let changes=0;const observer=new MutationObserver(records=>changes+=records.length);observer.observe(el,{subtree:true,childList:true,characterData:true});
    setTimeout(()=>{observer.disconnect();resolve(changes);},700);
  }));
  assert.equal(churn,0,'Paused pipe reports remain stable');assert.equal(JSON.stringify(await snapshot()),raw,'Pipe inspection changes no simulation state');
  await load('pumping');assert.match(await page.locator('#water-lines').textContent(),/[1-9][\d.,]* units transferred/);
  await page.getByRole('button',{name:'Power',exact:true}).click();assert.match(await page.locator('#power-pumps').textContent(),/pump/i);
  await show();await page.locator('#water-lines').scrollIntoViewIfNeeded();await capture('Installed line reports delivered water and battery use','pipes-running.png');
  const beforeRemoval=(await snapshot()).village.simulation.materials.received;
  await page.getByRole('button',{name:'Dismantle line',exact:true}).click();
  assert.equal((await snapshot()).village.pipes.lines[0].phase,'removing');
  for(let hour=0;hour<72&&(await snapshot()).village.pipes.lines[0].phase!=='retired';hour++)await advance(60);
  s=await snapshot();assert.equal(s.village.pipes.lines[0].phase,'retired');
  for(const [i,n]of [[8,1],[9,1],[10,0],[14,1]])assert.equal(s.village.simulation.materials.received[i]-beforeRemoval[i],n,'Dismantling returns the defined kit once');
  await load('replacement');assert.match(await page.locator('#water-lines').textContent(),/5, 24/);
  await capture('Moving a source queues a newly routed installation','pipes-replacement.png');
  for(const name of ['night','outage']){
    await load(name);if(name==='outage')assert.match(await page.locator('#water-lines').textContent(),/power|energy|battery/i);
    await page.getByRole('button',{name:'Close supplies',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#world').dataset.waterPreview==='false');
    assert.equal(await page.locator('#world').getAttribute('data-water-lines'),'1');
    await capture(`Installed water corridors at ${name}`,'pipes-'+name+'.png');
  }
  await load('before');await page.locator('#pipe-kind').selectOption('irrigation');
  assert.match(await page.locator('#pipe-quote').textContent(),/Finish a reed bed/);assert(!await page.locator('#pipe-queue').isEnabled());
  assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved);
  await page.getByRole('button',{name:'Close supplies',exact:true}).click();await page.locator('#dev-button').click();
}
