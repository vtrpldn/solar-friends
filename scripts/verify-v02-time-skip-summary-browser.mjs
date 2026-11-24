import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {createWeekend,chooseCamp,save,restore} from '../web/v02/weekend/simulation.js';
import {foodPortions} from '../web/v02/weekend/food-storage.js';
import {STORY_SAVE} from '../web/v02/weekend/modes.js';
// Optional: pass a path to keep a 1280×720 screenshot of the recap.
const screenshot=process.argv[2];
const state=createWeekend(42);chooseCamp(state,'entrance');state.view={paused:true};
const server=await serve(),browser=await chromium.launch({headless:true,args:['--mute-audio',...(process.platform==='darwin'?['--use-angle=metal']:[])]});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({key,value})=>{if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.setItem(key,value);}localStorage.setItem('solar-friends-audio','{"music":0,"effects":0}');},{key:STORY_SAVE,value:save(state)});
 await page.goto(`http://127.0.0.1:${server.address().port}/v2/?mode=story`);
 const summary=page.locator('#skip-summary-dialog'),saved=async()=>restore(await page.evaluate(key=>localStorage.getItem(key),STORY_SAVE));
 const cents=text=>Math.round(Number(text.replace('−','-').replace(/[^0-9.,+-]/g,'').replace(/\.(?=\d{3})/g,'').replace(',','.'))*100);

 // Five fast days on a fresh Story village.
 await page.locator('#time-skip').click();await page.locator('#skip-days').fill('5');await page.locator('#skip-fast').check();await page.locator('#skip-start').click();
 await summary.waitFor({state:'visible',timeout:120000});
 assert.equal(await page.locator('#time-skip-dialog').evaluate(d=>d.open),false);
 const after=await saved();
 assert.equal(await page.locator('#skip-summary-title').textContent(),'5 days later');
 assert.match(await page.locator('#skip-summary-span').textContent(),/^Day 1 · 09:00 → Day 6 · 09:00 · /);
 assert(await page.locator('#skip-summary-stopped').isHidden());
 const sections=await summary.locator('section').evaluateAll(nodes=>nodes.map(node=>({title:node.querySelector('h3').textContent,total:node.querySelector('.skip-summary-head strong')?.textContent,rows:[...node.querySelectorAll('dl > div')].map(row=>[row.querySelector('dt').firstChild.textContent,row.querySelector('dd').textContent])})));
 const money=sections.find(section=>section.title==='Savings');
 assert(money,'savings changed over five idle days');
 assert.equal(money.rows.reduce((n,[,value])=>n+cents(value),0),Math.round((after.money-state.money)*100),'savings rows add up to the real change');
 const [was,now]=money.total.split(' → ').map(cents);
 assert.equal(was,Math.round(state.money*100));assert.equal(now,Math.round(after.money*100));
 assert.equal(cents(await page.locator('#supplies .resource b').first().textContent()),now,'recap matches the Savings counter');
 const food=sections.find(section=>section.title==='Food and water').rows.find(([label])=>label==='Food portions');
 assert.equal(food[1],`${foodPortions(state)} → ${foodPortions(after)}`);
 assert(after.view.paused,'village stays paused behind the recap');
 assert.equal(await page.evaluate(()=>document.activeElement.id),'skip-summary-close');
 const box=await summary.boundingBox();assert(box.y>=0&&box.y+box.height<=720&&box.x>=0&&box.x+box.width<=1280,'recap fits a 1280×720 window');
 if(screenshot)await page.screenshot({path:screenshot});

 // Enter closes it, focus returns to Advance days, and the village is still paused.
 await page.keyboard.press('Enter');await summary.waitFor({state:'hidden'});
 assert.equal(await page.evaluate(()=>document.activeElement.id),'time-skip');
 assert.match(await page.locator('#pause').textContent(),/Resume|▶|Play/i);

 // Stopped early: the recap covers the part that ran; Esc closes it.
 await page.locator('#time-skip').click();await page.locator('#skip-days').fill('30');await page.locator('#skip-fast').uncheck();await page.locator('#skip-start').click();
 await page.waitForFunction(()=>document.querySelector('#skip-progress').value>0);await page.locator('#skip-close').click();
 await summary.waitFor({state:'visible'});
 assert.match(await page.locator('#skip-summary-stopped').textContent(),/^Stopped early: .+ of the 30 days you asked for\.$/);
 await page.keyboard.press('Escape');await summary.waitFor({state:'hidden'});
 assert.equal(await page.evaluate(()=>document.activeElement.id),'time-skip');

 // A section link leaves the recap for its management screen.
 await page.locator('#time-skip').click();await page.locator('#skip-days').fill('1');await page.locator('#skip-fast').check();await page.locator('#skip-start').click();
 await summary.waitFor({state:'visible',timeout:60000});
 const link=summary.getByRole('button',{name:'Open Food'});
 if(await link.count()){await link.click();await summary.waitFor({state:'hidden'});assert.equal(await page.locator('#management').evaluate(d=>d.open&&d.dataset.screen),'food');}
 assert.deepEqual(errors,[]);
 console.log('PASS advance-days recap in the browser: real figures, fits 1280×720, Enter/Esc close, focus returns, stopped-early note and screen links.');
}finally{await browser.close();server.close();}
