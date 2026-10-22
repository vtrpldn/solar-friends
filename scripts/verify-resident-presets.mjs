import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/editor.html`);await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
 const migration=await page.evaluate(async()=>{
  const {ContentLibrary,LibraryConflict}=await import('/content-library.js'),name='resident-upgrade-'+crypto.randomUUID();
  await new Promise((resolve,reject)=>{const request=indexedDB.open(name,1);request.onupgradeneeded=()=>{for(const s of ['projects','runs','heads'])request.result.createObjectStore(s,{keyPath:s==='heads'?'key':'id'});request.transaction.objectStore('heads').createIndex('kind','kind');request.transaction.objectStore('projects').put({id:'old-project',title:'Preserve me',checkpoint:{proof:7}});request.transaction.objectStore('runs').put({id:'old-run',snapshot:'Preserve the running village'});request.transaction.objectStore('heads').put({key:'project:old-project',kind:'project',id:'old-project',title:'Preserve me',updatedAt:1});};request.onsuccess=()=>{request.result.close();resolve();};request.onerror=()=>reject(request.error);});
  const a=new ContentLibrary(name),b=new ContentLibrary(name),legacy=await a.getProject('old-project');
  const legacyRun=await a.getRun('old-run');
  const file={format:'solar-friends-resident',schema:1,resident:{name:'Saved friend'}};
  const saved=await a.saveResidentPreset({id:'friend',file});const stale=await b.getResidentPreset('friend');
  const updated=await a.saveResidentPreset({id:'friend',file:{...file,resident:{name:'Updated friend'}}},saved.revision);
  let rejected=false;try{await b.deleteResidentPreset('friend',stale.revision);}catch(e){rejected=e instanceof LibraryConflict;}
  const current=await b.getResidentPreset('friend'),heads=await b.listResidentPresets(),projects=await b.listProjects();
  a.close();b.close();return {legacy,legacyRun,rejected,current,heads,projects,revision:updated.revision};
 });
 assert.equal(migration.legacy.checkpoint.proof,7);assert.equal(migration.legacyRun.snapshot,'Preserve the running village');assert(migration.rejected);assert.equal(migration.current.title,'Updated friend');assert.equal(migration.heads.length,1);assert.equal(migration.projects.length,1);
 await page.locator('[data-preset=camp]').click();await page.locator('#creator-residents > summary').click();
 const person=page.locator('[data-resident="resident-iara"]');await person.locator(':scope > summary').click();
 for(const [field,value]of [['name','Júlia <amiga>'],['pronouns','ela/dela'],['biography','Trouxe sementes.']]){await person.locator(`[data-resident-field=${field}]`).fill(value);await person.locator(`[data-resident-field=${field}]`).dispatchEvent('change');}
 await person.locator('[data-resident-field=appearance]').selectOption('nina');await person.locator('[data-resident-field=occupation]').selectOption('none');
 await person.locator('[data-resident-field=favourite_hobby]').selectOption('stretch');
 await person.locator('[data-save-resident-preset]').click();await page.locator('#creator-resident-save-dialog [name=title]').fill('Seed keeper');await page.locator('#creator-resident-save-dialog [name=author]').fill('João <criador>');await page.screenshot({path:'/private/tmp/solar-resident-package-save.png'});await page.locator('#creator-resident-save-dialog button[type=submit]').click();await page.getByText('Júlia <amiga> saved to resident presets.',{exact:true}).waitFor();
 await page.locator('[data-open-resident-presets]').click();const dialog=page.locator('#creator-resident-presets-dialog');await dialog.locator('[data-use-resident]').waitFor();
 assert.equal(await dialog.locator('b').textContent(),'Seed keeper');assert.equal(await dialog.locator('b amiga').count(),0);
 const downloadPromise=page.waitForEvent('download');await dialog.locator('[data-export-resident]').click();const download=await downloadPromise;
 assert(download.suggestedFilename().endsWith('.solar-resident'));const raw=await readFile(await download.path(),'utf8'),file=JSON.parse(raw);
 assert.equal(file.title,'Seed keeper');assert.equal(file.schema,2);assert.equal(file.author,'João <criador>');assert.deepEqual(file.compatibility,{game:1,ruleset:1,assets:1});assert.equal(file.content_revision,1);assert.equal(file.resident.id,undefined);await dialog.locator('[data-resident-search]').fill('JOAO');assert.equal(await dialog.locator('article:not([hidden])').count(),1);await dialog.locator('[data-resident-search]').fill('JULIA');assert.equal(await dialog.locator('article:not([hidden])').count(),1);await dialog.locator('[data-resident-search]').fill('no match');assert.equal(await dialog.locator('article:not([hidden])').count(),0);await dialog.locator('[data-resident-search]').fill('');await dialog.locator('[data-copy-resident]').click();await page.waitForFunction(()=>document.querySelectorAll('[data-use-resident]').length===2);const copiedDownload=page.waitForEvent('download');await dialog.locator('[data-export-resident]').first().click();assert.deepEqual(JSON.parse(await readFile(await (await copiedDownload).path(),'utf8')),file);await dialog.locator('[data-delete-resident]').first().click();await page.waitForFunction(()=>document.querySelectorAll('[data-use-resident]').length===1);assert.equal(file.resident.name,'Júlia <amiga>');assert.equal(file.resident.appearance.preset,'nina');
 await dialog.locator('[data-delete-resident]').click();await page.waitForFunction(()=>!document.querySelector('[data-use-resident]'));
 const upload=dialog.locator('[data-resident-file]');await upload.setInputFiles({name:'julia.solar-resident',mimeType:'application/json',buffer:Buffer.from(raw)});await dialog.locator('[data-use-resident]').waitFor();
 await page.screenshot({path:'/private/tmp/solar-resident-presets-library.png'});
 await dialog.locator('[data-use-resident]').click();await dialog.waitFor({state:'hidden'});assert.equal(await page.locator('#creator-residents-fields > details').count(),6);
 const added=page.locator('#creator-residents-fields > details').last(),addedID=await added.getAttribute('data-resident');assert.notEqual(addedID,'resident-iara');
 assert.equal(await added.locator('[data-resident-field=pronouns]').inputValue(),'ela/dela');
 await page.locator('#creator-undo').click();assert.equal(await page.locator('#creator-residents-fields > details').count(),5);await page.locator('#creator-redo').click();
 await page.locator('#creator-save').click();await page.waitForFunction(()=>document.querySelector('#creator-save-status').textContent.startsWith('Saved'));
 await page.reload();await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');assert.equal(await page.locator('#creator-residents-fields > details').count(),6);
 await page.locator('#creator-library').click();await page.locator('#creator-new-options > summary').click();await page.locator('[data-preset=camp]').click();await page.locator('#creator-residents').evaluate(el=>el.open=true);
 await page.locator('[data-open-resident-presets]').click();await dialog.locator('[data-use-resident]').waitFor();
 const invalid={...file,schema:999};await upload.setInputFiles({name:'future.solar-resident',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});
 await page.waitForFunction(()=>document.querySelector('[data-resident-preset-status]').textContent.includes('different format version'));
 assert.equal(await dialog.locator('[data-use-resident]').count(),1);for(const key of ['game','ruleset','assets']){const future=structuredClone(file);future.compatibility[key]=999;await upload.setInputFiles({name:'future.solar-resident',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(future))});await page.waitForFunction(()=>document.querySelector('[data-resident-preset-status]').textContent.includes('different game'));assert.equal(await dialog.locator('[data-use-resident]').count(),1);}

 const strong=structuredClone(file);strong.resident.experience={background:'newcomer',levels:{building:5}};
 await upload.setInputFiles({name:'experienced.solar-resident',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(strong))});await page.waitForFunction(()=>document.querySelectorAll('[data-use-resident]').length===2);
 await dialog.locator('[data-use-resident]').first().click();await page.waitForFunction(()=>document.querySelector('[data-resident-preset-status]').textContent.includes('Balanced setup'));
 assert.equal(await page.locator('#creator-residents-fields > details').count(),5);
 await dialog.locator('[data-close-residents]').click();await page.locator('[data-resident-policy]').selectOption('unrestricted');
 await page.locator('[data-open-resident-presets]').click();await dialog.locator('[data-use-resident]').first().click();await dialog.waitFor({state:'hidden'});
 assert.equal(await page.locator('#creator-residents-fields > details').count(),6);
 await page.locator('#creator-test').click();await page.waitForFunction(()=>window.solarDev&&document.querySelector('.creation-session'));
 const state=await page.evaluate(()=>window.solarDev.snapshot()),bindings=state.village.scenario.residents;
 const newPerson=state.residents.find(p=>p.id===bindings[Object.keys(bindings).find(k=>!['resident-iara','resident-bento','resident-luz','resident-caua','resident-nina'].includes(k))]);
 assert.equal(newPerson.name,'Júlia <amiga>');assert.equal(newPerson.appearance.preset,'nina');assert.equal(newPerson.routine_preferences.favourite_hobby,'stretch');assert.equal(state.village.skills.people[newPerson.id].experience[0],160);
 assert.equal(state.village.economy.outside_professions[newPerson.id],'none');assert.equal(state.village.scenario.definition.start.resident_balance,'unrestricted');
 await page.evaluate(async()=>{const {ContentLibrary}=await import('/content-library.js'),library=new ContentLibrary(),heads=await library.listResidentPresets(),record=await library.getResidentPreset(heads[0].id);record.file.resident.appearance.version=999;await library.saveResidentPreset({id:record.id,file:record.file},record.revision);library.close();});
 assert.equal((await page.evaluate(()=>window.solarDev.snapshot())).residents.find(p=>p.id===newPerson.id).appearance.version,1);
 await page.getByRole('button',{name:'Return to editor',exact:true}).click();await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
 await page.locator('#creator-residents').evaluate(el=>el.open=true);await page.locator('[data-open-resident-presets]').click();await dialog.locator('[data-use-resident]').first().click();
 await page.waitForFunction(()=>document.querySelector('[data-resident-preset-status]').textContent.includes('unavailable'));
 const preservedDownload=page.waitForEvent('download');await dialog.locator('[data-export-resident]').first().click();const preserved=JSON.parse(await readFile(await (await preservedDownload).path(),'utf8'));assert.equal(preserved.resident.appearance.version,999);await dialog.locator('[data-close-residents]').click();assert(await page.locator('#creator-test').isEnabled());
 assert.deepEqual(errors,[]);console.log('PASS: versioned resident metadata, authorship search, independent copies, all three incompatible-version rejections, old project/run library upgrade, stale deletion rejection, reusable character controls, export/import, fresh identities, undo/reload, cross-project reuse, budget enforcement, actual playtest and lossless export of unavailable artwork.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
