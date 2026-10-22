// Reproducible example authoring through the same controls players use.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/editor.html`);await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
 await page.locator('[data-biome="mata-atlantica"]').click();await page.locator('[data-preset="camp"]').click();await page.locator('#creator-library-dialog').waitFor({state:'hidden'});
 const edit=async(selector,value)=>{await page.locator(selector).fill(String(value));await page.locator(selector).blur();};
 await edit('#creator-title','First clearing');await edit('#creator-description','Five friends arrive at a small clearing in Mata Atlântica. A shed keeps the rain off and a shared store holds their first supplies. Plan homes, a kitchen and a modest garden while leaving the surrounding forest room to grow. There is no deadline.');
 await page.locator('#creator-journal > summary').click();
 if(await page.locator('[data-journal-action="disable"]').count())await page.locator('[data-journal-action="disable"]').click();
 await page.locator('[data-journal-action="enable"]').click();await page.locator('[data-journal-action="open"]').click();
 const field=async(path,value)=>edit(`[data-journal-path="${path}"]`,value);
 await field('introduction','We have a roof to gather under, a shared store and a property to learn. Start small: keep the camp legible, build homes close to everyday services and protect the forest beyond the clearing.');
 await field('completion','The clearing has become a place to live. Keep tending the garden, resting and adapting the village. This is a beginning, not a finished ecovila.');
 const chapters=[
  {title:'A place to come home to',description:'Five friends need two homes. Keep walking distances short and leave room for shared services.',goals:[{title:'Room for everyone',description:'Complete two homes. Each houses three people; the shed does not provide beds. Standard homes need one solar panel and one battery each. Use Supplies to compare shortages with town purchases, or choose a supported local building recipe. Keep money for food and maintenance.',kind:'buildings',building:'home',count:2},{title:'A place to gather',description:'Optional: leave a square where paths meet, with room for a future community space.',kind:'buildings',building:'square',count:1,optional:true}]},
  {title:'A shared table',description:'Food begins with land, water and time. A small garden and kitchen are enough for the first experiment.',goals:[{title:'Plant the first garden',description:'Complete a garden near the kitchen and a reachable water supply. Avoid building over every fertile patch.',kind:'buildings',building:'garden',count:1},{title:'Cook together',description:'Complete a kitchen. Check supplies and access before asking residents to build.',kind:'buildings',building:'kitchen',count:1}]},
  {title:'Learn from the land',description:'Give the residents time to tend crops, harvest and rest. Expand only when the first plot is working.',goals:[{title:'Two real harvests',description:'Let residents complete two harvests during this village. Starting food does not count as growing it.',kind:'harvests',count:2}]},
  {title:'Find a comfortable rhythm',description:'The first success is a pantry that lasts while people live their lives.',goals:[{title:'Keep the pantry healthy',description:'Maintain the pantry outcome for an observed hour. Food reserves and resident hunger must both stay healthy; pauses do not add time.',kind:'maintain',outcome:'pantry',minutes:60}]},
 ];
 for(const [c,chapter]of chapters.entries()){
  if(c)await page.locator('[data-journal-action="add-chapter"]').click();
  await field(`chapters.${c}.title`,chapter.title);await field(`chapters.${c}.description`,chapter.description);
  for(const [i,goal]of chapter.goals.entries()){
   if(i)await page.locator('[data-journal-action="add-goal"]').click();
   const base=`chapters.${c}.goals.${i}`;await field(base+'.title',goal.title);await field(base+'.description',goal.description);
   if(goal.optional)await page.locator(`[data-journal-path="${base}.optional"]`).check();
   await page.locator(`[data-journal-path="${base}.condition.kind"]`).selectOption(goal.kind);
   if(goal.building)await page.locator(`[data-journal-path="${base}.condition.building"]`).selectOption(goal.building);
   if(goal.count)await field(base+'.condition.count',goal.count);
   if(goal.kind==='harvests')await page.locator(`[data-journal-path="${base}.condition.credit"]`).selectOption('run');
   if(goal.outcome)await page.locator(`[data-journal-path="${base}.condition.outcome"]`).selectOption(goal.outcome);
   if(goal.minutes)await field(base+'.condition.minutes',goal.minutes);
  }
 }
 await page.screenshot({path:'/private/tmp/solar-first-clearing-authoring.png'});await page.locator('[data-journal-done]').click();assert(await page.locator('#creator-test').isEnabled());
 const pending=page.waitForEvent('download');await page.locator('#creator-export').click();const raw=await readFile(await (await pending).path(),'utf8'),definition=JSON.parse(raw);assert.equal(definition.journal.chapters.length,4);assert.equal(definition.map.biome.id,'mata-atlantica');assert.deepEqual(errors,[]);
 await mkdir('web/examples',{recursive:true});await writeFile('web/examples/first-clearing.solar-scenario',raw);
 console.log('PASS: First clearing authored and exported using regular player controls; four chapters, optional gathering space, real harvests and sustained pantry outcome; native review accepts the draft. Completion/balance playthrough remains required.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
