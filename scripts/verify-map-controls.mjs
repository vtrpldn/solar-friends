import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {chromium} from 'playwright';import {serve} from './serve.mjs';
import init,{Game} from '../web/pkg/solar_friends.js';
import {checkSharedMap,prepareSharedMap} from '../web/editor/map-sharing.js';
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/editor.html`);await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
 const download=async button=>{const pending=page.waitForEvent('download');await button.click();return JSON.parse(await readFile(await (await pending).path(),'utf8'));};
 const saveMap=async(title,author)=>{await page.locator('#creator-save-map').click();await page.locator('#creator-map-title').fill(title);await page.locator('#creator-map-description').fill('Land ready for another community');await page.locator('#creator-map-author').fill(author);await page.screenshot({path:'/private/tmp/solar-map-save.png'});await page.locator('#creator-map-save-confirm').click();await page.locator('#creator-library-dialog').waitFor({state:'visible'});};
 const files=[];
 for(const [i,biome]of ['mata-atlantica','cerrado','caatinga'].entries()){
  if(i){await page.locator('#creator-library').click();await page.locator('#creator-library-dialog').waitFor({state:'visible'});if(!(await page.locator('#creator-new-options').evaluate(e=>e.open)))await page.locator('#creator-new-options > summary').click();}
  await page.locator(`[data-biome="${biome}"]`).click();await page.locator('[data-preset=camp]').click();
  if(i===0){await page.locator('[data-workspace=village]').click();await page.locator('#creator-funds').fill('-1');await page.locator('#creator-funds').press('Tab');assert(await page.locator('#creator-test').isDisabled());}
  await saveMap('Property '+biome,'João <autor>');const row=page.locator('[data-map]').filter({hasText:'Property '+biome});await row.locator('.creator-preview img').waitFor();const id=await row.getAttribute('data-map'),file=await download(row.locator('[data-export-map]'));files.push(file);assert.equal(file.format,'solar-friends-map');assert.equal(file.map.biome.id,biome);assert.equal(file.map.terrain.length,4096);assert.equal(file.start,undefined);assert.equal(file.definition,undefined);assert.equal(file.author,'João <autor>');assert.equal(await row.locator('autor').count(),0);
  if(i===0){await page.locator('#creator-library-close').click();await page.locator('[data-workspace=land]').click();await page.locator('#creator-river-enabled').uncheck();await saveMap('Second map version','Another author');const second=page.locator('[data-map]').filter({hasText:'Second map version'});assert.equal((await download(second.locator('[data-export-map]'))).content_revision,2);assert.deepEqual(await download(page.locator(`[data-map="${id}"] [data-export-map]`)),file);}
  let reuseRow=row;
  if(i===0){
    const source=page.locator(`[data-map="${id}"]`),name=page.locator('#creator-map-name');
    await source.locator('[data-rename-map]').click();
    await name.fill('   ');
    await name.press('Enter');
    await page.locator('#creator-map-name-status').getByText(/Enter a map name/).waitFor();
    await name.fill('Land for the next village');
    await page.screenshot({path:'/private/tmp/solar-map-rename.png'});
    await name.press('Enter');
    await source.getByText('Land for the next village',{exact:true}).waitFor();
    assert.deepEqual(await download(source.locator('[data-export-map]')),file);
    await source.locator('[data-copy-map]').click();
    await name.waitFor();
    assert.equal(await name.inputValue(),'Land for the next village · copy');
    await name.press('Escape');
    await page.locator('#creator-map-name-dialog').waitFor({state:'hidden'});
    assert.equal(await page.locator('[data-map]').count(),2);
    await source.locator('[data-copy-map]').click();
    await name.fill('Independent library copy');
    await name.press('Enter');
    reuseRow=page.locator('[data-map]').filter({hasText:'Independent library copy'});
    await reuseRow.waitFor();
    assert.notEqual(await reuseRow.getAttribute('data-map'),id);
    assert.deepEqual(await download(reuseRow.locator('[data-export-map]')),file);
    await page.reload();
    await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
    await page.locator('#creator-library').click();
    await source.getByText('Land for the next village',{exact:true}).waitFor();
    await reuseRow.waitFor();
    const conflicts=await page.evaluate(async id=>{
      const {ContentLibrary}=await import('/content-library.js'),library=new ContentLibrary();
      try{
        const current=await library.getMap(id),outcomes=[];
        for(const action of ['renameMap','copyMap']){
          try{await library[action](id,current.revision-1,'Stale edit');}
          catch(error){outcomes.push(error.name);}
        }
        return outcomes;
      }finally{library.close();}
    },id);
    assert.deepEqual(conflicts,['LibraryConflict','LibraryConflict']);
  }
  await page.locator('#creator-library-kind').selectOption('map');await page.locator('#creator-library-search').fill('JOAO');assert(await reuseRow.isVisible());await page.screenshot({path:'/private/tmp/solar-map-library.png'});await reuseRow.locator('[data-use-map]').click();await page.locator('#creator-library-dialog').waitFor({state:'hidden'});await page.waitForFunction(()=>document.querySelector('#creator-save-status').textContent.startsWith('Saved'));
  const draft=await download(page.locator('#creator-export'));const actual=structuredClone(draft.map),expected=structuredClone(file.map);delete actual.id;delete actual.revision;delete expected.id;delete expected.revision;assert.deepEqual(actual,expected);assert.deepEqual(draft.rules.weather,file.weather);assert.equal(draft.start.buildings.length,0);assert.equal(draft.start.roads.length,0);assert.equal(draft.start.residents.length,5);assert(draft.start.funds>0);assert.equal(draft.journal,undefined);assert.notEqual(draft.map.id,file.map.id);
  await page.locator('#creator-test').click();await page.waitForFunction(()=>window.solarDev&&document.querySelector('.creation-session'));assert.equal((await page.evaluate(()=>window.solarDev.snapshot())).village.scenario.definition.map.biome.id,biome);await page.getByRole('button',{name:'Return to editor',exact:true}).click();await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
  await page.locator('#creator-release').click();await page.locator('#creator-release-author').fill('New community');await page.locator('#creator-release-confirm').click();await page.locator('#creator-library-dialog').waitFor({state:'visible'});const released=page.locator('[data-release]').filter({hasText:'Property '+biome});const scenario=await download(released.locator('[data-export-release]'));assert.deepEqual(scenario.credits,[{release:file.id,revision:1,author:file.author}]);
  if(await page.locator('#creator-library-clear').isEnabled())await page.locator('#creator-library-clear').click();await page.locator(`[data-map="${id}"] [data-remove-map]`).click();await page.locator('#creator-delete-confirm').click();await page.waitForFunction(id=>!document.querySelector(`[data-map="${id}"]`),id);assert.deepEqual(await download(released.locator('[data-export-release]')),scenario);
  if(i===0)assert.deepEqual(await download(reuseRow.locator('[data-export-map]')),file);
  await page.locator('#creator-library-search').fill('nothing matches');await page.locator('#creator-import').setInputFiles({name:'land.solar-map',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(file))});const imported=page.locator('[data-map]').filter({hasText:'Property '+biome});await imported.waitFor({state:'visible'});assert.notEqual(await imported.getAttribute('data-map'),id);assert.deepEqual(await download(imported.locator('[data-export-map]')),file);await imported.locator('.creator-preview img').waitFor();
  const bad=structuredClone(file);bad.compatibility.assets=999;const count=await page.locator('[data-map]').count(),url=page.url();await page.locator('#creator-import').setInputFiles({name:'future.solar-map',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))});await page.waitForFunction(()=>document.querySelector('#creator-library-status').textContent.includes('different game'));assert.equal(await page.locator('[data-map]').count(),count);assert.equal(page.url(),url);await page.locator('#creator-library-close').click();
 }
 assert.equal(new Set(files.map(f=>JSON.stringify(f.map.terrain))).size,3);
 await page.locator('#creator-library').click();
 const listRuns=()=>page.evaluate(async()=>{
  const {ContentLibrary}=await import('/content-library.js'),library=new ContentLibrary();
  try{return await library.listRuns();}finally{library.close();}
 });
 const normalSaves=()=>page.evaluate(()=>['solar-friends-v3','solar-friends-v3-story','solar-friends-v3-sandbox'].flatMap(key=>[localStorage.getItem(key),localStorage.getItem(key+'-backup')]));
 const normalBefore=await normalSaves();
 const runsBefore=await listRuns(),sandboxDialog=page.locator('#creator-map-sandbox-dialog');
 for(const file of files){
  const row=page.locator('[data-map]').filter({hasText:file.title});
  await row.locator('[data-sandbox-map]').click();
  await sandboxDialog.waitFor();
  assert.match(await sandboxDialog.locator('h2').textContent(),/Sandbox/);
  assert.match(await sandboxDialog.locator('#creator-map-sandbox-plots').textContent(),/Camp .*Shed .*Storage/);
  assert(await sandboxDialog.locator('img').evaluate(img=>img.decode().then(()=>img.naturalWidth>0)));
  await sandboxDialog.getByRole('button',{name:'Cancel',exact:true}).click();
 }
 assert.deepEqual(await listRuns(),runsBefore);
 await init({module_or_path:await readFile('web/pkg/solar_friends_bg.wasm')});
 const engine=new Game();
 let file;
 try{
  const template=JSON.parse(engine.scenario_template('sandbox'));
  const map=JSON.parse(engine.generate_biome_property('mata-atlantica',27));
  map.camp=[56,32];
  const catalog=JSON.parse(engine.scenario_catalog());
  const prepared=prepareSharedMap({...template,map},{catalog,defaultMap:template.map});
  file=checkSharedMap({...prepared,title:'Camp near the riverbank',description:'An edge camp',author:'Map author',
    validate:raw=>JSON.parse(engine.validate_map_package(raw))});
 }finally{engine.free();}
 await page.locator('#creator-import').setInputFiles({name:'riverbank.solar-map',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(file))});
 const source=page.locator('[data-map]').filter({hasText:file.title});
 await source.locator('[data-sandbox-map]').click();
 await sandboxDialog.waitFor();
 assert.equal(await sandboxDialog.locator('#creator-map-sandbox-plots').textContent(),'Camp (56, 32) · Shed (58, 35) · Storage (52, 35)');
 await page.screenshot({path:'/private/tmp/solar-map-sandbox.png'});
 await sandboxDialog.getByRole('button',{name:'Start village',exact:true}).click();
 await page.waitForFunction(()=>window.solarDev&&document.querySelector('.creation-session'));
 const url=page.url(),id=new URL(url).searchParams.get('run');
 const readRun=()=>page.evaluate(async id=>{
  const {ContentLibrary}=await import('/content-library.js'),library=new ContentLibrary();
  try{return await library.getRun(id);}finally{library.close();}
 },id);
 const run=await readRun();
 assert.equal(run.definition.rules.mode,'sandbox');
 assert.deepEqual(run.definition.map,file.map);
 // Native snapshot serialization expands the package's short f32 decimals.
 const nativePrecision=value=>JSON.parse(JSON.stringify(value,(_,n)=>typeof n==='number'?Math.fround(n):n));
 assert.deepEqual(nativePrecision(JSON.parse(run.snapshot).village.scenario.definition.map),nativePrecision(file.map));
 assert.deepEqual(run.definition.rules.weather,file.weather);
 assert.equal(run.definition.start.residents.length,5);
 assert.deepEqual(run.definition.start.buildings.map(({kind,x,y})=>[kind,x,y]),[['shed',58,35],['warehouse',52,35]]);
 assert.deepEqual(JSON.parse(run.snapshot).village.scenario.definition.start.buildings,run.definition.start.buildings);
 assert.deepEqual(run.attribution,[{release:file.id,revision:file.content_revision,author:file.author}]);
 await page.getByRole('button',{name:'Scenario library',exact:true}).click();
 await page.locator(`[data-continue-run="${id}"]`).click();
 await page.waitForFunction(()=>window.solarDev&&document.querySelector('.creation-session'));
 assert.equal(page.url(),url);
 await page.getByRole('button',{name:'Scenario library',exact:true}).click();
 await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
 assert.deepEqual(await normalSaves(),normalBefore);
 assert.deepEqual(errors,[]);
 await page.setViewportSize({width:1366,height:900});await page.screenshot({path:'/private/tmp/solar-map-creator-1366.png'});const bounds=await page.locator('.creator-actions').boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=1366,'Creator action bar overflow');
 console.log('PASS: all three biomes through public map save/search/export/import/reuse/playtest, land-only previews, invalid-settlement independence, durable map rename/copy and stale revision protection, versioning and immutable old exports, new scenario isolation, retained authorship, independent deletion, atomic incompatible imports, rotated Sandbox preview and continue, and desktop toolbar fit.');
}catch(error){await browser?.contexts()[0]?.pages()[0]?.screenshot({path:'/private/tmp/solar-map-controls-error.png'});throw error;}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
