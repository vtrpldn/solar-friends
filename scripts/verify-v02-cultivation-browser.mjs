import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {createSandbox,planField,plan,PROJECTS,save,restore} from '../web/v02/weekend/simulation.js';
import {ensureCultivation} from '../web/v02/weekend/cultivation.js';
import {SANDBOX_SAVE} from '../web/v02/weekend/modes.js';
const out=process.env.FARM_SCREENSHOTS||'/tmp/solar-farming';await mkdir(out,{recursive:true});
const s=createSandbox(42);assert.equal(planField(s,50,50,[4,4]),'');const field=s.projects.at(-1);
field.cultivation.beds.forEach((b,i)=>Object.assign(b,{crop:['greens','beans','corn'][i%3],stage:['unprepared','prepared','growing','growing','harvestable','harvested'][i%6],growth:[0,0,.15,.6,1,0][i%6],...(i%6===4?{ripeAt:0}:{})}));
assert.equal(plan(s,'greenhouse',59,50),'');const greenhouse=s.projects.at(-1);greenhouse.work=PROJECTS.greenhouse.work;ensureCultivation(s,greenhouse).beds.forEach((b,i)=>Object.assign(b,{crop:i?'corn':'beans',stage:'harvestable',growth:1,ripeAt:0}));
assert.equal(plan(s,'house',50,59),'');s.projects.at(-1).work=PROJECTS.house.work;
s.people.forEach((r,i)=>{r.x=49+i*2;r.z=55;r.action='idle';r.walk=[];r.target=null;});
s.view={speed:1,paused:true,position:[64,35,64],target:[44,0,40],zoom:1};assert(restore(save(s)));
const server=await serve(0),browser=await chromium.launch({headless:true,args:['--mute-audio']});const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.addInitScript(({key,value})=>{if(!sessionStorage.getItem('farm-fixture')){localStorage.setItem(key,value);sessionStorage.setItem('farm-fixture','1');}},{key:SANDBOX_SAVE,value:save(s)});
 await page.goto(`http://127.0.0.1:${server.address().port}/v2/?mode=sandbox`);await page.waitForSelector('#build-field',{state:'attached'});await page.waitForTimeout(1500);
 await page.locator('#completed-tasks button').filter({hasText:'Cultivated field'}).first().evaluate(e=>e.click());
 await page.waitForSelector('#farm-bed');
 await page.locator('#close-farm').click();
 await page.locator('[data-manage="resources"]').first().click();
 const farmCard=page.locator(`[data-cultivation-site="${field.id}"]`);
 assert.equal(await page.getByRole('button',{name:/Leafy greens seed packets/}).count(),1,'seed packets appear in Resources');
 assert(await farmCard.isVisible());assert.equal(await farmCard.locator('select').count(),0,'migrated beds must not expose legacy irrigation or recipe controls');
 await farmCard.getByRole('button',{name:'Manage cultivation beds',exact:true}).click();
 await page.waitForSelector('#farm-bed');await page.locator('#farm-crop').selectOption('beans');assert.equal(await page.locator('#farm-crop').inputValue(),'beans');
 await page.locator('[data-farm-action="prepare"]').click();assert(await page.locator('#cultivation-panel').innerText().then(t=>t.includes('queued')));
 await page.locator('#cultivation-panel').evaluate(e=>e.scrollTop=0);
 assert.equal(await page.locator('[data-section="balances"]').getAttribute('open'),null,'detailed ledgers start collapsed');
 await page.screenshot({path:`${out}/field-and-greenhouse.png`});
 await page.locator('#build-field').evaluate(e=>e.click());
 // Actual desktop drag; retry distinct open areas because the terrain fixture includes trees.
 let valid=false;
 for(const [x,y]of [[450,300],[450,560],[700,600],[800,300],[300,450]]){
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+65,y+65,{steps:8});await page.mouse.up();
  if(await page.locator('#confirm-field').isEnabled()){valid=true;break;}
 }
 assert(valid,'a legal field rectangle is available');await page.locator('#field-direction').selectOption('1');
 await page.screenshot({path:`${out}/placement.png`});
 await page.locator('#confirm-field').click();await page.waitForSelector('#farm-bed');
 assert((await page.locator('#cultivation-panel').innerText()).includes('Unworked soil'));
 await page.locator('#farm-density').selectOption('1.5');await page.locator('#farm-irrigation').uncheck();
 await page.reload();await page.waitForSelector('#build-field',{state:'attached'});await page.waitForTimeout(500);assert.deepEqual(errors,[]);
 const night=await browser.newPage({viewport:{width:1440,height:900}});night.on('pageerror',e=>errors.push(e.message));s.time=13*60/.45;
 await night.addInitScript(({key,value})=>localStorage.setItem(key,value),{key:SANDBOX_SAVE,value:save(s)});await night.goto(`http://127.0.0.1:${server.address().port}/v2/?mode=sandbox`);await night.waitForTimeout(2000);await night.screenshot({path:`${out}/night.png`});await night.close();assert.deepEqual(errors,[]);
 console.log('PASS desktop field drag, rotated preview, confirmation, bed configuration, job queue and reload; no browser exceptions');
}finally{await browser.close();server.close();}
