import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
export async function checkStoryControls({page,saved,capture}){
 if(!await page.locator('#dev-dialog').isVisible())await page.locator('#dev-button').click();
 await page.locator('[data-dev-tab="simulation"]').click();
 await page.locator('#dev-scenario').selectOption('story-planning');await page.locator('#dev-load').click();
 await page.waitForFunction(()=>window.solarDev.scenario()==='story-planning');
 const original=await page.evaluate(()=>JSON.stringify(window.solarDev.snapshot()));
 assert.equal(JSON.parse(original).village.progress.outcomes.last_sample,null);
 await page.locator('#dev-close').click();await page.keyboard.press('j');
 const card=page.locator('.quest-card:not([hidden])');
 assert.equal(await card.locator('.objective').count(),4,'Optional paths never inflate the primary goal');
 await card.locator('.journal-options summary').click();
 for(const viewport of [{width:1600,height:900},{width:1280,height:800}]){
  await page.setViewportSize(viewport);
  const option=card.locator('.journal-option').first();await option.scrollIntoViewIfNeeded();
  const boxes=await option.locator('b,small').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom};}));
  assert(boxes[0].top<boxes[1].bottom&&boxes[1].top<boxes[0].bottom,'Option progress shares the label row');
  assert.equal(await page.locator('#quest-dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
  await capture('Primary village outcomes and separate optional paths at '+viewport.width,'story-paths-'+viewport.width+'.png');
 }
 assert.equal(await page.evaluate(()=>JSON.stringify(window.solarDev.snapshot())),original,'Reading optional paths earns no observed time');
 await card.locator('.journal-option').filter({hasText:'Establish a fruit orchard'}).getByRole('button').click();
 assert(await page.locator('#build-panel').isVisible());
 assert.equal(await page.locator('[data-kind="orchard"]').getAttribute('aria-pressed'),'true','Optional farming choice selects the actual building tool');
 await page.keyboard.press('Escape');await page.locator('#dev-button').click();
 await page.locator('#dev-minutes').fill('60');await page.locator('#dev-advance').click();
 const observed=await page.evaluate(()=>window.solarDev.snapshot().village.progress.outcomes);
 assert(observed.last_sample>=570&&observed.last_sample<=630);assert(observed.best.every(n=>n<=60));
 await page.locator('[data-story-observations] summary').click();
 assert((await page.locator('[data-story-observations]').textContent()).includes('reachable, unclaimed portions'));
 await capture('Actual observed food and services stay distinct from authored preview resources','story-observations.png');
 const complete=JSON.parse(await readFile('artifacts/story-optional/solar-complete.json','utf8'));
 await page.locator('#dev-import-file').setInputFiles('artifacts/story-optional/solar-complete.json');
 await page.waitForFunction(minutes=>window.solarDev.snapshot().village.minutes===minutes,complete.village.minutes);
 await page.locator('#dev-close').click();await page.keyboard.press('j');await page.locator('[data-chapter="9"]').click();
 await card.locator('.journal-options summary').click();
 await card.locator('.journal-option').filter({hasText:'Read the land before expanding'}).getByRole('button').click();
 assert.equal(await page.locator('#land-map-toggle').getAttribute('aria-expanded'),'true');
 await page.keyboard.press('j');await page.locator('[data-chapter="10"]').click();await card.locator('.journal-options summary').click();
 await card.locator('.journal-option').filter({hasText:'Prepare for wet and dry periods'}).getByRole('button').click();
 assert(await page.locator('#supplies-panel').isVisible());assert(await page.locator('#weather-forecast').evaluate(el=>el.open));
 assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved,'Story teaching scenes and imported achievements protect the playable save');
 await page.keyboard.press('Escape');await page.locator('#dev-button').click();await page.setViewportSize({width:1440,height:1000});
}
