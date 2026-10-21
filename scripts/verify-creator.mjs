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

 await page.locator('#creator-title').fill('Our first property');await page.locator('#creator-title').blur();
 await page.locator('#creator-save').click();
 await page.waitForFunction(()=>document.querySelector('#creator-save-status').textContent==='Saved on this device');
 await page.screenshot({path:'/private/tmp/solar-creator-1600.png'});
 await page.reload();await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
 assert.equal(await page.locator('#creator-title').inputValue(),'Our first property');
 assert.equal(await page.locator('#creator-undo').isEnabled(),true);
 await page.locator('#creator-test').click();
 await page.waitForFunction(()=>window.solarDev&&document.querySelector('.creation-session'));
 assert.match(await page.locator('.creation-session').innerText(),/Playtest · Our first property/);
 await page.getByRole('button',{name:'Save checkpoint',exact:true}).click();
 await page.getByRole('button',{name:'Restart test',exact:true}).click();
 await page.getByRole('button',{name:'Return to editor',exact:true}).click();
 await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
 assert.equal(page.url(),projectURL);
 assert.equal(await page.locator('#creator-title').inputValue(),'Our first property');
 assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage})),original);
 await page.setViewportSize({width:1280,height:800});await page.screenshot({path:'/private/tmp/solar-creator-1280.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS player menu → create → save → reload → test → restart → return; Story/Sandbox storage unchanged.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
