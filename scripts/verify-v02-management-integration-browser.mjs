import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {createSandbox,plan,PROJECTS,save} from '../web/v02/weekend/simulation.js';
import {SANDBOX_SAVE} from '../web/v02/weekend/modes.js';
const s=createSandbox(42);
for(const [key,x,z]of [['house',50,50],['kitchen',60,50],['supply-5',40,50]]){assert.equal(plan(s,key,x,z),'');s.projects.at(-1).work=PROJECTS[key].work;}
s.view={speed:1,paused:true,position:[20,35,20],target:[1,2,3],zoom:1};
const server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({key,value})=>localStorage.setItem(key,value),{key:SANDBOX_SAVE,value:save(s)});
 await page.goto(`http://127.0.0.1:${server.address().port}/v2/?mode=sandbox`);
 const dialog=page.locator('#management');
 for(const view of ['resources','items','crafting','water','power','finances']){
  await page.locator(`[data-manage="${view}"]`).click();assert(await dialog.isVisible());
  if(view==='resources'){assert(await page.locator('#production-sites').isVisible());assert((await dialog.innerText()).includes('Cold storage')||(await dialog.innerText()).includes('Processing record'));}
  if(view==='items'){assert((await dialog.innerText()).includes('Garden tools'));assert(!(await page.locator('#production-sites').isVisible()));}
  if(view==='crafting'){assert((await dialog.innerText()).includes('Resident skills'));assert(await page.locator('.crafting-recipe').count()>3);}
  await mkdir('artifacts/integration-management',{recursive:true});
  if(['items','crafting'].includes(view))await page.screenshot({path:`artifacts/integration-management/${view}.png`});
  await page.keyboard.press('Escape');assert(!await dialog.isVisible());
 }
 await page.locator('[data-panel-toggle="people"]').click();await page.getByRole('button',{name:'View Iara',exact:true}).click();
 const home=page.getByLabel('Assign home for Iara');await home.selectOption(String(s.projects.find(p=>p.key==='house').id));assert.equal(await home.inputValue(),String(s.projects.find(p=>p.key==='house').id));
 assert.deepEqual(errors,[]);console.log('PASS all six management views, shared equipment, crafting and resident home assignment without browser errors');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
