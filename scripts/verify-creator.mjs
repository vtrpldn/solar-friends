import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const server=await serve(),base=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.waitForFunction(()=>window.solarDev);
 const original=await page.evaluate(()=>JSON.stringify({...localStorage}));
 await page.getByRole('button',{name:'Create a village',exact:true}).click();
 await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
 await page.locator('[data-preset=camp]').click();
 await page.waitForFunction(()=>!document.querySelector('#creator-test').disabled);
 const projectURL=page.url();
 const terrainPixels=await page.evaluate(async()=>{
  const {Game}=await import('/pkg/solar_friends.js'),{paintTerrain,GROUND_START,GROUND_SIZE}=await import('/terrain.js');
  const g=new Game(),d=JSON.parse(g.scenario_template('sandbox'));g.load_scenario(JSON.stringify(d));d.map.terrain=JSON.parse(g.terrain_template());g.free();
  const image=new Image();image.src='/art/terrain-atlas.png';await image.decode();
  const at=c=>[...c.getContext('2d').getImageData(Math.floor((35-GROUND_START)*c.width/GROUND_SIZE),Math.floor((36-GROUND_START)*c.height/GROUND_SIZE),1,1).data];
  let canvas=paintTerrain(image,[],[],[],d.map.seed,d.map),before=at(canvas);canvas.width=canvas.height=1;
  d.map.terrain[36*64+35].habitat='rocky-woodland';canvas=paintTerrain(image,[],[],[],d.map.seed,d.map);const after=at(canvas);canvas.width=canvas.height=1;return {before,after};
 });
 assert.notDeepEqual(terrainPixels.before,terrainPixels.after,'A single authored cell between coarse terrain samples is visible');

 await page.locator('#creator-geology summary').click();
 await page.locator('#geology-0-x').fill('2');await page.locator('#geology-0-x').blur();
 await page.waitForFunction(()=>document.querySelector('#creator-undo').title==='Edit geological patch');
 await page.locator('#creator-undo').click();
 await page.getByRole('button',{name:'Clear geology',exact:true}).click();
 assert.equal(await page.locator('.creator-geopatch').count(),0);
 await page.locator('#creator-new-patch').selectOption('stone');
 await page.getByRole('button',{name:'Add patch',exact:true}).click();
 await page.locator('#geology-0-x').fill('5');await page.locator('#geology-0-x').blur();
 await page.locator('#geology-0-y').fill('5');await page.locator('#geology-0-y').blur();
 assert.equal(await page.locator('#geology-0-quantity').inputValue(),'12');
 await page.getByRole('button',{name:'Show patch',exact:true}).click();
 assert.equal(await page.locator('#creator-land-layer').inputValue(),'stone');
 assert.equal(await page.locator('#creator-new-patch').inputValue(),'stone');
 await page.screenshot({path:'/private/tmp/solar-geology-editor.png'});
 await page.locator('#creator-center').click();await page.locator('#creator-geology summary').click();

 const overview=page.locator('#creator-minimap');await overview.click({position:{x:120,y:60}});
 await page.waitForFunction(()=>JSON.parse(document.querySelector('#creator-map').dataset.center)[0]>40);
 const beforeArrow=JSON.parse(await page.locator('#creator-map').getAttribute('data-center'));
 await overview.press('ArrowLeft');const afterArrow=JSON.parse(await page.locator('#creator-map').getAttribute('data-center'));assert.equal(afterArrow[0],beforeArrow[0]-4);
 await overview.press('Home');assert.deepEqual(JSON.parse(await page.locator('#creator-map').getAttribute('data-center')),[32,32]);
 await page.locator('#creator-land-layer').selectOption('banks');
 assert.equal(await page.locator('#creator-map').getAttribute('data-overlay-cells'),await overview.getAttribute('data-bank-cells'));
 await page.locator('#creator-land-layer').selectOption('hydro');assert.match(await page.locator('#creator-land-legend').innerText(),/aligned with the generator/);
 await page.locator('#creator-land-layer').selectOption('none');

 const cellPoint=async(x,y)=>page.locator('#creator-map').evaluate((canvas,[x,y])=>{const o=JSON.parse(canvas.dataset.origin),s=Number(canvas.dataset.scale),r=canvas.getBoundingClientRect();return {x:r.left+o.x+(x-y)*34*s,y:r.top+o.y+(x+y)*17*s};},[x,y]);
 const clickCell=async(x,y)=>{const p=await cellPoint(x,y);await page.mouse.click(p.x,p.y);};
 await page.locator('#creator-habitat').selectOption('rocky-woodland');await page.locator('#creator-brush-size').selectOption('1');
 await clickCell(35,36);await page.waitForFunction(()=>document.querySelector('#creator-undo').title==='Paint habitat and soil');
 await page.waitForFunction(()=>document.querySelector('#creator-ground-detail').textContent.includes('Rocky woodland'));
 assert.match(await page.locator('#creator-ground-detail').innerText(),/×0.70/);
 await page.locator('#creator-undo').click();await page.locator('#creator-redo').click();
 await page.screenshot({path:'/private/tmp/solar-terrain-editor.png'});

 await page.locator('#creator-species').selectOption('jucara');await page.locator('#creator-brush-size').selectOption('1');
 await page.locator('#creator-nature-size').focus();for(let n=0;n<3;n++)await page.locator('#creator-nature-size').press('ArrowLeft');
 assert.equal(await page.locator('#creator-nature-scale').innerText(),'0.85×');
 await clickCell(34,35);await page.waitForFunction(()=>document.querySelector('#creator-undo').title==='Plant natural cluster');
 await page.locator('[data-tool=thin-nature]').click();await clickCell(34,35);
 await page.waitForFunction(()=>document.querySelector('#creator-undo').title==='Thin natural vegetation');
 await page.locator('#creator-undo').click();
 await page.screenshot({path:'/private/tmp/solar-nature-editor.png'});
 await page.locator('#creator-brush-size').selectOption('3');

 await page.locator('#creator-river-enabled').uncheck();
 await page.waitForFunction(()=>document.querySelector('#creator-undo').title==='Remove river');
 assert.equal(await overview.getAttribute('data-bank-cells'),'0');
 await page.locator('#creator-undo').click();
 await page.locator('[data-tool=river]').click();
 for(let n=0;n<6;n++)await page.locator('#creator-zoom-out').click();
 const riverA=await cellPoint(45,15),riverB=await cellPoint(45,20);
 await page.mouse.move(riverA.x,riverA.y);await page.mouse.down();await page.mouse.move(riverB.x,riverB.y,{steps:8});await page.mouse.up();
 await page.waitForFunction(()=>document.querySelector('#creator-undo').title==='Shape river course');
 assert.equal(await page.locator('#creator-test').isEnabled(),true);
 await page.screenshot({path:'/private/tmp/solar-creator-river.png'});
 await page.locator('#creator-undo').click();await page.locator('#creator-redo').click();
 for(let n=0;n<6;n++)await page.locator('#creator-zoom-in').click();
 await page.locator('[data-tool=select]').click();

 await clickCell(30,29);await page.keyboard.down('Shift');await clickCell(36,29);await page.keyboard.up('Shift');
 await page.getByRole('heading',{name:'2 buildings',exact:true}).waitFor();
 await page.getByRole('button',{name:'Move group',exact:true}).click();
 const from=await cellPoint(30,29),to=await cellPoint(28,29);
 await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:4});await page.mouse.up();
 await page.waitForFunction(()=>document.querySelector('#creator-undo').title==='Move building group');
 await page.locator('#creator-undo').click();
 await page.getByRole('button',{name:'Copy group',exact:true}).click();
 await clickCell(26,27);
 await page.getByText('Leave a little room between buildings.',{exact:true}).waitFor();
 await clickCell(30,35);
 await page.waitForFunction(()=>document.querySelector('#creator-undo').title==='Copy building group');
 await page.locator('#creator-undo').click();
 await page.keyboard.press('Escape');
 await page.waitForFunction(()=>document.querySelector('[data-tool=select]').getAttribute('aria-pressed')==='true');
 const a=await cellPoint(30,29),b=await cellPoint(36,29);
 await page.keyboard.down('Shift');await page.mouse.move(Math.min(a.x,b.x)-15,Math.min(a.y,b.y)-15);await page.mouse.down();await page.mouse.move(Math.max(a.x,b.x)+15,Math.max(a.y,b.y)+15,{steps:4});await page.mouse.up();await page.keyboard.up('Shift');
 await page.getByRole('heading',{name:'2 buildings',exact:true}).waitFor();await page.keyboard.press('Escape');


 await page.locator('[data-tool=meadow]').click();
 const brushPoints=await page.locator('#creator-map').evaluate(canvas=>{
  const origin=JSON.parse(canvas.dataset.origin),scale=Number(canvas.dataset.scale),r=canvas.getBoundingClientRect();
  return [[25,34],[27,34]].map(([x,y])=>({x:r.left+origin.x+(x-y)*34*scale,y:r.top+origin.y+(x+y)*17*scale}));
 });
 await page.mouse.move(brushPoints[0].x,brushPoints[0].y);await page.mouse.down();
 await page.mouse.move(brushPoints[1].x,brushPoints[1].y,{steps:4});await page.mouse.up();
 await page.waitForFunction(()=>document.querySelector('#creator-undo').title==='Clear a meadow');
 await page.locator('#creator-undo').click();
 await page.waitForFunction(()=>document.querySelector('#creator-redo').title==='Clear a meadow');
 await page.locator('#creator-redo').click();

 // Escape must cancel a live stroke, including its eventual pointer release.
 // A matching uncancelled stroke is the positive control against a no-op test.
 const savedCheckpoint=async()=>{
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#creator-save-status').textContent.startsWith('Saved'));
  return page.evaluate(async()=>{const {ContentLibrary}=await import('/content-library.js'),library=new ContentLibrary(undefined,{broadcast:false});try{return (await library.getProject(new URL(location.href).searchParams.get('project'))).checkpoint;}finally{library.close();}});
 };
 const cancelBefore=await savedCheckpoint();await page.locator('#creator-habitat').selectOption('rocky-woodland');
 const cancelA=await cellPoint(24,34),cancelB=await cellPoint(28,34);
 await page.mouse.move(cancelA.x,cancelA.y);await page.mouse.down();await page.mouse.move(cancelB.x,cancelB.y,{steps:4});await page.keyboard.press('Escape');await page.mouse.up();
 assert.deepEqual(await savedCheckpoint(),cancelBefore,'Cancelled stroke changed the durable document or undo history');
 await page.locator('#creator-habitat').selectOption('rocky-woodland');await page.mouse.move(cancelA.x,cancelA.y);await page.mouse.down();await page.mouse.move(cancelB.x,cancelB.y,{steps:4});await page.mouse.up();
 await page.waitForFunction(()=>document.querySelector('#creator-undo').title==='Paint habitat and soil');
 const painted=await savedCheckpoint();assert.notDeepEqual(painted.definition,cancelBefore.definition,'The cancellation control stroke must actually edit land');
 await page.locator('#creator-undo').click();assert.deepEqual((await savedCheckpoint()).definition,cancelBefore.definition,'A land stroke must undo atomically');

 await page.locator('#creator-land-layer').selectOption('fertility');
 const inspected=await cellPoint(25,34);await page.mouse.move(inspected.x,inspected.y);
 await page.waitForFunction(()=>document.querySelector('#creator-ground-detail').textContent.includes('Solar exposure'));
 assert.match(await page.locator('#creator-land-legend').innerText(),/lower to higher fertility/);
 await page.locator('#creator-title').fill('Our first property');await page.locator('#creator-title').blur();
 await page.locator('#creator-save').click();
 await page.waitForFunction(()=>document.querySelector('#creator-save-status').textContent==='Saved on this device');
 await page.screenshot({path:'/private/tmp/solar-creator-1600.png'});
 await page.reload();await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
 assert.equal(await page.locator('#creator-land-layer').inputValue(),'fertility');
 assert.equal(await page.locator('#creator-title').inputValue(),'Our first property');
 assert.equal(await page.locator('#creator-habitat').inputValue(),'rocky-woodland');
 assert.equal(await page.locator('#creator-species').inputValue(),'jucara');assert.equal(await page.locator('#creator-nature-scale').innerText(),'0.85×');
 assert.equal(await page.locator('#creator-undo').isEnabled(),true);
 await page.locator('#creator-test').click();
 await page.waitForFunction(()=>window.solarDev&&document.querySelector('.creation-session'));
 assert.match(await page.locator('.creation-session').innerText(),/Playtest · Our first property/);
 const mini=await page.locator('#village-map').evaluate(c=>{const ctx=c.getContext('2d'),at=(x,y)=>[...ctx.getImageData(Math.floor((x+.5)*c.width/64),Math.floor((y+.5)*c.height/64),1,1).data].slice(0,3);return {course:at(45,18),oldBank:at(61,18)};});
 assert.deepEqual(mini.course,[116,167,160]);assert.notDeepEqual(mini.oldBank,[116,167,160]);
 await page.screenshot({path:'/private/tmp/solar-river-playtest.png'});

 await page.getByRole('button',{name:'Save checkpoint',exact:true}).click();
 await page.getByRole('button',{name:'Restart test',exact:true}).click();
 await page.getByRole('button',{name:'Return to editor',exact:true}).click();
 await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
 assert.equal(page.url(),projectURL);
 assert.equal(await page.locator('#creator-land-layer').inputValue(),'fertility');
 assert.equal(await page.locator('#creator-title').inputValue(),'Our first property');
 assert.equal(await page.locator('#creator-habitat').inputValue(),'rocky-woodland');
 assert.equal(await page.locator('#creator-species').inputValue(),'jucara');assert.equal(await page.locator('#creator-nature-scale').innerText(),'0.85×');
 assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage})),original);
 await page.setViewportSize({width:1280,height:800});await page.screenshot({path:'/private/tmp/solar-creator-1280.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS player menu → create → save → reload → test → restart → return; Story/Sandbox storage unchanged.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
