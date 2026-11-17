import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {createWeekend,chooseCamp,save} from '../web/v02/weekend/simulation.js';
import {STORY_SAVE} from '../web/v02/weekend/modes.js';

const s=createWeekend(42);chooseCamp(s,'entrance');
s.view={speed:1,paused:true,position:[20,35,20],target:[1,2,3],zoom:2};
const server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 // Test-only camera setup and projection. Selection still uses real pointer events.
 await page.route('**/game.js',async route=>{
  const response=await route.fetch();
  await route.fulfill({response,body:await response.text()+`\nwindow.residentPoint=(index)=>{controls.enableDamping=false;const actor=actors[index];const target=actor.position.clone();target.y+=.9;camera.position.copy(target).add(new THREE.Vector3(6,7,10));controls.target.copy(target);camera.zoom=5;camera.updateProjectionMatrix();controls.update();fitTerrainCamera(camera,controls.target,scene.fog);camera.updateMatrixWorld(true);scene.updateMatrixWorld(true);const point=target.clone().project(camera);return {x:(point.x+1)*innerWidth/2,y:(1-point.y)*innerHeight/2};};`});
 });
 await page.addInitScript(({key,value})=>localStorage.setItem(key,value),{key:STORY_SAVE,value:save(s)});
 await page.goto(`http://127.0.0.1:${server.address().port}/v2/?mode=story`);
 await page.waitForFunction(()=>typeof window.residentPoint==='function');
 await page.waitForTimeout(1000);
 for(const index of [0,1]){
  const point=await page.evaluate(i=>window.residentPoint(i),index);

  await page.mouse.click(point.x,point.y);
  await page.locator('#people').waitFor({state:'visible'});
  assert.equal(await page.locator('#resident-detail h2').innerText(),s.people[index].name);
  assert.equal(await page.getByRole('button',{name:'Overview',exact:true}).getAttribute('aria-pressed'),'true');
  if(process.env.SOLAR_EVIDENCE_DIR)await page.screenshot({path:`${process.env.SOLAR_EVIDENCE_DIR}/resident-click-${index}.png`});
  await page.getByRole('button',{name:'Close residents',exact:true}).click();
  assert(!await page.locator('#people').isVisible());
 }
 const point=await page.evaluate(()=>window.residentPoint(0));
 await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+30,point.y+15,{steps:5});await page.mouse.up();
 assert(!await page.locator('#people').isVisible(),'Camera drag does not open a profile');
 assert.deepEqual(errors,[]);
 console.log('PASS world clicks select the correct resident overview, close works, and camera drags do not select residents.');
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
