import assert from 'node:assert/strict';
import path from 'node:path';
export async function checkClimateControls({page,saved,capture}){
  async function load(name){
    if(!await page.locator('#dev-dialog').isVisible())await page.locator('#dev-button').click();
    await page.locator('[data-dev-tab="simulation"]').click();
    await page.locator('#dev-scenario').selectOption(name);await page.locator('#dev-load').click();
    await page.waitForFunction(name=>window.solarDev.scenario()===name&&window.solarDev.snapshot().village.climate.enabled,name);
    await page.locator('#dev-close').click();
  }
  await load('climate-wet');
  const before=await page.evaluate(()=>JSON.stringify(window.solarDev.snapshot()));
  await page.getByRole('button',{name:'Open weather forecast',exact:true}).click();
  assert(await page.locator('#weather-forecast').evaluate(el=>el.open));
  assert.equal(await page.locator('#weather-days li').count(),7);
  assert.match(await page.locator('#climate-summary').textContent(),/Wet season.*until the dry season/);
  assert.match(await page.locator('#pantry-weather').textContent(),/Rain until/);
  assert(!await page.locator('#season-weather-control').isVisible(),'Story keeps its seasonal calendar');
  assert.equal(await page.evaluate(()=>JSON.stringify(window.solarDev.snapshot())),before,'Reading the clock forecast does not change the scene');
  await capture('A seven-day paper forecast opens directly from the village clock','climate-forecast-wet.png');
  await page.getByRole('button',{name:'Close supplies',exact:true}).click();
  assert.equal(await page.locator('#world').getAttribute('data-weather'),'rain');
  await capture('Seeded wet-season rain shares the existing ground and building palette','climate-wet.png');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
  await capture('Seasonal rain retains cloud and wet-soil cues with reduced motion','climate-wet-reduced.png');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await load('climate-dry');
  assert.equal(await page.locator('#world').getAttribute('data-weather'),'dry');
  await page.getByRole('button',{name:'Open weather forecast',exact:true}).click();
  assert.match(await page.locator('#climate-summary').textContent(),/Dry season/);
  assert.match(await page.locator('#pantry-weather').textContent(),/Clear today/);
  await capture('The dry-period forecast explains lower river flow and the next weather window','climate-forecast-dry.png');
  await page.locator('#dev-button').click();
  await page.locator('#dev-import-file').setInputFiles('artifacts/climate/sandbox-seasons.json');
  await page.waitForFunction(()=>window.solarDev.scenario()==='imported'&&window.solarDev.snapshot().village.mode==='sandbox'&&window.solarDev.snapshot().village.climate.enabled);
  await page.locator('#dev-close').click();await page.getByRole('button',{name:'Open weather forecast',exact:true}).click();
  await page.getByLabel('Seasonal weather in this Sandbox',{exact:true}).uncheck();
  assert.equal(await page.evaluate(()=>window.solarDev.snapshot().village.climate.enabled),false);
  assert.match(await page.locator('#climate-summary').textContent(),/Seasonal variation is off/);
  await page.getByLabel('Seasonal weather in this Sandbox',{exact:true}).check();
  assert.equal(await page.evaluate(()=>window.solarDev.snapshot().village.climate.enabled),true);
  await capture('Sandbox can opt into the same saved seasonal calendar','climate-sandbox-option.png');
  assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved,'Seasonal test scenes preserve the real saved village');
  await page.locator('#dev-button').click();
}

export async function checkClimateSandboxSave({browser,base,output,screenshots,errors}){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  try{
    await page.goto(base);await page.waitForFunction(()=>window.solarDev);
    await page.locator('[data-new-mode="sandbox"]').click();
    await page.locator('#main-menu').waitFor({state:'hidden'});await page.locator('#pause').click();
    await page.getByRole('button',{name:'Open weather forecast',exact:true}).click();
    assert(!await page.getByLabel('Seasonal weather in this Sandbox',{exact:true}).isChecked());
    await page.getByLabel('Seasonal weather in this Sandbox',{exact:true}).check();
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('solar-friends-v3-sandbox')).village.climate.enabled),true);
    await page.reload();await page.locator('[data-continue="sandbox"]').click();
    await page.locator('#main-menu').waitFor({state:'hidden'});await page.locator('#pause').click();
    await page.getByRole('button',{name:'Open weather forecast',exact:true}).click();
    assert(await page.getByLabel('Seasonal weather in this Sandbox',{exact:true}).isChecked());
    assert.match(await page.locator('#climate-summary').textContent(),/Wet season/);
    const file='climate-sandbox-reload.png';await page.screenshot({path:path.join(output,file),fullPage:true});screenshots.push({label:'Real Sandbox seasons survive saving, reloading and Continue sandbox',file});
    await page.getByLabel('Seasonal weather in this Sandbox',{exact:true}).uncheck();
    await page.reload();await page.locator('[data-continue="sandbox"]').click();
    await page.locator('#main-menu').waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>window.solarDev.snapshot().village.climate.enabled),false);
    assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),null,'Sandbox settings never create a Story save');
  }finally{await context.close();}
}
