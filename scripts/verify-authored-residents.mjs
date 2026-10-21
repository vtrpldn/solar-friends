import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {residentStory} from '../web/resident-story.js';
assert.equal(residentStory({residents:[{id:0,name:'Bento'},{id:1,name:'João'}]},'Iara & Bento'),'Bento & João');
const server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/editor.html`);
 await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
 await page.locator('[data-preset=camp]').click();
 await page.locator('#creator-residents > summary').click();
 const person=page.locator('[data-resident="resident-iara"]');
 await person.locator('summary').click();
 const name='João <vizinho>',bio='<img src=x onerror=alert(1)> Trouxe sementes.';
 for(const [field,value]of [['name',name],['pronouns','ele/dele'],['biography',bio],['preferred_bedtime','23:00'],['favourite_hobby','stretch']]){
  const input=person.locator(`[data-resident-field=${field}]`);
  if(field==='favourite_hobby')await input.selectOption(value);else {await input.fill(value);await input.dispatchEvent('change');}
 }
 await page.locator('#creator-save').click();
 await page.waitForFunction(()=>document.querySelector('#creator-save-status').textContent.startsWith('Saved'));
 await page.reload();await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
 assert.equal(await person.locator('[data-resident-field=name]').inputValue(),name);
 await page.locator('#creator-residents').evaluate(el=>el.open=true);
 await person.evaluate(el=>el.open=true);
 await person.scrollIntoViewIfNeeded();
 await page.screenshot({path:'/private/tmp/solar-authored-residents-editor.png'});
 await page.locator('#creator-test').click();
 await page.waitForFunction(()=>window.solarDev&&document.querySelector('.creation-session'));
 const state=await page.evaluate(()=>window.solarDev.snapshot());
 const resident=state.residents.find(p=>p.id===0);
 assert.equal(resident.name,name);assert.equal(resident.pronouns,'ele/dele');assert.equal(resident.biography,bio);
 assert.equal(resident.routine_preferences.preferred_bedtime,1380);
 assert.equal(resident.routine_preferences.favourite_hobby,'stretch');
 assert.equal(state.village.scenario.residents['resident-iara'],0);
 await page.locator('[data-panel=community-panel]').click();
 await page.locator('#residents [data-resident="0"]').click();
 assert.equal(await page.locator('#person h2').textContent(),name);
 assert.equal(await page.locator('#person .person-biography').textContent(),bio);
 assert.equal(await page.locator('#person .person-biography img').count(),0);
 await page.screenshot({path:'/private/tmp/solar-authored-resident-person.png'});
 assert.deepEqual(errors,[]);
 console.log('Authored resident controls, durable reload, native identity, metadata and routines passed.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
