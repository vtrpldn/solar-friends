import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

export async function checkWaterControls({page,saved,capture}){
  async function load(name){
    if(!await page.locator('#dev-dialog').isVisible())await page.locator('#dev-button').click();
    await page.locator('[data-dev-tab="simulation"]').click();
    const file=`artifacts/water/${name}.json`,expected=JSON.parse(await readFile(file,'utf8'));
    await page.locator('#dev-import-file').setInputFiles(file);
    await page.waitForFunction(expected=>JSON.stringify(window.solarDev.snapshot().village.water_supply)===JSON.stringify(expected),expected.village.water_supply);
    await page.locator('#dev-close').click();
    await page.locator('[data-hud-resource="water"]').click();
    if(!await page.locator('#local-water').evaluate(el=>el.open))await page.getByText('Where water is',{exact:true}).click();
    return expected;
  }
  const carrying=await load('carrying'),h=carrying.village.water_supply.trips.find(h=>h.carrying),person=carrying.residents.find(r=>r.id===h.resident);
  const initial=await page.evaluate(()=>JSON.stringify(window.solarDev.snapshot()));
  assert.match(await page.locator(`[data-water-carrier="${h.resident}"]`).textContent(),new RegExp(`${person.name}.*carrying ${h.amount} fresh water`));
  const destination=page.locator(`[data-water-container="${h.to}"]`);
  assert.match(await destination.textContent(),/on the way · not usable yet/);
  await destination.scrollIntoViewIfNeeded();
  await capture('Located water shows the actual destination and carried load','water-in-transit.png');
  const churn=await page.locator('#local-water').evaluate(el=>new Promise(resolve=>{
    let changes=0;const observer=new MutationObserver(records=>{changes+=records.length;});observer.observe(el,{subtree:true,childList:true,characterData:true});
    setTimeout(()=>{observer.disconnect();resolve(changes);},700);
  }));
  assert.equal(churn,0,'Paused water reports must not rebuild the panel');
  assert.equal(await page.evaluate(()=>JSON.stringify(window.solarDev.snapshot())),initial,'Reading water locations cannot change the simulation');
  await page.getByRole('button',{name:'Close supplies',exact:true}).click();
  await capture('Resident carries a water pail at gameplay scale','water-carry-art.png');
  const recovered=await load('interrupted'),ground=recovered.village.water_supply.tanks.find(p=>p.id===h.recovery);
  assert.equal(ground.owner.kind,'ground');assert.equal(ground.water[0],h.amount);
  await page.locator(`[data-water-container="${ground.id}"]`).scrollIntoViewIfNeeded();
  assert.match(await page.locator(`[data-water-container="${ground.id}"]`).textContent(),/Recoverable liquid containers/);
  await capture('Interrupted water remains in a recoverable container','water-recovery.png');
  await load('interrupted-night');
  await page.getByRole('button',{name:'Close supplies',exact:true}).click();
  await capture('Recovered water pails follow the village night palette','water-recovery-night.png');
  await load('irrigation-carrying');
  assert.match(await page.locator('#local-water-stores').textContent(),/carrying 4 irrigation/);
  await page.locator('[data-water-carrier]').last().scrollIntoViewIfNeeded();
  await capture('Reclaimed irrigation remains separate from fresh-water loads','water-irrigation.png');
  const moved=await load('moved'),old=moved.village.water_supply.tanks.find(p=>p.owner.kind==='ground'&&p.x===5&&p.y===5&&p.water[0]===24);
  assert(old);assert.match(await page.locator(`[data-water-container="${old.id}"]`).textContent(),/24 \/ 24 fresh water/);
  const rain=await load('rain');
  assert(rain.village.water_supply.tanks.some(p=>p.owner.kind==='building'&&p.owner.id===0&&p.water[0]>0));
  assert.match(await page.locator('#toilet-status').textContent(),/delivered to an open toilet/,'A distant cistern does not satisfy local handwashing');
  assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved);
  await page.getByRole('button',{name:'Close supplies',exact:true}).click();
  await page.locator('#dev-button').click();
}
