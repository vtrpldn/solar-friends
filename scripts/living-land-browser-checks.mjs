import assert from 'node:assert/strict';
export async function checkLivingLandControls({page,saved,capture}){
  const state=()=>page.evaluate(()=>window.solarDev.snapshot());
  async function load(file){
    if(!await page.locator('#dev-dialog').isVisible())await page.locator('#dev-button').click();
    await page.locator('#dev-import-file').setInputFiles(`artifacts/living-land/${file}.json`);
    await page.waitForFunction(file=>{const v=window.solarDev.snapshot().village;return v.version===36&&(file==='ground-before'?v.minutes===540&&v.land.soil.length===0:file==='disturbed-clearing'?v.land.soil.length===15&&v.land.soil.some(s=>s.disturbance>.7):file==='restored-clearing'?v.restoration.length===3&&v.restoration.every(j=>j.finished!=null):file==='banana-shade'?v.buildings.some(b=>b.kind==='banana_treatment'):file==='cleared-tree'?v.land.vegetation.some(t=>t.cleared):v.minutes===480&&v.land.soil.length===0);},file);
    await page.locator('#dev-close').click();await page.evaluate(()=>window.solarDev.fixedView());
  }
  async function point(x,y){const p=await page.evaluate(async([x,y])=>{const {project}=await import('./projection.js');const b=document.querySelector('#world').getBoundingClientRect(),s=Math.max(.45,Math.min(b.width/1900,b.height/1050)),p=project(x,y,{x:b.width*.49,y:b.height*.5-459*s},s);return{x:b.left+p.x,y:b.top+p.y};},[x,y]);await page.mouse.click(p.x,p.y);}
  await load('ground-before');assert(!await page.locator('#land-map').isVisible());const before=await page.locator('#world').screenshot();
  await load('disturbed-clearing');assert.equal(await page.locator('#world').getAttribute('data-soil-cells'),'15');
  const after=await page.locator('#world').screenshot();assert(!before.equals(after),'Persistent soil changes must visibly affect normal terrain without an overlay');
  await capture('Removed roads leave soft soil marks beneath the original meadow texture','living-ground.png');
  const inspection=JSON.stringify(await state());await page.getByRole('button',{name:'Land views',exact:true}).click();await page.getByLabel('Land view',{exact:true}).selectOption('disturbance');await point(16,16);
  assert.match(await page.locator('#land-hover').textContent(),/disturbance 72%/);assert.match(await page.locator('#land-legend').textContent(),/road building or extraction/);assert(await page.getByRole('button',{name:'Restore ground · 2 compost',exact:true}).isEnabled());
  await capture('The same normal-view soil marks expose actual disturbance and a recovery action','living-ground-inspection.png');
  await page.getByRole('button',{name:'Close land views',exact:true}).click();assert.equal(JSON.stringify(await state()),inspection,'Reading soil and tree views cannot change the world');
  await load('restored-clearing');const restored=await state();assert(restored.village.land.soil.some(s=>s.nutrients>1&&s.disturbance<.4));assert(restored.village.restoration.every(j=>!j.cancelled));
  await capture('Resident restoration retains its soil improvement in the normal game view','living-ground-restored.png');
  await load('standing-trees');const count=Number(await page.locator('#world').getAttribute('data-forest-count'));assert.equal(count,(await state()).village.land.vegetation.filter(t=>!t.cleared).length);
  await load('cleared-tree');assert(Number(await page.locator('#world').getAttribute('data-forest-count'))<count,'Actual clearing removes the same standing tree from rendering');
  await load('banana-shade');await page.getByRole('button',{name:'Land views',exact:true}).click();await page.getByLabel('Land view',{exact:true}).selectOption('shade');await point(18,18);
  const text=await page.locator('#land-hover').textContent();assert(!text.includes('tree shade 0%'));assert.match(await page.locator('#land-legend').textContent(),/woodland trees.*banana beds/);assert((await state()).environment.power.solar_generation<6);
  await capture('Standing banana vegetation contributes to the same shade and solar model','living-banana-shade.png');
  await page.getByRole('button',{name:'Close land views',exact:true}).click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved);await page.locator('#dev-button').click();
}
