import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];
 page.on('pageerror',e=>{errors.push(e.message);console.error(e.stack);});
 // Use a valid deterministic random draw; all locks and edits still use the
 // actual player controls, project transactions and native compiler.
 await page.addInitScript(()=>{Math.random=()=>.99;});
 await page.goto(`http://127.0.0.1:${server.address().port}/editor.html`);await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');await page.locator('[data-preset=camp]').click();
 await page.locator('#creator-relationships > summary').click();const bond=page.locator('[data-bond-from="resident-iara"][data-bond-to="resident-bento"]');await bond.fill('7');await bond.press('Tab');await page.locator('#creator-relationships > summary').click();
 await page.locator('#creator-residents > summary').click();const person=page.locator('[data-resident="resident-iara"]');await person.locator(':scope > summary').click();await person.locator('[data-resident-field=biography]').fill('Minha história.');await person.locator('[data-resident-field=biography]').press('Tab');await person.locator('[data-open-character]').click();
 const dialog=page.locator('#character-creator'),lock=dialog.locator('[data-character-lock]');
 assert(await lock.isChecked());const lockBounds=await lock.boundingBox();assert(lockBounds.width>=16&&lockBounds.height>=16);
 for(const tab of ['Personality','Experience']){await dialog.getByRole('tab',{name:tab,exact:true}).click();await lock.check();}
 await dialog.getByRole('tab',{name:'Appearance',exact:true}).click();assert(!await lock.isChecked());
 await dialog.locator('[data-character-random]').click();await page.waitForFunction(()=>document.querySelector('[data-character-preview]').dataset.look==='nina');
 assert.equal(await dialog.locator('[data-resident-field=appearance]').inputValue(),'nina');
 await dialog.getByRole('tab',{name:'Identity',exact:true}).click();assert.equal(await dialog.locator('[data-resident-field=name]').inputValue(),'Iara');
 await dialog.getByRole('tab',{name:'Personality',exact:true}).click();assert.equal(await dialog.locator('[data-resident-field=work_interest]').inputValue(),'gardening');
 await dialog.getByRole('tab',{name:'Experience',exact:true}).click();assert.equal(await dialog.locator('[data-resident-field=background]').inputValue(),'newcomer');
 await dialog.getByRole('tab',{name:'Appearance',exact:true}).click();await dialog.locator('[data-character-reset]').click();assert.equal(await dialog.locator('[data-resident-field=appearance]').inputValue(),'iara');
 assert(await dialog.locator('[data-character-reset]').isDisabled());
 await dialog.locator('[data-character-undo]').click();assert.equal(await dialog.locator('[data-resident-field=appearance]').inputValue(),'nina');await dialog.locator('[data-character-redo]').click();assert.equal(await dialog.locator('[data-resident-field=appearance]').inputValue(),'iara');
 await lock.check();assert(await dialog.locator('[data-character-random]').isDisabled());
 assert.equal(await dialog.locator('[data-character-random-note]').textContent(),'All categories are locked.');
 await dialog.getByRole('tab',{name:'Identity',exact:true}).click();await lock.uncheck();assert((await dialog.locator('[data-character-random-note]').textContent()).includes('clears pronouns and biography'));
 await dialog.locator('[data-character-random]').click();assert.equal(await dialog.locator('[data-resident-field=name]').inputValue(),'Tiago');
 await dialog.locator('[data-resident-field=biography]').fill('Keep my new story.');await dialog.locator('[data-resident-field=biography]').press('Tab');
 await dialog.getByRole('tab',{name:'Experience',exact:true}).click();await lock.uncheck();await dialog.locator('[data-character-random]').click();
 await dialog.getByRole('tab',{name:'Identity',exact:true}).click();await dialog.locator('[data-character-reset]').click();assert.equal(await dialog.locator('[data-resident-field=name]').inputValue(),'Iara');assert.equal(await dialog.locator('[data-resident-field=biography]').inputValue(),'Minha história.');
 await dialog.getByRole('tab',{name:'Experience',exact:true}).click();const background=await dialog.locator('[data-resident-field=background]').inputValue();assert.notEqual(background,'newcomer','Reset identity cannot reset generated experience');
 await page.screenshot({path:'/private/tmp/solar-character-choice-controls.png'});
 await dialog.getByRole('button',{name:'Done',exact:true}).click();await page.locator('#creator-save').click();await page.waitForFunction(()=>document.querySelector('#creator-save-status').textContent.startsWith('Saved'));
 await page.reload();await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');assert.equal(await person.locator('[data-resident-field=background]').inputValue(),background);
 await page.locator('#creator-test').click();await page.waitForFunction(()=>window.solarDev&&document.querySelector('.creation-session'));
 const state=await page.evaluate(()=>window.solarDev.snapshot()),id=state.village.scenario.residents['resident-iara'];
 assert.equal(state.residents.find(p=>p.id===id).name,'Iara');assert.equal(state.residents.find(p=>p.id===id).appearance.preset,'iara');assert.equal(state.residents.find(p=>p.id===id).favorite,'garden');
 assert.equal(state.residents.length,5);assert.deepEqual(state.village.progress.friendships,{0:{1:7},1:{0:7}});assert.equal(state.residents.find(p=>p.id===id).biography,'Minha história.');assert.equal(state.village.scenario.definition.start.resident_balance,undefined);
 assert(state.village.skills.people[id].experience.some(n=>n>0));assert.deepEqual(errors,[]);
 console.log('PASS: selected-category locks, disabled all-locked randomization, identity disclosure, optional-field reset, category isolation, undo/redo, durable choices and actual native playtest.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
