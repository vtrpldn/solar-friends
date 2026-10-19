import {checkSandboxRules} from './sandbox-browser-checks.mjs';
import {checkStoryControls} from './story-browser-checks.mjs';
import {checkSupplierControls,checkSupplierSandboxSave} from './supplier-browser-checks.mjs';
import {checkMaintenanceControls,checkMaintenanceSandboxSave} from './maintenance-browser-checks.mjs';
import {checkSkillControls,checkSkillSandboxSave} from './skills-browser-checks.mjs';
import {checkFarmingControls} from './farming-browser-checks.mjs';
import {checkInterfaceControls,checkArtworkInterface} from './interface-browser-checks.mjs';
import {checkWorkshopPowerControls,checkElectricalControls} from './electricity-browser-checks.mjs';
import {checkOrganicControls} from './organics-browser-checks.mjs';
import {checkCultivationControls} from './cultivation-browser-checks.mjs';
import {checkLandControls} from './land-browser-checks.mjs';
import {checkRestorationControls} from './restoration-browser-checks.mjs';
import {checkPlantingControls} from './planting-browser-checks.mjs';
import {checkLivingLandControls} from './living-land-browser-checks.mjs';
import {checkUtilityRoutes} from './utility-routes-browser-checks.mjs';
import {checkWaterControls} from './water-browser-checks.mjs';
import {checkPipeControls} from './pipes-browser-checks.mjs';
import {checkSanitationControls} from './sanitation-browser-checks.mjs';
import {checkProcessControls} from './process-browser-checks.mjs';
import {checkFreshnessControls} from './freshness-browser-checks.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {checkToolControls} from './tool-browser-checks.mjs';
import {checkFoodControls} from './food-browser-checks.mjs';
import {checkKitchenControls} from './kitchen-browser-checks.mjs';
import {checkBatteryControls} from './battery-browser-checks.mjs';
import {checkGatheringControls} from './gathering-browser-checks.mjs';
import {checkClimateControls,checkClimateSandboxSave} from './climate-browser-checks.mjs';
export async function checkBrowser({browser,base,output,screenshots,errors}) {
  const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  context.setDefaultTimeout(30000);context.setDefaultNavigationTimeout(30000);
  context.on('page',page=>{
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
    page.on('console',msg=>{if(msg.type()==='error'){const url=msg.location().url;errors.push(msg.text()+(url?' · '+url:''));}});
  });
  let page=await context.newPage();
  async function capture(label,file) { console.log('Browser capture: '+label);await page.screenshot({path:path.join(output,file),fullPage:true});screenshots.push({label,file}); }
  await page.goto(base);await page.waitForFunction(()=>window.solarDev);
  await page.locator('#main-menu').waitFor({state:'visible'});
  await capture('Main menu: Story and Sandbox','main-menu.png');
  await page.locator('[data-new-mode="story"]').click();
  await page.locator('#main-menu').waitFor({state:'hidden'});
  await page.locator('#pause').click();
  await page.locator('#settings').click();await page.locator('#save').click();await page.locator('#close-settings').click();
  await page.locator('#help').click();
  await page.locator('#help-dialog .dev-tools summary').click();
  await page.locator('#help-open-dev').click();
  assert(await page.locator('#dev-dialog').isVisible());
  await page.locator('#dev-close').click();
  // Game HUD controls route into the appropriate village page.
  await page.locator('[data-hud-resource="materials"]').click();
  assert(await page.locator('#supplies-panel').isVisible());
  assert(await page.locator('#materials-stores').evaluate(el=>el.open));
  assert.equal(await page.locator('.material-slot').count(),29);
  const idleRefreshes=await page.evaluate(()=>new Promise(resolve=>{
    let count=0;const observer=new MutationObserver(records=>{count+=records.length;});
    observer.observe(document.querySelector('#supplies-panel'),{subtree:true,childList:true,characterData:true});
    setTimeout(()=>{observer.disconnect();resolve(count);},1000);
  }));
  assert.equal(idleRefreshes,0,'Paused panels must stay stable until an action changes them');
  await page.getByRole('button',{name:'Trade',exact:true}).click();
  await page.getByRole('button',{name:'Add one timber',exact:true}).click();
  assert.equal(await page.locator('#buy-0').inputValue(),'1');
  assert((await page.locator('#town-total').textContent()).includes('67'));
  await page.getByRole('button',{name:'Remove one timber',exact:true}).click();
  assert.equal(await page.locator('#buy-0').inputValue(),'0');
  await page.getByRole('button',{name:'Close town',exact:true}).click();
  await page.keyboard.press('b');assert(await page.locator('#build-panel').isVisible());
  await page.keyboard.press('Escape');assert(!await page.locator('#build-panel').isVisible());
  await page.keyboard.press('Escape');assert(await page.locator('#main-menu').isVisible());
  await page.locator('#menu-return').click();
  await page.keyboard.press('j');assert(await page.locator('#quest-dialog').isVisible());
  await page.locator('[data-chapter="1"]').click();assert.equal(await page.locator('.quest-card:not([hidden])').count(),1);
  assert((await page.locator('.quest-card:not([hidden]) h3').textContent()).includes('Roots for Tomorrow'));
  await page.locator('#close-journal').click();
  await page.locator('#help').click();if(!await page.locator('#help-dialog .dev-tools').evaluate(el=>el.open))await page.locator('#help-dialog .dev-tools summary').click();await page.locator('#help-open-dev').click();
  const original=await page.evaluate(()=>window.solarDev.snapshot());
  const saved=await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story'));
  await checkInterfaceControls({page,saved,capture});
  await checkStoryControls({page,saved,capture});
  assert.equal(original.village.economy.sources.length,0,'New villages start without fixed resource sites');
  await checkLandControls({page,saved,capture});
  await checkRestorationControls({page,saved,capture});
  await checkCultivationControls({page,saved,capture});
  await checkPlantingControls({page,saved,capture});
  await checkLivingLandControls({page,saved,capture});
  await checkClimateControls({page,saved,capture});
  await checkFarmingControls({page,saved,capture});
  await checkMaintenanceControls({page,saved,capture});
  await checkSkillControls({page,saved,capture});
  await checkSupplierControls({page,saved,capture});
  await checkUtilityRoutes({page,saved,capture});
  await checkWaterControls({page,saved,capture});
  await checkPipeControls({page,saved,capture});
  await checkSanitationControls({page,saved,capture});
  // Earned full-story checkpoints come from verify-quests, not completion cheats.
  async function storyCheckpoint(chapter){
    await page.locator('#dev-import-file').setInputFiles(`artifacts/story/solar-chapter-${chapter}.json`);
    await page.waitForFunction(chapter=>window.solarDev.snapshot().village.progress.tracked===chapter,chapter);
    await page.locator('#dev-close').click();
  }
  await storyCheckpoint(9);
  await page.keyboard.press('j');
  assert.equal(await page.locator('[data-chapter]').count(),13);
  assert.equal(await page.locator('.quest-card:not([hidden]) [data-quest-art]').getAttribute('data-quest-art'),'adobe-gable');
  const materialChoices=page.locator('.quest-card:not([hidden]) .journal-options');
  if(!await materialChoices.evaluate(el=>el.open))await materialChoices.locator('summary').click();
  const materialPath=page.locator('.quest-card:not([hidden]) .journal-option').filter({hasText:'Harvest the five local materials'});
  assert(await materialPath.isVisible());
  await materialPath.getByRole('button').click();
  assert(await page.locator('#projects-panel').isVisible());
  assert(await page.locator('#land-sources').evaluate(el=>el.closest('details').open));
  await page.getByRole('button',{name:'Close projects',exact:true}).click();
  await page.keyboard.press('j');
  await page.locator('[data-chapter="12"]').click();
  assert((await page.locator('.quest-card:not([hidden]) h3').textContent()).includes('A Village in Balance'));
  assert((await page.locator('.quest-card:not([hidden])').textContent()).includes('Keep the village comfortable for twelve dry hours'));
  assert(!(await page.locator('.quest-card:not([hidden]) .objective').allTextContents()).some(text=>/every building/.test(text)));
  await capture('Outcome chapters retain optional material paths and a sustained dry-period finale','story-journal.png');
  await page.locator('#close-journal').click();
  await page.locator('#dev-button').click();
  // Replay the concern when it actually emerged; a changed work layout can
  // resolve earlier care before the chapter introducing it becomes available.
  await page.locator('#dev-import-file').setInputFiles('artifacts/story/care-check-in.json');
  await page.waitForFunction(()=>{const care=window.solarDev.snapshot().village.situations.active;return care&&care.response===null&&care.resolved===null;});
  await page.locator('#dev-close').click();
  await page.locator('#open-situations').click();
  assert(await page.locator('#situation-dialog').isVisible());
  await page.locator('[data-situation-response="day_off"]').click();
  assert.equal(await page.evaluate(()=>window.solarDev.snapshot().village.situations.active.response),'day_off');
  assert((await page.locator('#situation-dialog').textContent()).includes('Protect a day off'));
  await capture('Story care agreement requires actual follow-through','story-care.png');
  await page.locator('#close-situation').click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved);
  await page.locator('#dev-button').click();

  // Building work uses a garden earned through resident construction.
  const gardenFile='artifacts/building-work/earned-garden.json',earnedGarden=JSON.parse(await readFile(gardenFile,'utf8'));
  async function loadEarnedGarden(){
    await page.locator('#dev-import-file').setInputFiles(gardenFile);
    await page.waitForFunction(expected=>{const v=window.solarDev.snapshot().village;return v.minutes===expected&&v.buildings.length===1&&v.buildings[0].kind==='garden'&&v.buildings[0].progress===100&&v.building_jobs.length===0;},earnedGarden.village.minutes);
    await page.locator('#dev-close').click();
    await page.getByRole('button',{name:'Village',exact:true}).click();await page.getByRole('button',{name:'Buildings',exact:true}).click();
  }
  await loadEarnedGarden();
  const earnedWood=await page.evaluate(()=>window.solarDev.snapshot().village.wood);
  await page.locator('[data-building-work="salvage"]').click();
  assert((await page.locator('#building-work-note').textContent()).includes('2 timber, 2 building earth'));
  await page.locator('#building-work-confirm').click();
  let crew=await page.evaluate(()=>window.solarDev.snapshot());assert.equal(crew.village.buildings.length,1);assert.equal(crew.village.wood,earnedWood);assert.equal(crew.village.building_jobs[0].work,0);
  assert((await page.locator('#building-work-status').textContent()).includes('Paused'));
  await page.locator('#dev-button').click();await page.locator('#dev-minutes').fill('10');await page.locator('#dev-advance').click();await page.locator('#dev-close').click();
  crew=await page.evaluate(()=>window.solarDev.snapshot());assert(crew.village.building_jobs[0].work>0);assert.equal(crew.village.wood,earnedWood);assert.equal(crew.village.buildings.length,1);
  await capture('Resident salvage underway; recovered materials remain pending','building-salvage.png');
  await page.locator('#dev-button').click();await page.locator('#dev-minutes').fill('90');await page.locator('#dev-advance').click();await page.locator('#dev-close').click();
  crew=await page.evaluate(()=>window.solarDev.snapshot());assert.equal(crew.village.buildings.length,0);assert.equal(crew.village.wood,earnedWood+2);
  await page.locator('#dev-button').click();await loadEarnedGarden();
  await page.evaluate(()=>window.solarDev.fixedView());
  await page.locator('[data-building-work="move"]').click();
  const movePoint=await page.evaluate(async()=>{const {project}=await import('./projection.js');const r=document.querySelector('#world').getBoundingClientRect(),s=Math.max(.45,Math.min(r.width/1900,r.height/1050));const p=project(18,18,{x:r.width*.49,y:r.height*.5-459*s},s);return{x:r.left+p.x,y:r.top+p.y};});
  await page.mouse.click(movePoint.x,movePoint.y);
  crew=await page.evaluate(()=>window.solarDev.snapshot());assert.equal(crew.village.building_jobs[0].action,'move');assert.deepEqual(crew.village.building_jobs[0].destination,[18,18]);assert.equal(crew.village.buildings[0].x,6);
  await page.locator('#dev-button').click();await page.locator('#dev-minutes').fill('20');await page.locator('#dev-advance').click();await page.locator('#dev-close').click();
  // A live earned checkpoint retains residents' unfinished activities and
  // travel. Observe the handoff instead of assuming packing ends at minute 20.
  for(let minute=0;minute<180;minute++){
    crew=await page.evaluate(()=>window.solarDev.snapshot());
    if(crew.village.building_jobs[0]?.stage!=='pack')break;
    await page.locator('#dev-button').click();await page.locator('#dev-minutes').fill('1');await page.locator('#dev-advance').click();await page.locator('#dev-close').click();
  }
  crew=await page.evaluate(()=>window.solarDev.snapshot());assert.equal(crew.village.building_jobs[0].stage,'rebuild');assert.equal(crew.village.buildings[0].x,18);assert.equal(crew.village.buildings[0].progress,0);
  await capture('Packing complete; crew walks to the new site to rebuild','building-move.png');
  await page.locator('#dev-button').click();await page.locator('#dev-minutes').fill('360');await page.locator('#dev-advance').click();await page.locator('#dev-close').click();
  crew=await page.evaluate(()=>window.solarDev.snapshot());assert.equal(crew.village.building_jobs.length,0);assert.equal(crew.village.buildings[0].id,0);assert.equal(crew.village.buildings[0].progress,100);assert.equal(crew.village.wood,earnedWood);
  assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved);
  await page.locator('#dev-button').click();
  // Place a real material plot and exercise its controls without touching the player's saved village.
  await page.locator('#dev-scenario').selectOption('arrival');await page.locator('#dev-load').click();await page.locator('#dev-close').click();
  await page.getByRole('button',{name:'Build',exact:true}).click();await page.locator('[data-build-group="land"]').click();
  assert.equal(await page.locator('.build-tool[data-group="land"]').count(),5);
  await page.getByRole('button',{name:'Place Timber trees',exact:true}).click();
  await page.evaluate(()=>window.solarDev.fixedView());
  const treePlot=await page.evaluate(async()=>{const {project}=await import('./projection.js');const r=document.querySelector('#world').getBoundingClientRect();const scale=Math.max(.45,Math.min(r.width/1900,r.height/1050));const p=project(5,5,{x:r.width*.49,y:r.height*.5-459*scale},scale);return {x:p.x+r.left,y:p.y+r.top};});
  const planting=await page.evaluate(()=>window.solarDev.snapshot());
  await page.mouse.click(treePlot.x,treePlot.y);
  let land=await page.evaluate(()=>window.solarDev.snapshot());
  assert.equal(land.village.economy.sources.length,1);assert.equal(land.village.economy.sources[0].growth,0);
  assert.equal(land.village.economy.money,planting.village.economy.money-4000);assert.equal(land.village.water,planting.village.water);
  await page.locator('#open-village').click();await page.getByRole('button',{name:'Construction',exact:true}).click();
  if(!await page.locator('#land-sources').evaluate(el=>el.closest('details').open))await page.getByText('Our land resources',{exact:true}).click();
  assert(!await page.getByRole('button',{name:'Cut one tree · 8 timber',exact:true}).isEnabled());
  assert((await page.locator('#land-sources').textContent()).includes('Awaiting resident planting'));
  await page.locator('[data-site="0"][data-source-setting="harvest"]').uncheck();
  assert(!(await page.evaluate(()=>window.solarDev.snapshot())).village.economy.sources[0].auto_harvest);
  await capture('Player plants timber trees and chooses harvest settings','player-planted-timber.png');
  await page.locator('#dev-button').click();await page.locator('#dev-scenario').selectOption('cultivation');await page.locator('#dev-load').click();
  await page.locator('#dev-minutes').fill('1440');await page.locator('#dev-advance').click();
  await page.locator('#dev-minutes').fill('1');await page.locator('#dev-advance').click();await page.locator('#dev-close').click();
  await page.locator('#open-village').click();await page.getByRole('button',{name:'Construction',exact:true}).click();
  if(!await page.locator('#land-sources').isVisible())if(!await page.locator('#land-sources').evaluate(el=>el.closest('details').open))await page.getByText('Our land resources',{exact:true}).click();
  for(let hours=0;hours<24&&(await page.evaluate(()=>window.solarDev.snapshot().village.economy.sources.slice(0,2).some(s=>s.growth<1)));hours++){await page.locator('#dev-button').click();await page.locator('#dev-minutes').fill('60');await page.locator('#dev-advance').click();await page.locator('#dev-close').click();}
  land=await page.evaluate(()=>window.solarDev.snapshot());
  assert.equal(land.village.economy.sources[0].remaining,32);assert.equal(land.village.economy.sources[1].remaining,24);
  const harvestedTimber=land.village.wood,harvestedBamboo=land.village.economy.stock[1];
  await page.getByRole('button',{name:'Cut one tree · 8 timber',exact:true}).click();await page.getByRole('button',{name:'Harvest bamboo',exact:true}).click();
  land=await page.evaluate(()=>window.solarDev.snapshot());
  assert.equal(land.village.wood,harvestedTimber,'Requesting harvest does not grant timber before resident work');
  assert(land.village.economy.sources.slice(0,2).every(s=>s.harvest_requested));
  await page.locator('#dev-button').click();await page.locator('#dev-minutes').fill('1440');await page.locator('#dev-advance').click();
  await page.locator('#dev-minutes').fill('150');await page.locator('#dev-advance').click();await page.locator('#dev-close').click();
  // Accepted harvests share real travel and community hours with the soil-supply loop.
  // Observe their completion rather than assuming both fit the same workday.
  for(let hours=0;hours<24&&(await page.evaluate(()=>window.solarDev.snapshot().village.economy.sources.slice(0,2).some(s=>s.harvest_requested)));hours++){await page.locator('#dev-button').click();await page.locator('#dev-minutes').fill('60');await page.locator('#dev-advance').click();await page.locator('#dev-close').click();}
  land=await page.evaluate(()=>window.solarDev.snapshot());
  assert.equal(land.village.wood,harvestedTimber+8);assert.equal(land.village.economy.stock[1],harvestedBamboo+4);
  assert.equal(land.village.economy.sources[0].remaining,24);assert.equal(land.village.economy.sources[1].remaining,20);
  assert(land.village.economy.sources.slice(0,2).every(s=>!s.harvest_requested));
  await capture('Resident harvests deliver whole-tree timber and cultivated bamboo','material-harvest-controls.png');
  const reserve=land.village.economy.land[1];
  page.once('dialog',dialog=>dialog.accept());await page.locator('[data-site="2"][data-action="clear"]').click();
  land=await page.evaluate(()=>window.solarDev.snapshot());assert(!land.village.economy.sources[2].active);assert.equal(land.village.economy.land[1],reserve);
  assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved);
  await page.locator('#dev-button').click();
  // Exercise the real request controls. Building visitors also use a .requests grid.
  await page.locator('#dev-scenario').selectOption('village');await page.locator('#dev-load').click();
  await page.waitForFunction(()=>window.solarDev.scenario()==='village');
  await page.locator('#dev-close').click();
  // Buy a small order for collection through the real Trade controls.
  const stockBefore=await page.evaluate(()=>window.solarDev.snapshot().environment.economy.materials[12].stored);
  await page.getByRole('button',{name:'Village',exact:true}).click();
  await page.getByRole('button',{name:'Trade',exact:true}).click();
  await page.locator('[name="town-transport"][value="pickup"]').check();
  await page.locator('#buy-0').fill('41');
  assert(!await page.locator('#town-order').isEnabled());
  assert((await page.locator('#town-basket-status').textContent()).includes('40 units'));
  await page.locator('#buy-0').fill('0');await page.locator('#buy-12').fill('2');
  await page.locator('#pickup-driver').selectOption('0');
  assert((await page.locator('#town-total').textContent()).includes('580'));
  await page.locator('#town-order').click();
  assert((await page.locator('#town-pickup-status').textContent()).includes('Resume time'));
  let pickup=await page.evaluate(()=>window.solarDev.snapshot());
  assert.equal(pickup.residents[0].trip.purpose,'pickup');
  assert.equal(pickup.village.economy.orders[0].status,'collecting');
  assert.equal(pickup.environment.economy.materials[12].stored,stockBefore);
  await page.locator('#dev-button').click();await page.locator('#dev-minutes').fill('90');await page.locator('#dev-advance').click();
  pickup=await page.evaluate(()=>window.solarDev.snapshot());
  assert.equal(pickup.residents[0].trip.phase,'away');
  assert.equal(pickup.environment.economy.materials[12].stored,stockBefore);
  await page.locator('#dev-close').click();await page.locator('[data-citizen="0"]').click();
  assert((await page.locator('#person').textContent()).includes('Driving to collect supplies'));
  await page.getByRole('button',{name:'Close resident details',exact:true}).click();
  await page.locator('#dev-button').click();await page.locator('#dev-minutes').fill('120');await page.locator('#dev-advance').click();
  pickup=await page.evaluate(()=>window.solarDev.snapshot());
  assert.equal(pickup.village.economy.orders[0].status,'delivered');
  assert.equal(pickup.environment.economy.materials[12].stored,stockBefore+2);
  assert.equal(pickup.environment.economy.materials[12].incoming,0);
  assert((await page.locator('#town-pickup-status').textContent()).includes('supplies home'));
  assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved);
  // An order awaiting dispatch can switch to pickup without paying twice.
  await page.locator('#dev-load').click();await page.locator('#dev-close').click();
  await page.getByRole('button',{name:'Village',exact:true}).click();await page.getByRole('button',{name:'Trade',exact:true}).click();
  await page.locator('[name="town-transport"][value="delivery"]').check();await page.locator('#buy-10').fill('1');await page.locator('#town-order').click();
  const deliveryFunds=await page.evaluate(()=>window.solarDev.snapshot().village.economy.money);
  const deliveries=page.locator('details').filter({has:page.locator('#town-orders')});if(!await deliveries.evaluate(el=>el.open))await deliveries.locator('summary').click();await page.locator('[data-collect-order="0"]').click();
  await page.locator('#pickup-order-driver').selectOption('1');
  assert((await page.locator('#pickup-order-summary').textContent()).includes('R$ 40'));
  await capture('Choose a driver for same-day town pickup','town-pickup.png');
  await page.locator('#pickup-confirm').click();
  pickup=await page.evaluate(()=>window.solarDev.snapshot());
  assert.equal(pickup.village.economy.money,deliveryFunds+4000);
  assert.equal(pickup.residents[1].trip.purpose,'pickup');
  // Helping with water needs a real empty receiver and a reachable supply.
  // The replenished village used for the trade checks already has full buffers.
  await page.locator('#dev-button').click();
  await page.locator('#dev-import-file').setInputFiles('artifacts/water/before.json');
  await page.waitForFunction(()=>{const v=window.solarDev.snapshot().village;return v.buildings.length===5&&v.water===24&&v.water_supply.trips.length===0;});
  await page.locator('#dev-close').click();
  await page.getByRole('button',{name:'People',exact:true}).click();
  await page.getByRole('button',{name:'Meet Iara',exact:true}).click();
  await page.getByRole('button',{name:'Help build',exact:true}).click();
  assert((await page.locator('#person .response').textContent()).includes('No stage is ready'),'Refusals must be visible in the resident panel');
  await page.getByRole('button',{name:'Water & sanitation',exact:true}).click();
  assert((await page.locator('#person .response').textContent()).includes('Happy'));
  assert(await page.locator('#person .response').isVisible());
  assert(await page.getByRole('button',{name:'Resume time',exact:true}).isVisible());
  const requested=await page.evaluate(()=>window.solarDev.snapshot().residents.find(r=>r.id===0));
  assert.equal(requested.task,'water');assert(requested.requested,'A real click must assign the task');
  await capture('Accepted helping request with paused-time guidance','helping-request.png');
  assert(requested.help?.id);assert(['travelling','working'].includes(requested.help.phase));
  assert.equal(await page.locator('#person .help-phase').textContent(),'On the way');
  await page.locator('#dev-button').click();await page.locator('#dev-minutes').fill('120');await page.locator('#dev-advance').click();await page.locator('#dev-close').click();
  for(let minute=0;minute<60 && await page.locator('#person .help-phase').textContent()!=='Finished';minute++){
    await page.locator('#dev-button').click();await page.locator('#dev-minutes').fill('1');await page.locator('#dev-advance').click();await page.locator('#dev-close').click();
  }
  assert.equal(await page.locator('#person .help-phase').textContent(),'Finished');
  assert.equal(await page.evaluate(()=>window.solarDev.snapshot().residents.find(r=>r.id===0).help.id),requested.help.id);
  await capture('Helping request finishes through real resident work','helping-request-complete.png');
  await page.getByRole('button',{name:'Forage food',exact:true}).click();
  await page.getByRole('button',{name:'Cancel request',exact:true}).click();
  assert.equal(await page.locator('#person .help-phase').textContent(),'Cancelled');
  assert.equal(await page.evaluate(()=>window.solarDev.snapshot().residents.find(r=>r.id===0).help.phase),'cancelled');

  await page.getByRole('button',{name:'Close resident details',exact:true}).click();
  // Building interactions need the established village's solar farm and lamp.
  await page.locator('#dev-button').click();await page.locator('#dev-scenario').selectOption('village');await page.locator('#dev-load').click();
  await page.waitForFunction(()=>window.solarDev.scenario()==='village');await page.locator('#dev-close').click();
  await page.getByRole('button',{name:'Village',exact:true}).click();
  await page.getByRole('button',{name:'Buildings',exact:true}).click();
  await page.locator('#building-choice').selectOption('0');
  await page.locator('#building-neighbours [data-visitor="0"]').click();
  assert.equal(await page.evaluate(()=>window.solarDev.snapshot().residents.find(r=>r.id===0).task),'visit','Resident requests must not replace the building-visit handler');
  for(const name of ['Solar farm','Street light']) {
    const value=await page.locator('#building-choice option').filter({hasText:name}).first().getAttribute('value');
    await page.locator('#building-choice').selectOption(value);
    assert(!await page.locator('#building-visits').isVisible(),'Automatic utilities must not offer resident visits');
  }
  assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved);
  await page.locator('#dev-button').click();
  await page.locator('#dev-import-file').setInputFiles('artifacts/forecasts/project.json');
  await page.waitForFunction(()=>window.solarDev.snapshot().village.buildings.length===1&&window.solarDev.snapshot().village.buildings[0].kind==='garden');
  await page.locator('#dev-close').click();
  if(!await page.locator('#village-book').isVisible())await page.getByRole('button',{name:'Village',exact:true}).click();
  await page.getByRole('button',{name:'Construction',exact:true}).click();
  const forecastBefore=await page.evaluate(()=>JSON.stringify(window.solarDev.snapshot()));
  await page.getByRole('button',{name:'Forecast workweek',exact:true}).click();
  await page.locator('#project-forecast-status').filter({hasText:'Projected shared fund'}).waitFor({timeout:30000});
  assert((await page.locator('.project-forecast-result').textContent()).includes('If current plans hold'));
  assert.equal(await page.evaluate(()=>JSON.stringify(window.solarDev.snapshot())),forecastBefore,'Forecast controls never advance the live village');
  await capture('Conditional workweek forecast with unchanged live project','workweek-forecast.png');
  await page.locator('[data-project="0"][data-action="pause"]').click();
  assert((await page.locator('#project-forecast-status').textContent()).includes('Plans changed'));
  assert.equal(await page.locator('.project-forecast-result').count(),0,'A plan change removes old completion dates');
  await page.getByRole('button',{name:'Recalculate forecast',exact:true}).click();
  await page.locator('#project-forecast-status').filter({hasText:'Projected shared fund'}).waitFor({timeout:30000});
  assert((await page.locator('.project-forecast-result').textContent()).includes('paused'));
  assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved);
  await page.locator('#dev-button').click();
  await page.locator('#dev-import-file').setInputFiles('artifacts/forecasts/project.json');
  await page.waitForFunction(()=>!window.solarDev.snapshot().village.economy.projects[0].paused);
  await page.locator('#dev-close').click();
  await page.getByRole('button',{name:'Village',exact:true}).click();
  await page.getByRole('button',{name:'Construction',exact:true}).click();
  assert(await page.getByRole('button',{name:'Forecast workweek',exact:true}).isVisible());
  assert.equal(await page.locator('.project-forecast-result').count(),0,'Imported villages cannot inherit the previous scene forecast');
  // Production controls manage located batches through real player commands.
  async function showPreparation(){
    await page.locator('#dev-close').click();
    if(!await page.locator('#village-book').isVisible())await page.getByRole('button',{name:'Village',exact:true}).click();
    await page.getByRole('button',{name:'Construction',exact:true}).click();
    if(!await page.locator('#preparation-recipes').isVisible())await page.getByText('Preparing materials',{exact:true}).click();
  }
  await page.locator('#dev-button').click();
  await page.locator('#dev-import-file').setInputFiles('artifacts/production/start.json');
  await page.waitForFunction(()=>window.solarDev.snapshot().village.buildings[0]?.kind==='workshop');
  await showPreparation();
  await page.getByRole('spinbutton',{name:'Roof tiles reserve',exact:true}).fill('2');
  await page.getByRole('button',{name:'Set roof tiles reserve',exact:true}).click();
  let production=await page.evaluate(()=>window.solarDev.snapshot());
  assert.equal(production.village.production.targets[7],2);
  assert(production.village.production.batches.some(b=>b.material===7&&b.phase==='awaiting_inputs'));
  assert((await page.locator('.production-worksite').filter({hasText:'Workshop 1'}).textContent()).includes('Waiting for inputs'));
  await page.getByRole('spinbutton',{name:'Roof tiles reserve',exact:true}).fill('31');
  await page.getByRole('button',{name:'Set roof tiles reserve',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.solarDev.snapshot().village.production.targets[7]),2,'An invalid reserve leaves the native plan unchanged');
  await page.locator('#dev-button').click();
  await page.locator('#dev-import-file').setInputFiles('artifacts/production/working.json');
  await page.waitForFunction(()=>window.solarDev.snapshot().village.production.batches.some(b=>b.material===7&&b.work>0));
  await page.getByText('Production batches · 1 active',{exact:true}).click();
  assert((await page.locator('#dev-inspection').textContent()).includes('Committed inputs: 1 timber · 2 earth'));
  const diagnosticBefore=await page.evaluate(()=>JSON.stringify(window.solarDev.snapshot()));
  await capture('Located production identity and committed input diagnostics','production-diagnostics.png');
  assert.equal(await page.evaluate(()=>JSON.stringify(window.solarDev.snapshot())),diagnosticBefore,'Opening batch diagnostics never changes work or inventories');
  await showPreparation();
  production=await page.evaluate(()=>window.solarDev.snapshot());
  const roofBatch=production.village.production.batches.find(b=>b.material===7&&b.work>0),roofSite=roofBatch.site;
  const workshop=page.locator('.production-worksite').filter({hasText:'Workshop 1'});
  await page.getByRole('button',{name:'Pause Workshop 1',exact:true}).click();
  assert((await workshop.textContent()).includes('Worksite paused'));
  await page.locator('#dev-button').click();await page.locator('#dev-minutes').fill('10');await page.locator('#dev-advance').click();await page.locator('#dev-close').click();
  assert.equal(await page.evaluate(id=>window.solarDev.snapshot().village.production.batches.find(b=>b.id===id).work,roofBatch.id),roofBatch.work,'A paused worksite preserves partial labour');
  await capture('Paused preparation keeps committed inputs and partial labour','production-paused.png');
  await page.getByRole('button',{name:'Cancel batch at Workshop 1',exact:true}).click();
  const cancelledProduction=await page.evaluate(()=>window.solarDev.snapshot());
  assert.equal(cancelledProduction.village.production.batches.find(b=>b.id===roofBatch.id).phase,'cancelled');
  const recovered=cancelledProduction.village.logistics.stores.find(p=>p.owner.kind==='production'&&p.owner.id===roofSite);
  for(let i=0;i<roofBatch.inputs.length;i++)assert(recovered.items[i]>=roofBatch.inputs[i],'Cancelling returns committed inputs to the worksite');
  assert(await page.getByRole('button',{name:'Resume Workshop 1',exact:true}).isVisible());
  await page.getByRole('button',{name:'Resume Workshop 1',exact:true}).click();
  // The earned batch starts near midday. Honour the lunch break, outside
  // commitments and the next community window instead of assuming two hours.
  await page.locator('#dev-button').click();await page.locator('#dev-minutes').fill('1440');await page.locator('#dev-advance').click();await page.locator('#dev-close').click();
  production=await page.evaluate(()=>window.solarDev.snapshot());
  assert.equal(production.village.production.accounting.outputs[7],2,'Resumed station credits exactly one target batch');
  assert.equal(production.environment.economy.materials[7].stored,2);
  assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved);
  await capture('Finished workshop preparation and bounded village reserve','production-finished.png');
  await page.getByRole('button',{name:'Buildings',exact:true}).click();
  await page.locator('#building-choice').selectOption('0');
  await page.locator('[data-building-work="demolish"]').click();
  await page.locator('#building-work-confirm').click();
  await page.getByRole('button',{name:'Construction',exact:true}).click();
  assert((await workshop.textContent()).includes('Closed while residents change this building'));
  assert(!await page.getByRole('button',{name:'Pause Workshop 1',exact:true}).isEnabled(),'Closing an idle workshop updates its operating controls immediately');
  await checkToolControls({page,saved,capture});
  await checkFoodControls({page,saved,capture});
  await checkKitchenControls({page,saved,capture});
  await checkWorkshopPowerControls({page,saved,capture});
  await checkElectricalControls({page,saved,capture});
  await checkBatteryControls({page,saved,capture});
  await checkGatheringControls({page,saved,capture});
  await checkFreshnessControls({page,saved,capture});
  await checkProcessControls({page,saved,capture});
  await checkOrganicControls({page,saved,capture});
  await page.locator('#dev-button').click();
  for(const [id,expected] of [['autonomy',null],['hungry','gather'],['harvest','garden'],['cook',null],['coop',null],['night',null],['power-outage',null],['rain',null],['after-rain',null],['dry-afternoon',null],['arrival',null],['village',null],['circular',null],['circular-night',null],['art',null],['art-night',null]]) {
    await page.locator('#dev-scenario').selectOption(id);await page.locator('#dev-load').click();
    await page.waitForFunction(id=>window.solarDev.scenario()===id,id);
    await page.getByRole('button',{name:'Single tick · ¼ second',exact:true}).click();
    const state=await page.evaluate(()=>window.solarDev.snapshot());
    if(expected)assert(state.residents.some(r=>r.task===expected),`${id}: expected ${expected}`);
    if(id==='autonomy'){
      assert.deepEqual(state.residents.map(r=>r.task),['rest','eat','socialize','garden','outside']);
      assert.match(state.residents[3].reason,/dry fruit trees/,'Existing dry fruit trees receive care before expansion');
    }
    if(id==='cook')assert.equal(state.village.situations.active.resident,2);
    if(id==='night')assert.equal(state.village.minutes % 1440,1260.75);
    if(id==='coop')assert.equal(state.village.supplies.eggs,3);
    if(['night','circular-night','art-night','power-outage'].includes(id)){
      assert(state.village.pipes.lines.some(p=>p.plan.kind==='electricity'&&p.phase==='active'),'Night scenes contain real installed cables');
      const lights=state.environment.power.connections.filter(c=>c.source==='grid'&&c.enabled);
      assert(lights.length>0&&lights.every(c=>c.connected),'Preview lights belong to connected circuits');
      assert(lights.every(c=>id==='power-outage'?c.light_level===0:c.light_level>.99),'Empty circuits leave shared lamps off; charged previews illuminate them');
    }
    if(id==='art'||id==='art-night'){
      const rendered=await page.evaluate(async()=>{const {allBuildingArt,buildingArtKey}=await import('./building-art.js?v=night-1');const s=window.solarDev.snapshot();return {expected:Object.keys(allBuildingArt).sort(),actual:s.village.buildings.map(b=>buildingArtKey(b,s.village.buildings,s.village.economy.projects)).sort()};});
      assert.deepEqual(rendered.actual,rendered.expected,'All building artwork must be present through the actual Dev Tools launcher');
    }
    assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved);
    await page.evaluate(()=>window.solarDev.fixedView());
    await page.locator('#dev-close').click();
    if(['rain','after-rain','dry-afternoon'].includes(id)) {
      assert.equal(await page.locator('#world').getAttribute('data-weather'),{rain:'rain','after-rain':'after-rain','dry-afternoon':'dry'}[id]);
      assert.equal(state.environment.raining,id==='rain');
      if(id==='after-rain')assert((await page.locator('.season small').textContent()).includes('After the rain'));
    }
    await capture(`Fixed scenario: ${id}`,`scenario-${id}.png`);
    if(id==='autonomy'){
      await page.getByRole('button',{name:'People',exact:true}).click();
      assert(await page.locator('#community-panel').isVisible());
      await capture('Residents follow their own needs and village commitments','autonomy-residents.png');
      await page.getByRole('button',{name:'Close community',exact:true}).click();
    }

    if(id==='rain') {
      const before=await page.locator('#world').evaluate(el=>el.toDataURL());
      await page.waitForTimeout(120);
      assert.equal(await page.locator('#world').evaluate(el=>el.toDataURL()),before,'Paused rainfall must stay fixed');
      await page.emulateMedia({reducedMotion:'reduce'});
      await capture('Rain with reduced motion: cloud cover and wet ground','weather-reduced-motion.png');
      assert.equal(await page.locator('#world').getAttribute('data-weather'),'rain');
      await page.emulateMedia({reducedMotion:'no-preference'});
    }
    await page.locator('#dev-button').click();
  }
  // Simulator foundations are observed through the actual scenario controls.
  await page.locator('#dev-scenario').selectOption('sim-compact');await page.locator('#dev-load').click();
  await page.locator('#dev-minutes').fill('60');await page.locator('#dev-advance').click();
  assert((await page.locator('#dev-inspection').textContent()).includes('60.0 game minutes observed'));
  const observed=await page.evaluate(()=>window.solarDev.snapshot());
  const latest=observed.village.simulation.days.at(-1);
  for(const times of latest.residents)assert(Math.abs(times.reduce((sum,n)=>sum+n,0)-60)<.001);
  const inspectionBefore=JSON.stringify(observed);
  await page.locator('#dev-inspect').click();
  assert.equal(JSON.stringify(await page.evaluate(()=>window.solarDev.snapshot())),inspectionBefore,'Inspection cannot advance or edit the world');
  await page.locator('#dev-inspection details summary').filter({hasText:'Material accounting · seed'}).click();
  const balances=await page.locator('#dev-inspection details tbody tr td:last-child').allTextContents();
  assert.equal(balances.length,29);assert(balances.every(text=>text==='0'));
  await capture('Observed resident time and reconciled material accounts','simulation-accounting.png');
  // A storage target queues resident trips instead of moving material instantly.
  await page.locator('#dev-close').click();await page.locator('[data-hud-resource="materials"]').click();
  const stockBeforeHaul=await page.evaluate(()=>window.solarDev.snapshot().environment.economy.materials[0].stored);
  await page.getByLabel('Reserve quantity for storage house 3',{exact:true}).fill('24');
  await page.getByRole('button',{name:'Set reserve',exact:true}).click();
  let located=await page.evaluate(()=>window.solarDev.snapshot());
  assert.equal(located.village.logistics.stores.find(p=>p.owner.kind==='warehouse').items[0],0);
  await page.getByRole('button',{name:'Close supplies',exact:true}).click();await page.locator('#dev-button').click();
  await page.locator('#dev-minutes').fill('120');await page.locator('#dev-advance').click();
  located=await page.evaluate(()=>window.solarDev.snapshot());
  assert.equal(located.village.logistics.stores.find(p=>p.owner.kind==='warehouse').items[0],24);
  assert.equal(located.environment.economy.materials[0].stored,stockBeforeHaul);
  await page.locator('#dev-close').click();await page.locator('[data-hud-resource="materials"]').click();
  await page.locator('#storage-locations').scrollIntoViewIfNeeded();
  await capture('Located storage after two resident deliveries','physical-storage.png');
  await page.getByRole('button',{name:'Close supplies',exact:true}).click();await page.locator('#dev-button').click();
  // Preferences go through the resident panel and remain in native state.
  await page.locator('#dev-close').click();
  await page.locator('[data-citizen="0"]').click();
  await page.locator('#person .work-preferences summary').click();
  await page.getByLabel('Iara: Hauling preference',{exact:true}).selectOption('2');
  await page.getByLabel('Iara: Materials preference',{exact:true}).selectOption('0');
  const workPreferences=await page.evaluate(()=>window.solarDev.snapshot().village.workforce.preferences[0]);
  assert.deepEqual(workPreferences,[1,2,1,0,1]);
  assert((await page.locator('.work-preference-response').textContent()).includes('next chore'));
  await capture('Resident work preferences in the village','resident-work.png');
  await page.getByRole('button',{name:'Close resident details',exact:true}).click();
  await page.locator('#dev-button').click();
  // Circular infrastructure uses actual player controls and real simulation time.
  await page.locator('#dev-scenario').selectOption('circular');await page.locator('#dev-load').click();await page.locator('#dev-close').click();
  await page.locator('#open-village').click();await page.getByRole('button',{name:'Supplies',exact:true}).click();await page.getByRole('tab',{name:'Ecology',exact:true}).click();
  assert.match(await page.locator('#digester-status').textContent(),/Waiting.*scraps delivered/);
  assert((await page.locator('#wetland-status').textContent()).includes('Ready to filter'));
  for(const control of ['auto-digest','filter-greywater','use-biogas'])await page.locator('#'+control).uncheck();
  let circular=await page.evaluate(()=>window.solarDev.snapshot());
  assert(!circular.village.circular.auto_feed&&!circular.village.circular.filter_water&&!circular.village.circular.use_biogas);
  assert((await page.locator('#digester-status').textContent()).includes('paused'));
  for(const control of ['auto-digest','filter-greywater','use-biogas'])await page.locator('#'+control).check();
  await page.locator('#dev-button').click();await page.locator('#dev-minutes').fill('240');await page.locator('#dev-advance').click();await page.locator('#dev-close').click();
  circular=await page.evaluate(()=>window.solarDev.snapshot());
  // Eating includes its real trip; daily care can follow lunch rather than finish within four hours.
  for(let slot=0;slot<16&&circular.village.circular.toilet_visits<5;slot++){
    await page.locator('#dev-button').click();await page.locator('#dev-minutes').fill('15');await page.locator('#dev-advance').click();await page.locator('#dev-close').click();
    circular=await page.evaluate(()=>window.solarDev.snapshot());
  }
  assert.equal(circular.village.circular.toilet_visits,5);assert.equal(circular.environment.economy.capacity,900);
  assert((await page.locator('#toilet-status').textContent()).includes('5 daily visits'));
  // Processing starts only after neighbours deliver scraps to this digester.
  for(let hour=0;hour<24&&!circular.village.circular.digestion&&!circular.village.circular.batches;hour++){
    await page.locator('#dev-button').click();await page.locator('#dev-minutes').fill('60');await page.locator('#dev-advance').click();await page.locator('#dev-close').click();circular=await page.evaluate(()=>window.solarDev.snapshot());
  }
  assert(circular.village.circular.digestion>0||circular.village.circular.batches>0);
  await capture('Resident routines and locally supplied water and waste processing','circular-controls.png');
  if(circular.village.circular.digestion>0){await page.locator('#dev-button').click();await page.locator('#dev-minutes').fill(String(Math.ceil(circular.village.circular.digestion)+1));await page.locator('#dev-advance').click();await page.locator('#dev-close').click();}
  circular=await page.evaluate(()=>window.solarDev.snapshot());
  assert(circular.village.circular.biogas>0&&circular.village.circular.water_reused>=8);
  assert((await page.locator('#digester-status').textContent()).includes('curing'));
  await page.locator('#dev-button').click();await page.locator('#dev-scenario').selectOption('banana');await page.locator('#dev-load').click();await page.locator('#dev-close').click();
  await page.locator('#open-village').click();await page.getByRole('button',{name:'Supplies',exact:true}).click();await page.getByRole('tab',{name:'Ecology',exact:true}).click();
  await page.locator('#banana-treatment').uncheck();
  assert((await page.locator('#banana-status').textContent()).includes('paused'));
  await page.locator('#dev-button').click();await page.locator('#dev-minutes').fill('120');await page.locator('#dev-advance').click();await page.locator('#dev-close').click();
  assert.equal((await page.evaluate(()=>window.solarDev.snapshot())).village.circular.waste_treated,0);
  await page.locator('#banana-treatment').check();
  await page.locator('#dev-button').click();await page.locator('#dev-minutes').fill('120');await page.locator('#dev-advance').click();await page.locator('#dev-close').click();
  assert(Math.abs((await page.evaluate(()=>window.solarDev.snapshot())).village.circular.waste_treated-.5)<.001);
  assert((await page.locator('#banana-status').textContent()).includes('0.5 treated'));
  await capture('Banana bed treatment and player pause control','banana-treatment.png');
  await page.locator('#dev-button').click();await page.locator('#dev-scenario').selectOption('circular-night');await page.locator('#dev-load').click();await page.locator('#dev-close').click();
  await page.locator('#open-village').click();await page.getByRole('button',{name:'Power',exact:true}).click();
  assert((await page.locator('#power-generation').textContent()).includes('river 1.8'));
  await page.locator('[data-power-building="9"]').uncheck();
  assert((await page.evaluate(()=>window.solarDev.snapshot())).village.power.disabled.includes(9));
  await page.locator('[data-power-building="9"]').check();
  await page.getByRole('button',{name:'Close power',exact:true}).click();
  await page.getByRole('button',{name:'Build',exact:true}).click();
  await page.locator('[data-build-group="village"]').click();
  await page.locator('#home-material-method').selectOption('adobe');
  assert((await page.locator('[data-kind="home"]').textContent()).includes('Adobe'));
  await page.locator('[data-kind="home"]').click();
  // Empty plot, away from the fixture buildings; resolve through the same view as the world.
  await page.evaluate(()=>window.solarDev.fixedView());
  const plot=await page.evaluate(async()=>{const {project}=await import('./projection.js');const r=document.querySelector('#world').getBoundingClientRect();const scale=Math.max(.45,Math.min(r.width/1900,r.height/1050));const p=project(5,5,{x:r.width*.49,y:r.height*.5-459*scale},scale);return {x:p.x+r.left,y:p.y+r.top};});
  await page.mouse.click(plot.x,plot.y);
  circular=await page.evaluate(()=>window.solarDev.snapshot());
  const project=circular.village.economy.projects.at(-1);
  assert.equal(project.recipe,'adobe');assert(project.appearance>=4);
  assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved);
  await page.locator('#dev-button').click();
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
  assert(work.residents.slice(0,2).every(r=>r.trip?.purpose==='work'&&r.trip.phase==='away'));
  assert(work.residents.slice(2).every(r=>!r.trip));assert.equal(work.village.economy.money,occupationFunds);
  await page.locator('#dev-close').click();await page.locator('[data-citizen="0"]').click();
  assert((await page.locator('#person .person-activity').textContent()).includes('Plant nursery assistant'));
  await capture('Iara at her individual outside occupation','resident-occupation.png');
  await page.locator('#person .occupation-toggle').uncheck();
  await page.locator('#dev-button').click();await page.locator('#dev-minutes').fill('391');await page.locator('#dev-advance').click();
  work=await page.evaluate(()=>window.solarDev.snapshot());
  assert.equal(work.village.economy.money,occupationFunds+40000);
  assert.deepEqual(work.village.economy.outside_jobs,[false,true,false,false,false]);
  assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved);
  await page.locator('#dev-scenario').selectOption('cook');await page.locator('#dev-load').click();
  await page.waitForFunction(()=>window.solarDev.scenario()==='cook');
  await page.getByRole('button',{name:'Single tick · ¼ second',exact:true}).click();
  await page.locator('#dev-resident').selectOption('2');
  await capture('Simulation workbench and resident diagnostics','simulation.png');
  const before=await page.evaluate(()=>window.solarDev.snapshot().village.minutes);
  await page.getByRole('button',{name:'+1 game hour',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.solarDev.snapshot().village.minutes),before+60);
  // Exercise autosave and page lifecycle paths while sandbox is active.
  await page.evaluate(()=>{window.dispatchEvent(new Event('pagehide'));document.dispatchEvent(new Event('visibilitychange'));});
  assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved);
  const runStart=await page.evaluate(()=>window.solarDev.snapshot().village.minutes);
  await page.locator('#dev-run').click();
  // Autosave uses wall time. Rendering throughput must not decide whether this check passes.
  await page.waitForFunction(()=>!document.querySelector('dialog[open]') && document.querySelector('#pause').getAttribute('aria-label')==='Pause simulation');
  const wallStart=await page.evaluate(()=>performance.now());
  await page.waitForFunction(start=>performance.now()>start+16000,wallStart,{timeout:45000,polling:250});
  assert(await page.evaluate(start=>window.solarDev.snapshot().village.minutes>start,runStart),'Running the scene must advance its clock');
  assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved,'timed autosave must skip sandbox');
  await page.locator('#dev-button').click();
  await page.getByRole('button',{name:'Return to village',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>window.solarDev.snapshot()),original);
  assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved);
  await page.locator('[data-dev-tab="checks"]').click();
  const download=page.waitForEvent('download');await page.locator('#dev-bundle').click();
  const diagnostic=await download;await diagnostic.saveAs(path.join(output,'diagnostic.json'));
  await checkSceneExport({page,output});
  screenshots.push({label:'Game canvas exported through its own capture control',file:'native-scene.png'});
  assert(JSON.parse(await readFile(path.join(output,'diagnostic.json'),'utf8')).diagnostics.residents.length===5);
  await page.locator('#dev-close').click();
  await page.evaluate(()=>window.solarDev.loadScenario('village'));
  await page.evaluate(()=>window.solarDev.fixedView());
  await capture('Fixed desktop village','village.png');
  await page.setViewportSize({width:1280,height:800});
  await capture('Game HUD at 1280 × 800','game-hud-1280.png');
  await page.getByRole('button',{name:'Dev Tools',exact:true}).first().click();
  await capture('Dev Tools at 1280 × 800','dev-tools-1280.png');
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('[data-dev-tab="art"]').click();
  const studioPromise=context.waitForEvent('page');
  await page.getByRole('link',{name:/Calibration bench/}).click();
  page=await studioPromise;
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(()=>document.querySelector('#cal-width')?.value && [...document.images].every(i=>i.complete));
  await page.getByRole('button',{name:'Editing bench',exact:true}).click();
  await page.locator('#workbench-sprite').selectOption('coop');
  await page.locator('#cal-width').fill('110');
  await page.locator('#anchor-canvas').scrollIntoViewIfNeeded();
  const anchorBox=await page.locator('#anchor-canvas').boundingBox();
  await page.mouse.move(anchorBox.x+anchorBox.width/2,anchorBox.y+20+280*.76);
  await page.mouse.down();await page.mouse.move(anchorBox.x+anchorBox.width/2,anchorBox.y+20+280*.8);await page.mouse.up();
  assert.equal(Number(await page.locator('#cal-anchor').inputValue()),.8);
  const configDownload=page.waitForEvent('download');await page.locator('#cal-export').click();
  await (await configDownload).saveAs(path.join(output,'calibration.json'));
  assert.equal(JSON.parse(await readFile(path.join(output,'calibration.json'),'utf8')).width,110);
  const popupPromise=context.waitForEvent('page');await page.locator('#cal-preview').click();
  const preview=await popupPromise;await preview.waitForFunction(()=>window.solarDev);
  assert((await preview.locator('.artwork-preview-notice').textContent()).includes('ART DRAFT'));
  const expectedVariants=await preview.evaluate(async()=>Object.keys((await import('./building-art.js?v=night-1')).allBuildingArt).length);
  assert.equal(await preview.evaluate(()=>window.solarDev.snapshot().village.buildings.length),expectedVariants,'Draft previews must include all buildings and skins');
  const calibrated=await preview.evaluate(async()=>{const {buildingArt}=await import('./building-art.js?v=night-1');return buildingArt.coop.width;});assert.equal(calibrated,110);
  await preview.close();
  const nightGallery=await context.newPage();await nightGallery.goto(new URL('/?night-preview',base).href);await nightGallery.waitForFunction(()=>window.solarDev);
  assert((await nightGallery.locator('.artwork-preview-notice').textContent()).includes(`${expectedVariants} building variants`));
  assert.equal(await nightGallery.evaluate(()=>window.solarDev.snapshot().village.minutes%1440),1260);
  assert.equal(await nightGallery.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved);
  await nightGallery.close();
  await capture('Artwork calibration with shared game scale','calibration.png');
  await page.locator('[data-art-tab="replacement"]').click();
  await page.locator('#replacement-file').setInputFiles('web/art/coop-isometric.png');
  await page.waitForFunction(()=>document.querySelector('#replacement-report').textContent.includes('100.0%'));
  assert((await page.locator('#replacement-report').textContent()).includes('dimensions match'));
  await capture('Replacement review with identical source control','replacement.png');
  const candidatePromise=context.waitForEvent('page');await page.locator('#replacement-preview').click();
  const candidatePreview=await candidatePromise;await candidatePreview.waitForFunction(()=>window.solarDev);
  assert((await candidatePreview.locator('.artwork-preview-notice').textContent()).includes('ART DRAFT'));
  assert.equal(await candidatePreview.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved);
  await candidatePreview.close();
  await page.locator('#replacement-mode').selectOption('overlay');
  await page.locator('#replacement-light').focus();await page.keyboard.press('Home');
  for(let i=0;i<10;i++)await page.keyboard.press('ArrowRight');
  await capture('Replacement silhouette overlay at dusk','replacement-dusk.png');
  await page.locator('#workbench-sprite').selectOption('iara');
  await page.locator('#replacement-file').setInputFiles('web/art/animations/iara.png');
  await page.waitForFunction(()=>document.querySelector('#replacement-report').textContent.includes('100.0%'));
  await page.locator('#replacement-row').selectOption('3');await page.locator('#replacement-frame').focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');
  await page.locator('#workbench-sprite').selectOption('coop');
  await page.locator('[data-art-tab="recipe"]').click();
  await page.locator('#recipe-note').fill('Browser check: original coop reference reviewed.');
  await page.locator('#recipe-save').click();
  await page.waitForFunction(()=>document.querySelector('#recipe-history').textContent.includes('Browser check:'));
  await page.reload();
  await page.locator('#workbench-sprite').selectOption('coop');await page.locator('[data-art-tab="recipe"]').click();
  assert((await page.locator('#recipe-history').textContent()).includes('Browser check:'));
  await capture('Recipe cards with saved revision history','recipes.png');
  await page.goto(new URL('/artwork/grid-fit.html',base).href);
  await page.waitForFunction(count=>document.querySelector('#status').textContent.startsWith(`${count} variants`),expectedVariants);
  assert.equal(await page.locator('#cards figure').count(),expectedVariants);
  await capture('All painted building sprites on their actual grid cells','sprite-grid-day.png');
  await page.locator('#lighting').selectOption('night');
  await capture('Shared full-sprite grid fit at night','sprite-grid-night.png');
  assert.deepEqual(errors,[],'Browser errors must be resolved');
  await context.close();
  await checkClimateSandboxSave({browser,base,output,screenshots,errors});
  await checkMaintenanceSandboxSave({browser,base,output,screenshots,errors});
  await checkSkillSandboxSave({browser,base,output,screenshots,errors});
  await checkSupplierSandboxSave({browser,base,output,screenshots,errors});
  await checkSandboxRules({browser,base,output,screenshots,errors});
  await checkArtworkInterface({browser,base,output,screenshots,errors});
  assert.deepEqual(errors,[],'The Sandbox seasonal setting must have no browser errors');
}

export async function checkSceneExport({page,output}) {
  const before=await page.evaluate(()=>JSON.stringify(window.solarDev.snapshot()));
  const pending=page.waitForEvent('download');
  await page.locator('#dev-capture').click();
  const download=await pending;assert.equal(download.suggestedFilename(),'solar-friends-scene.png');
  const file=path.join(output,'native-scene.png');await download.saveAs(file);
  const bytes=await readFile(file),size=await page.locator('#world').evaluate(el=>[el.width,el.height]);
  assert.deepEqual(bytes.subarray(0,8),Buffer.from([137,80,78,71,13,10,26,10]),'The capture is a real PNG');
  assert.deepEqual([bytes.readUInt32BE(16),bytes.readUInt32BE(20)],size,'Export the full game canvas at its real resolution');
  assert.equal(await page.evaluate(()=>JSON.stringify(window.solarDev.snapshot())),before,'Capturing never advances or changes the village');
  console.log('PASS: native scene PNG download, full canvas dimensions and unchanged village state.');
}
