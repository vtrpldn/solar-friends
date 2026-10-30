import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/animations\/.*-(idle|activities)\.png/.test(r.url()))requests.push(r.url());});
 await page.goto(`http://127.0.0.1:${server.address().port}/editor.html`);await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');await page.locator('[data-preset=camp]').click();await page.waitForFunction(()=>document.querySelector('#creator-save-status').textContent.startsWith('Saved'));
 const checkpoint=()=>page.evaluate(async()=>{const {ContentLibrary}=await import('/content-library.js'),library=new ContentLibrary(),record=await library.getProject(new URLSearchParams(location.search).get('project'));library.close();return {definition:record.checkpoint.definition,revision:record.checkpoint.revision};});
 const before=await checkpoint();await page.locator('[data-workspace=people]').click();await page.locator('#creator-residents > summary').click();const person=page.locator('[data-resident="resident-iara"]');await person.locator(':scope > summary').click();await person.locator('[data-open-character]').click();
 const dialog=page.locator('#character-creator'),canvas=dialog.locator('[data-character-preview]');
 await page.waitForFunction(()=>document.querySelector('[data-character-preview]')?.dataset.look==='iara');
 const bounds=await dialog.boundingBox(),portraitBounds=await dialog.locator('.character-portrait canvas').boundingBox(),nameBounds=await dialog.locator('[data-character-name]').boundingBox(),heading=await dialog.locator('h2').boundingBox();assert.equal(portraitBounds.height,72);assert.equal(portraitBounds.width,64);assert(nameBounds.width>100);assert(heading.y>=bounds.y);assert((await dialog.locator('[data-character-done]').boundingBox()).y<900);
 assert((await dialog.boundingBox()).width>=850);assert.equal(await dialog.locator('[role=tab][aria-selected=true]').textContent(),'Identity');
 const still=await canvas.evaluate(c=>c.toDataURL());await page.waitForFunction(still=>document.querySelector('[data-character-preview]').toDataURL()!==still,still);
 for(const pose of ['walk','work','cook','water','tend','feed','sit','sleep','look','stretch','wave','relax','breathe']){
  await dialog.locator('[data-character-pose]').selectOption(pose);assert.equal(await canvas.getAttribute('data-pose'),pose);
 }
 await page.emulateMedia({reducedMotion:'reduce'});await dialog.locator('[data-character-pose]').selectOption('walk');
 const staticFrame=await canvas.evaluate(c=>c.toDataURL());
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(await canvas.evaluate(c=>c.toDataURL()),staticFrame);
 await dialog.locator('[data-character-facing]').selectOption('-1');assert.notEqual(await canvas.evaluate(c=>c.toDataURL()),staticFrame);
 const day=await canvas.evaluate(c=>c.toDataURL());await dialog.locator('[data-character-light]').selectOption('1');assert.notEqual(await canvas.evaluate(c=>c.toDataURL()),day);
 await dialog.locator('[data-character-scale]').check();assert.equal(await canvas.getAttribute('data-scale'),'true');await page.screenshot({path:'/private/tmp/solar-character-creator-scale.png'});
 await dialog.getByRole('button',{name:'Done',exact:true}).click();await page.locator('#creator-save').click();await page.waitForFunction(()=>document.querySelector('#creator-save-status').textContent.startsWith('Saved'));assert.deepEqual(await checkpoint(),before,'Preview activity, scale, lighting and time cannot edit the draft');
 await person.locator('[data-open-character]').click();
 const name='Júlia <vizinha>';await dialog.locator('[data-resident-field=name]').fill(name);await dialog.locator('[data-resident-field=name]').press('Tab');
 await page.waitForFunction(name=>document.querySelector('[data-character-name]').textContent===name,name);
 const identityTab=dialog.getByRole('tab',{name:'Identity',exact:true});await identityTab.focus();await identityTab.press('ArrowRight');assert.equal(await dialog.getByRole('tab',{name:'Appearance',exact:true}).getAttribute('aria-selected'),'true');assert.notEqual(await dialog.getByRole('tab',{name:'Appearance',exact:true}).evaluate(e=>getComputedStyle(e).background),await identityTab.evaluate(e=>getComputedStyle(e).background));
 for(const look of ['bento','luz','caua','nina','iara','bento']){
  await dialog.locator('[data-resident-field=appearance]').selectOption(look);await page.waitForFunction(look=>document.querySelector('[data-character-preview]').dataset.look===look,look);
 }
 assert.equal(new Set(requests).size,10);assert.equal(requests.length,10,'Each bundled look loads its extra sheets only once');
 await dialog.locator('[data-character-scale]').uncheck();await dialog.locator('[data-character-light]').selectOption('0');
 await page.screenshot({path:'/private/tmp/solar-character-creator-appearance.png'});
 await dialog.getByRole('tab',{name:'Personality',exact:true}).click();await dialog.locator('[data-resident-field=social_style]').selectOption('outgoing');await dialog.locator('[data-resident-field=work_interest]').selectOption('cooking');await dialog.locator('[data-resident-field=favourite_hobby]').selectOption('stretch');
 await dialog.getByRole('tab',{name:'Experience',exact:true}).click();await dialog.locator('[data-resident-field=background]').selectOption('cook');
 await dialog.locator('[data-character-undo]').click();assert.equal(await dialog.locator('[data-resident-field=background]').inputValue(),'newcomer');await dialog.locator('[data-character-redo]').click();assert.equal(await dialog.locator('[data-resident-field=background]').inputValue(),'cook');await dialog.getByRole('button',{name:'Done',exact:true}).click();await page.waitForFunction(()=>document.activeElement?.hasAttribute('data-open-character'));
 await page.locator('#creator-save').click();await page.waitForFunction(()=>document.querySelector('#creator-save-status').textContent.startsWith('Saved'));
 await page.reload();await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');assert.equal(await person.locator('[data-resident-field=name]').inputValue(),name);
 await page.locator('#creator-test').click();await page.waitForFunction(()=>window.solarDev&&document.querySelector('.creation-session'));
 const state=await page.evaluate(()=>window.solarDev.snapshot()),resident=state.residents.find(p=>p.id===state.village.scenario.residents['resident-iara']);
 assert.equal(resident.name,name);assert.equal(resident.appearance.preset,'bento');assert.equal(resident.social_style,'outgoing');assert.equal(resident.favorite,'cook');assert.equal(resident.routine_preferences.favourite_hobby,'stretch');assert(state.village.skills.people[resident.id].experience[3]>0);
 assert.deepEqual(errors,[]);console.log('PASS: animated full-pose preview, mirrored facing, day/night, shared scale reference, matching portrait, reduced motion, bounded sheet reuse, keyboard tabs, actual editing, undo/reload and native playtest settings.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
