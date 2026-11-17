import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {STORY_SAVE,SANDBOX_SAVE} from '../web/v02/weekend/modes.js';
import {createSandbox,planField,save} from '../web/v02/weekend/simulation.js';
const out=process.env.LAB_SCREENSHOTS||'/tmp/solar-lab-debug';await mkdir(out,{recursive:true});
const server=await serve(0),browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
async function exported(){const ready=page.waitForEvent('download');await page.locator('#export').click();const download=await ready;const stream=await download.createReadStream();const chunks=[];for await(const chunk of stream)chunks.push(chunk);return JSON.parse(Buffer.concat(chunks).toString());}
async function stopped(){await page.waitForFunction(()=>document.querySelector('#pause').textContent==='Resume'&&/completed|ready to harvest/.test(document.querySelector('#notice').textContent),undefined,{timeout:180000});}
try{
 await page.addInitScript(keys=>keys.forEach(k=>localStorage.setItem(k,'normal-save-sentinel')),[STORY_SAVE,SANDBOX_SAVE]);
 await page.goto(`http://127.0.0.1:${server.address().port}/v2/lab.html`);await page.getByText('New-run world settings',{exact:true}).click();await page.locator('#world-biome').selectOption('caatinga');await page.locator('#world-water').selectOption('dry');await page.locator('#new').click();await page.waitForFunction(()=>document.querySelector('#clock').textContent.includes('Day 1'));
 await page.locator('#residents button').first().click();await page.waitForFunction(()=>document.querySelector('#residents button').textContent.includes('Disable'));
 await page.locator('#speed').selectOption('1024');await page.locator('#step').click();await stopped();
 const report=await exported();assert.equal(report.version,2);assert.equal(report.state.worldSettings.biome,'caatinga');assert.equal(report.state.worldSettings.water,'dry');assert.equal(report.endTick,1334);assert.equal(report.commands.length,1);assert.equal(report.commands[0].action.type,'outside');assert(report.samples.at(-1).needs.hydration>0);
 await page.locator('#replay').setInputFiles({name:'replay.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(report))});await page.waitForFunction(()=>document.querySelector('#notice').textContent!=='Order accepted.');
 await page.waitForFunction(()=>document.querySelector('#step').disabled);await page.locator('#speed').selectOption('1024');await page.locator('#pause').click();await stopped();
 assert.match(await page.locator('#notice').innerText(),/final state matches/);
 const replay=await exported();assert.equal(replay.endTick,report.endTick);assert.deepEqual(replay.state,report.state,'replayed commands produce the same complete state');
 await page.locator('#search').fill('Cultivated field');assert(await page.locator('#field-size').isVisible());await page.locator('#field-width').fill('6');
 const invalid=structuredClone(report.state);invalid.materials.food='bad';invalid.worldSettings.biome='cerrado';
 await page.locator('#import').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('rejected'));assert.deepEqual((await exported()).state,replay.state);
 const mismatch=structuredClone(report);mismatch.state.money++;
 await page.locator('#replay').setInputFiles({name:'mismatch.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(mismatch))});await page.waitForFunction(()=>document.querySelector('#step').disabled);await page.locator('#speed').selectOption('1024');await page.locator('#pause').click();await stopped();assert.match(await page.locator('#notice').innerText(),/final-state mismatch/);
 assert.deepEqual(await page.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),[STORY_SAVE,SANDBOX_SAVE]),['normal-save-sentinel','normal-save-sentinel']);
 // Isolated sandbox fixture for UI controls; this is not a story balance scenario.
 const s=createSandbox(42);assert.equal(planField(s,50,50,[2,2]),'');const field=s.projects.at(-1);s.people.forEach((r,i)=>{r.x=48+i*.6;r.z=49;});
 await page.locator('#import').setInputFiles({name:'farm.json',mimeType:'application/json',buffer:Buffer.from(save(s))});await page.waitForFunction(()=>document.querySelector('#sites').options.length>1);
 await page.locator('#sites').selectOption(String(field.id));await page.getByLabel('Crop',{exact:true}).selectOption('beans');await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('accepted'));
 await page.locator('[data-bed-action="prepare"]').click();await page.locator('#run-days').fill('1');await page.locator('#speed').selectOption('1024');await page.locator('#run-for').click();await stopped();
 let farm=await exported();assert(farm.state.projects.find(p=>p.id===field.id).cultivation.beds.every(b=>b.stage==='prepared'));
 await page.locator('[data-bed-action="plant"]').click();await page.locator('#stop-condition').selectOption('harvest');await page.locator('#run-for').click();await stopped();
 farm=await exported();assert(farm.state.projects.find(p=>p.id===field.id).cultivation.beds.some(b=>b.stage==='harvestable'));assert(farm.endTick<64000,'harvest breakpoint stops before the full interval');
 await page.locator('#diagnostics > summary').click();await page.waitForSelector('#trends svg');await page.waitForFunction(()=>Math.abs(document.querySelector('#map').height-document.querySelector('#map').getBoundingClientRect().height)<2);await page.screenshot({path:`${out}/lab-farming-debug.png`});
 await page.locator('#stop-condition').selectOption('none');await page.locator('#run-for').click();await stopped();
 await page.locator('[data-bed-action="harvest"]').click();await page.locator('#run-for').click();await stopped();farm=await exported();assert(farm.state.projects.find(p=>p.id===field.id).cultivation.beds.every(b=>b.stage==='harvested'));
 await page.locator('#replay').setInputFiles({name:'farm-replay.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(farm))});await page.waitForFunction(()=>document.querySelector('#step').disabled);await page.locator('#speed').selectOption('1024');await page.locator('#pause').click();await stopped();assert.match(await page.locator('#notice').innerText(),/final state matches/);
 assert.deepEqual((await exported()).state,farm.state,'farming replay retains construction, inputs, harvest and worker settlement');
 assert.deepEqual(await page.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),[STORY_SAVE,SANDBOX_SAVE]),['normal-save-sentinel','normal-save-sentinel']);assert.deepEqual(errors,[]);
 console.log('PASS desktop fixed-hour run, outside work, exact export/replay, checkpoint import, crop configuration, prepare/plant/harvest, harvest breakpoint and diagnostic charts');
}finally{await browser.close();server.close();}
