import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const server=await serve();let browser;
try {
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/editor.html`);await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');await page.locator('[data-preset=camp]').click();
 await page.locator('#creator-journal > summary').click();await page.locator('[data-journal-action=enable]').click();await page.locator('[data-journal-action=open]').click();
 const dialog=page.locator('#creator-journal-dialog'),field=path=>dialog.locator(`[data-journal-path="${path}"]`);
 await field('chapters.0.goals.0.title').fill('Prepare our first walls');await field('chapters.0.goals.0.title').press('Tab');await field('chapters.0.goals.0.condition.kind').selectOption('produced');await field('chapters.0.goals.0.description').fill('Turn local earth into wall material.');await field('chapters.0.goals.0.description').press('Tab');assert.equal(await field('chapters.0.goals.0.condition.material').inputValue(),'walls');assert.equal(await field('chapters.0.goals.0.condition.credit').inputValue(),'after_activation');
 assert.equal(await field('chapters.0.goals.0.condition.material').locator('option').count(),6);await field('chapters.0.goals.0.condition.credit').scrollIntoViewIfNeeded();await page.screenshot({path:'/private/tmp/solar-produced-editor.png'});await dialog.locator('[data-journal-done]').click();
 await page.locator('#creator-rule-logistics').uncheck();assert(await page.locator('#creator-test').isDisabled());assert((await page.locator('#creator-issues').textContent()).includes('Enable materials'));await page.locator('#creator-rule-logistics').check();assert(await page.locator('#creator-test').isEnabled());
 await page.locator('#creator-test').click();await page.waitForFunction(()=>window.solarDev&&document.querySelector('.creation-session'));
 let snapshot=await page.evaluate(()=>window.solarDev.snapshot());assert.equal(snapshot.village.production.accounting.outputs[6],0);assert(snapshot.village.economy.stock[6]>=2,'Starting wall stock exists but does not fulfill production');
 await page.locator('[data-panel=goals-panel]').click();const book=page.locator('#quest-dialog');await book.waitFor({state:'visible'});assert.equal(await book.locator('.scenario-journal-goal.complete').count(),0);assert((await book.locator('#quest-list').textContent()).includes('0 / 2'));
 await book.getByRole('button',{name:'Review production',exact:true}).click();await book.waitFor({state:'hidden'});await page.locator('#preparation-recipes').waitFor({state:'visible'});
 await page.locator('#production-target-6').fill('14');await page.locator('[data-production-target="6"]').click();assert.equal(await page.evaluate(()=>window.solarDev.snapshot().village.production.accounting.outputs[6]),0,'Requesting production is not completion');
 await page.keyboard.press('Escape');if((await page.locator('#pause').getAttribute('aria-label')).includes('Resume'))await page.locator('#pause').click();await page.locator('[data-speed="8"]').click();
 await page.waitForFunction(()=>window.solarDev.snapshot().village.progress.scenario_journal.finished_at!==null);if((await page.locator('#pause').getAttribute('aria-label')).includes('Pause'))await page.locator('#pause').click();
 snapshot=await page.evaluate(()=>window.solarDev.snapshot());assert(snapshot.village.production.accounting.outputs[6]>=2);assert(snapshot.village.production.batches.some(b=>b.material===6&&b.phase==='complete'));
 await page.locator('[data-panel=goals-panel]').click();await book.waitFor({state:'visible'});assert.equal(await book.locator('.scenario-journal-goal.complete').count(),1);await page.screenshot({path:'/private/tmp/solar-produced-complete.png'});await page.locator('#close-journal').click();
 const before=await page.evaluate(()=>window.solarDev.snapshot().village.progress.scenario_journal);await page.getByRole('button',{name:'Save checkpoint',exact:true}).click();await page.waitForFunction(()=>[...document.querySelectorAll('.creation-session button')].find(b=>b.textContent==='Save checkpoint')?.disabled===false);
 await page.reload();await page.waitForFunction(()=>window.solarDev&&document.querySelector('.creation-session'));assert.deepEqual(await page.evaluate(()=>window.solarDev.snapshot().village.progress.scenario_journal),before);assert.deepEqual(errors,[]);
 console.log('PASS: public produced-material controls, supported products and rule validation, starting stock excluded, actual preparation action/target/hauling/resident batch completion, native goal credit and exact checkpoint restoration.');
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
