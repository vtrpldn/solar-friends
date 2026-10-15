import assert from 'node:assert/strict';
export async function checkUtilityRoutes({page,saved,capture}){
  if(!await page.locator('#dev-dialog').isVisible())await page.locator('#dev-button').click();
  async function load(name){
    await page.locator('[data-dev-tab="simulation"]').click();
    await page.locator('#dev-import-file').setInputFiles(`artifacts/utility-routes/${name}.json`);
    await page.waitForFunction(name=>{const s=window.solarDev.snapshot();return name==='no-supply'?s.village.buildings.length===1&&s.village.buildings[0].kind==='garden':name==='blueprints'?s.village.buildings.length===2&&s.village.buildings[0].progress===0:name==='moving'?s.village.building_jobs.length===1:s.village.buildings.length===10&&s.village.building_jobs.length===0;},name);
    await page.locator('[data-dev-tab="utilities"]').click();
  }
  const state=()=>page.evaluate(()=>JSON.stringify(window.solarDev.snapshot()));
  await load('ready');const initial=await state();
  assert.match(await page.locator('[data-dev-page="utilities"]').textContent(),/Preview only/);
  await page.getByLabel('Utility class',{exact:true}).selectOption('fresh');
  await page.getByLabel('Supply or waste outlet',{exact:true}).selectOption('0');await page.getByLabel('Destination',{exact:true}).selectOption('1');
  assert.match(await page.locator('#dev-utility-status').textContent(),/5 corridor cells · 5 along roads/);assert.equal(await page.locator('[data-utility-route]').count(),1);
  await capture('Read-only water corridor follows exact ports and existing road cells','utility-fresh-route.png');
  for(const [kind,from,to]of [['irrigation','3','-2'],['greywater','2','3'],['sewage','4','5'],['electricity','9','8']]){
    await page.getByLabel('Utility class',{exact:true}).selectOption(kind);
    await page.getByLabel('Supply or waste outlet',{exact:true}).selectOption(from);await page.getByLabel('Destination',{exact:true}).selectOption(to);
    assert.match(await page.locator('#dev-utility-status').textContent(),/Proposal only; nothing installed/);
    if(kind==='irrigation')assert.equal(await page.locator('#dev-utility-to option[value="2"]').count(),0,'Kitchen cannot receive reclaimed irrigation');
  }
  assert.match(await page.locator('#dev-utility-status').textContent(),/integral bank lead/);
  await capture('River generator uses its integral bank lead before joining safe land corridors','utility-hydro-route.png');
  await page.getByRole('button',{name:'Refresh route plan',exact:true}).click();assert.equal(await state(),initial,'Reading route plans cannot change the protected village');
  await load('moving');await page.getByLabel('Utility class',{exact:true}).selectOption('fresh');await page.getByLabel('Supply or waste outlet',{exact:true}).selectOption('0');await page.getByLabel('Destination',{exact:true}).selectOption('1');
  assert.match(await page.locator('#dev-utility-status').textContent(),/Finish building work/);assert.equal(await page.locator('[data-utility-route]').count(),0);
  await capture('A moving cistern cannot promise an active utility route','utility-move-blocker.png');
  await load('blueprints');await page.getByLabel('Supply or waste outlet',{exact:true}).selectOption('0');assert.match(await page.locator('#dev-utility-status').textContent(),/Finish building work/);
  await load('no-supply');await page.getByLabel('Utility class',{exact:true}).selectOption('irrigation');
  assert(!await page.getByLabel('Supply or waste outlet',{exact:true}).isEnabled());
  assert.match(await page.locator('#dev-utility-status').textContent(),/needs a compatible supply/);
  assert.equal(await page.locator('[data-utility-route]').count(),0);
  assert.equal(await page.locator('[data-utility-endpoint="0"]').getAttribute('fill'),'#9c4921','A receiver is never shown as a supply when its supplier is missing');
  assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved);
  await page.locator('[data-dev-tab="simulation"]').click();
}
