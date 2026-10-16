import assert from 'node:assert/strict';
import path from 'node:path';
import {readFile} from 'node:fs/promises';

export async function checkSandboxRules({browser,base,output,screenshots,errors}){
 const context=await browser.newContext({viewport:{width:1600,height:900}}),page=await context.newPage();
 context.setDefaultTimeout(30000);
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const snapshot=()=>page.evaluate(()=>window.solarDev.snapshot());
 async function capture(label,file){await page.screenshot({path:path.join(output,file),fullPage:true});screenshots.push({label,file});}
 async function settings(){await page.locator('#settings').click();await page.locator('#sandbox-rules').waitFor({state:'visible'});}
 async function close(){await page.locator('#close-settings').click();}
 async function place(x,y){
  await page.getByRole('button',{name:'Build',exact:true}).click();await page.locator('[data-build-group="food"]').click();await page.locator('.build-tool[data-kind="garden"]').click();await page.evaluate(()=>window.solarDev.fixedView());
  const point=await page.evaluate(async({x,y})=>{const{project}=await import('./projection.js'),r=document.querySelector('#world').getBoundingClientRect(),scale=Math.max(.45,Math.min(r.width/1900,r.height/1050)),p=project(x,y,{x:r.width*.49,y:r.height*.5-459*scale},scale);return{x:p.x+r.left,y:p.y+r.top};},{x,y});
  await page.mouse.click(point.x,point.y);await page.getByRole('button',{name:'Close building tools',exact:true}).click();
 }
 try{
  await page.goto(base);await page.waitForFunction(()=>window.solarDev);await page.locator('[data-new-mode="sandbox"]').click();await page.locator('#main-menu').waitFor({state:'hidden'});await page.locator('#pause').click();await settings();
  for(const key of ['logistics','land','utilities'])assert(!await page.locator('#sandbox-'+key).isChecked());
  assert.match(await page.locator('#sandbox-rule-status').textContent(),/Free instant buildings/);
  await page.locator('#sandbox-logistics').focus();await page.keyboard.press('Space');assert(await page.locator('#sandbox-logistics').isChecked(),'Sandbox rules remain keyboard-operable');await page.locator('#sandbox-land').check();await page.locator('#sandbox-utilities').check();
  const enabled=await snapshot(),founding=enabled.village.buildings.length;assert.deepEqual(enabled.village.buildings.map(b=>b.kind),['shed','warehouse']);assert(enabled.village.sandbox_rules.logistics&&enabled.village.sandbox_rules.land&&enabled.village.sandbox_rules.utilities);
  for(const viewport of [{width:1600,height:900},{width:1280,height:800}]){
   await page.setViewportSize(viewport);await page.locator('#sandbox-rules-title').scrollIntoViewIfNeeded();
   assert.equal(await page.locator('#settings-dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
   await capture(`Independent Sandbox simulation rules use the game settings at ${viewport.width}px`,`sandbox-rules-${viewport.width}.png`);
  }
  await close();await page.setViewportSize({width:1600,height:900});
  assert(await page.locator('[data-hud-resource="fund"]').isVisible());assert.notEqual(await page.locator('#material-total').textContent(),'∞');
  await place(5,5);const planned=await snapshot();assert.equal(planned.village.buildings.length,founding+1);assert.equal(planned.village.buildings[founding].progress,0);assert.match(await page.locator('.build-tool[data-kind="garden"]').getAttribute('aria-label'),/free blueprint/);
  await settings();await page.locator('#sandbox-logistics').uncheck();await close();
  assert.equal((await snapshot()).village.buildings[founding].progress,0,'Disabling supplies cannot instantly finish an existing project');
  await page.locator('#open-village').click();assert(await page.locator('[data-panel="projects-panel"]').isVisible(),'Existing work and land controls remain accessible during free building');
  await page.getByRole('button',{name:'Construction',exact:true}).click();assert(await page.locator('#projects-panel').isVisible());await page.getByRole('button',{name:'Close projects',exact:true}).click();
  assert.notEqual(await page.locator('#material-total').textContent(),'∞','Stored supplies remain real amounts during free construction');
  await place(13,14);const free=await snapshot();assert.equal(free.village.buildings[founding+1].progress,100);assert.equal(free.village.buildings[founding].progress,0);
  await settings();await page.locator('#sandbox-logistics').check();await close();
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('solar-friends-v3-sandbox')));assert(stored.village.sandbox_rules.logistics&&stored.village.sandbox_rules.land&&stored.village.sandbox_rules.utilities);assert.equal(stored.village.buildings[founding].progress,0);assert.equal(stored.village.buildings[founding+1].progress,100);
  await page.reload();await page.locator('[data-continue="sandbox"]').click();await page.locator('#main-menu').waitFor({state:'hidden'});await page.locator('#pause').click();await settings();
  for(const key of ['logistics','land','utilities'])assert(await page.locator('#sandbox-'+key).isChecked());
  await page.locator('#sandbox-rules-title').scrollIntoViewIfNeeded();await capture('All Sandbox rules and mixed construction states survive Continue sandbox','sandbox-rules-reload.png');await close();
  const saved=await page.evaluate(()=>localStorage.getItem('solar-friends-v3-sandbox'));
  await page.locator('#help').click();await page.locator('.dev-tools>summary').click();await page.locator('#help-open-dev').click();await page.locator('#dev-scenario').selectOption('sandbox-planning');await page.locator('#dev-load').click();await page.waitForFunction(()=>window.solarDev.scenario()==='sandbox-planning');
  await page.locator('#dev-minutes').fill('120');await page.locator('#dev-advance').click();await page.locator('#dev-close').click();
  const working=await snapshot();assert(working.village.sandbox_rules.logistics&&working.village.sandbox_rules.land&&working.village.sandbox_rules.utilities);assert(working.village.buildings.some(b=>b.kind==='workshop'&&b.progress<100));
  assert(working.residents.some(r=>['haul','build','water','garden'].includes(r.task))||working.village.buildings.some(b=>b.kind==='workshop'&&b.progress>0),'The protected scene must exercise useful resident work');
  await page.locator('#open-village').click();await page.getByRole('button',{name:'Construction',exact:true}).click();assert(await page.locator('#projects-panel').isVisible());await capture('Sandbox Construction uses delivered materials and real resident work','sandbox-construction.png');
  await page.getByRole('button',{name:'Close projects',exact:true}).click();await settings();await page.locator('#sandbox-utilities').uncheck();await close();assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-sandbox')),saved,'Protected rule changes cannot leak to the playable Sandbox');
  await page.locator('#dev-button').click();await page.locator('#dev-import-file').setInputFiles('artifacts/sandbox-rules/local-power.json');const night=JSON.parse(await readFile('artifacts/sandbox-rules/local-power.json'));
  await page.waitForFunction(minutes=>window.solarDev.snapshot().village.minutes===minutes,night.village.minutes);await page.locator('#dev-close').click();assert.equal((await snapshot()).environment.power.connections[0].light_level,0);
  await settings();await page.locator('#sandbox-utilities').uncheck();await close();assert.equal((await snapshot()).environment.power.connections[0].light_level,1);assert.equal((await snapshot()).village.power.stored,0);
  await page.locator('#open-village').click();await page.getByRole('button',{name:'Power',exact:true}).click();assert.match(await page.locator('#power-title').textContent(),/Comfortable Sandbox power/);assert.match(await page.locator('#power-summary').textContent(),/Operating power is free/);await capture('Comfortable night power is separate from owned battery charge','sandbox-comfortable-power.png');
  assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-sandbox')),saved);assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),null,'Sandbox rules never create a Story save');
 }finally{await context.close();}
}
