import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {createSandbox,plan,PROJECTS,save} from '../web/v02/weekend/simulation.js';
import {saveSlots,SLOT_KEY} from '../web/v02/weekend/save-slots.js';
import {SANDBOX_SAVE} from '../web/v02/weekend/modes.js';
const s=createSandbox(42);
for(const [key,x,z]of [['house',50,50],['kitchen',60,50],['supply-5',40,50]]){assert.equal(plan(s,key,x,z),'');s.projects.at(-1).work=PROJECTS[key].work;}
s.view={speed:1,paused:true,position:[20,35,20],target:[1,2,3],zoom:1};
const values=new Map(),slots=saveSlots({getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)});
const named=slots.create('Integration village','sandbox',save(s));
const server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true,args:['--mute-audio',...(process.platform==='linux'?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[])]});const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({key,value,slotKey,slotData})=>{if(!sessionStorage.getItem('integration-fixture')){localStorage.setItem(key,value);localStorage.setItem(slotKey,slotData);sessionStorage.setItem('integration-fixture','1');}},{key:SANDBOX_SAVE,value:save(s),slotKey:SLOT_KEY,slotData:values.get(SLOT_KEY)});
 await page.goto(`http://127.0.0.1:${server.address().port}/v2/?mode=sandbox`);
 const dialog=page.locator('#management');
 for(const view of ['resources','items','crafting','water','power','finances']){
  if(view==='finances')await page.locator('[data-manage="resources"]').first().click();
  await page.locator(`[data-manage="${view}"]:visible`).first().click();assert(await dialog.isVisible());
  if(view==='resources'){assert(await page.locator('#production-sites').isVisible());assert((await dialog.innerText()).includes('Cold storage')||(await dialog.innerText()).includes('Processing record'));}
  if(view==='items'){assert((await dialog.innerText()).includes('Garden tools'));assert(!(await page.locator('#production-sites').isVisible()));}
  if(view==='crafting'){assert(await dialog.getByRole('button',{name:'Make',exact:true}).isVisible());assert(await dialog.getByRole('button',{name:'Repair',exact:true}).isVisible());assert(await page.locator('.craft-entry').count()>3);}
  await mkdir('artifacts/integration-management',{recursive:true});
  if(['items','crafting'].includes(view))await page.screenshot({path:`artifacts/integration-management/${view}.png`});
  await page.keyboard.press('Escape');assert(!await dialog.isVisible());
 }
 await page.locator('[data-panel-toggle="people"]').click();await page.getByRole('button',{name:'View Iara',exact:true}).click();
 const home=page.getByLabel('Assign home for Iara');await home.selectOption(String(s.projects.find(p=>p.key==='house').id));assert.equal(await home.inputValue(),String(s.projects.find(p=>p.key==='house').id));
 await page.getByRole('button',{name:'Close residents',exact:true}).click();
 await page.locator('.view-menu summary').click();await page.locator('#restart').click();
 await Promise.all([page.waitForEvent('load'),page.locator('#confirm-reset').click()]);
 const preserved=await page.evaluate(({key,id})=>{const db=JSON.parse(localStorage.getItem(key));return {active:db.active.sandbox,data:db.slots.find(slot=>slot.id===id).data};},{key:SLOT_KEY,id:named.id});
 assert.equal(preserved.active,undefined);const village=JSON.parse(preserved.data);assert.equal(village.landSeed,42);assert(village.projects.some(p=>p.key==='house'));
 assert.equal(village.people[0].home,s.projects.find(p=>p.key==='house').id,'the last home assignment is preserved in the old named village');
 await page.reload();
 const after=await page.evaluate(({key,id,auto})=>({data:JSON.parse(localStorage.getItem(key)).slots.find(slot=>slot.id===id).data,seed:JSON.parse(localStorage.getItem(auto)).landSeed}),{key:SLOT_KEY,id:named.id,auto:SANDBOX_SAVE});
 assert.equal(after.data,preserved.data,'new-world autosave and pagehide cannot overwrite the old named village');assert.notEqual(after.seed,42);
 console.log('PASS restarting and reloading a new world preserves the previous named village and its last edits');
 assert.deepEqual(errors,[]);console.log('PASS all six management views, shared equipment, crafting and resident home assignment without browser errors');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
