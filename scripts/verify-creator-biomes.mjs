import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const server=await serve(),base=`http://127.0.0.1:${server.address().port}`;let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const id of ['mata-atlantica','cerrado','caatinga']){
  await page.goto(base+'/editor.html');await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
  await page.locator(`[data-biome="${id}"]`).click();assert.equal(await page.locator(`[data-biome="${id}"]`).getAttribute('aria-pressed'),'true');
  await page.locator('[data-preset=camp]').click();await page.waitForFunction(()=>!document.querySelector('#creator-test').disabled&&document.querySelector('#creator-save-status').textContent.startsWith('Saved'));
  const project=new URL(page.url()).searchParams.get('project');
  const d=await page.evaluate(async id=>{const {ContentLibrary}=await import('/content-library.js');const l=new ContentLibrary();try{return (await l.getProject(id)).checkpoint.definition;}finally{l.close();}},project);
  assert.equal(d.map.biome.id,id);assert.equal(d.map.biome.version,1);assert.equal(d.map.terrain.length,4096);
  await page.locator('#creator-grid').uncheck();
  // Place each regional species through ordinary authoring controls for scale review.
  const species=id==='cerrado'?['pequi','barbatimao','cerrado-bunchgrass','campo-shrub']:id==='caatinga'?['umbuzeiro','jurema-preta','mandacaru','macambira']:[];
  await page.locator('#creator-brush-size').selectOption('1');
  for(const [index,key]of species.entries()){
   await page.locator('#creator-species').selectOption(key);await page.locator('[data-tool=nature]').click();
   const x=28+index*2,y=35;
   const p=await page.locator('#creator-map').evaluate((canvas,[x,y])=>{const o=JSON.parse(canvas.dataset.origin),s=Number(canvas.dataset.scale),r=canvas.getBoundingClientRect();return {x:r.left+o.x+(x-y)*34*s,y:r.top+o.y+(x+y)*17*s};},[x,y]);
   await page.mouse.click(p.x,p.y);
  }
  await page.locator('[data-tool=select]').click();await page.locator('#creator-save').click();await page.screenshot({path:`/private/tmp/solar-biome-${id}-editor.png`});
  await page.locator('#creator-test').click();await page.waitForFunction(()=>window.solarDev&&document.querySelector('.creation-session'));
  const snapshot=await page.evaluate(()=>window.solarDev.snapshot());assert.equal(snapshot.village.scenario.definition.map.biome.id,id);assert.equal(snapshot.environment.weather.profile.intro_days,0);assert.equal(snapshot.environment.weather.season_days,id==='caatinga'?28:21);
  for(const key of species)assert(snapshot.village.scenario.definition.map.nature.some(p=>p.species===key));
  await page.screenshot({path:`/private/tmp/solar-biome-${id}-game.png`});
  await page.getByRole('button',{name:'Return to editor',exact:true}).click();await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
  assert.equal(new URL(page.url()).searchParams.get('project'),project);
  if(species.length){
   const night=structuredClone(d);night.title+=' · night review';night.start.minutes=1260;
   await page.locator('#creator-library').click();await page.locator('#creator-import').setInputFiles({name:'night.solar-scenario',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(night))});
   await page.waitForFunction(()=>!document.querySelector('#creator-test').disabled&&document.querySelector('#creator-save-status').textContent.startsWith('Saved'));
   await page.locator('#creator-test').click();await page.waitForFunction(()=>window.solarDev&&document.querySelector('.creation-session'));
   assert.equal(await page.evaluate(()=>window.solarDev.snapshot().village.minutes),1260);
   await page.screenshot({path:`/private/tmp/solar-biome-${id}-night.png`});
   await page.getByRole('button',{name:'Return to editor',exact:true}).click();await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
  }
 }
 assert.deepEqual(errors,[]);console.log('PASS all three player-selected biomes → frozen saved maps → regional planting → native playtest weather → editor return, without browser errors.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
