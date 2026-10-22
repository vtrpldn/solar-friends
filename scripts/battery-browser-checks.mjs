import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
export async function checkBatteryControls({page,saved,capture}){
  const snapshot=()=>page.evaluate(()=>window.solarDev.snapshot());
  async function importScene(name){
    const expected=JSON.parse(await readFile(`artifacts/electricity/batteries/${name}.json`,'utf8'));
    if(!await page.locator('#dev-dialog').isVisible())await page.locator('#dev-button').click();
    await page.locator('#dev-import-file').setInputFiles(`artifacts/electricity/batteries/${name}.json`);
    await page.waitForFunction(({minutes,phase})=>{const v=window.solarDev.snapshot().village;return v.version===43&&v.minutes===minutes&&v.power.battery_jobs.at(-1)?.phase===phase;},{minutes:expected.village.minutes,phase:expected.village.power.battery_jobs.at(-1)?.phase});
    await page.locator('#dev-close').click();await page.evaluate(()=>window.solarDev.fixedView());
  }
  async function show(){
    if(!await page.locator('#village-book').isVisible())await page.locator('#open-village').click();
    if(!await page.locator('#power-panel').isVisible())await page.getByRole('button',{name:'Power',exact:true}).click();
  }
  async function advance(minutes){
    await page.locator('#dev-button').click();await page.locator('#dev-minutes').fill(String(minutes));await page.locator('#dev-advance').click();await page.locator('#dev-close').click();await show();
  }
  const point=()=>page.evaluate(async()=>{const {project}=await import('./projection.js');const r=document.querySelector('#world').getBoundingClientRect(),s=Math.max(.45,Math.min(r.width/1900,r.height/1050));const p=project(14,20,{x:r.width*.49,y:r.height*.5-459*s},s);return{x:r.left+p.x,y:r.top+p.y};});
  await importScene('recovered');await show();
  const before=await snapshot(),bank=before.village.power.network.nodes.find(n=>n.owner.kind==='ground');
  await page.getByRole('button',{name:'Move battery',exact:true}).click();
  assert(await page.locator('#relocation-guidance').isVisible(),'Relocation guidance must remain visible with Build closed');
  const dest=await point();await page.mouse.move(dest.x,dest.y);
  await capture('Battery destination preview with visible resident-work guidance','battery-move-preview.png');
  await page.mouse.click(dest.x,dest.y);
  let s=await snapshot(),job=s.village.power.battery_jobs.at(-1);
  assert.equal(job.phase,'packing');assert.deepEqual(job.destination,[14,20]);assert.equal(job.work,0);
  await show();await page.getByRole('button',{name:'Cancel battery work',exact:true}).click();
  s=await snapshot();assert.equal(s.village.power.battery_jobs.at(-1).phase,'cancelled');assert.equal(s.village.power.network.nodes.find(n=>n.id===bank.id).charge,bank.charge);
  await page.getByRole('button',{name:'Move battery',exact:true}).click();await page.mouse.click(dest.x,dest.y);await show();
  for(let i=0;i<96;i++){
    s=await snapshot();if(s.village.power.battery_jobs.at(-1).phase==='complete')break;await advance(60);
  }
  s=await snapshot();job=s.village.power.battery_jobs.at(-1);
  assert.equal(job.phase,'complete');assert.deepEqual([s.village.power.network.nodes[0].x,s.village.power.network.nodes[0].y],[14,20]);assert.equal(s.village.power.network.nodes[0].charge,bank.charge);
  assert.match(await page.locator('#battery-banks').innerText(),/Ready to connect/);
  await page.getByRole('button',{name:'Locate',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#world').dataset.cameraMoving==='false');
  await capture('Residents install the same charged bank at its reserved plot','battery-installed.png');
  await page.getByText('Salvage battery',{exact:true}).click();
  assert.match(await page.locator('#battery-banks').innerText(),/energy will be discharged/);
  await page.getByRole('button',{name:'Queue careful salvage',exact:true}).click();
  assert.equal((await snapshot()).village.power.battery_jobs.at(-1).phase,'salvaging');
  for(let i=0;i<96;i++){s=await snapshot();if(s.village.power.salvaged_equipment===1)break;await advance(60);}
  s=await snapshot();assert.equal(s.village.power.salvaged_equipment,1);assert.equal(s.village.economy.stock[13],1);assert.equal(s.village.power.network.account.discharged,bank.charge);
  await capture('Careful salvage returns one paid unit after attended work','battery-salvaged.png');
  await importScene('carrying');await show();
  assert.match(await page.locator('#battery-banks').innerText(),/In transit/);
  await page.getByRole('button',{name:'Locate',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#world').dataset.cameraMoving==='false');
  await capture('A recovered bank is shown with its actual carrier','battery-carried.png');
  await importScene('installed-night');await show();
  await page.getByRole('button',{name:'Locate',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#world').dataset.cameraMoving==='false');
  await capture('Recovered equipment uses the shared night shading without a floor platform','battery-night.png');
  assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved);
}
