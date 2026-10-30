// Reproducible example authoring through the same controls players use.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {applyExampleResidentLooks} from './example-resident-looks.mjs';
import {exampleAuthoringProfiles} from './example-authoring-profiles.mjs';
export async function authorExample(id){
const profile=exampleAuthoringProfiles[id];if(!profile)throw Error('Unknown example profile');
const server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/editor.html`);await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
 await page.locator(`[data-biome="${profile.biome}"]`).click();await page.locator('[data-preset="camp"]').click();await page.locator('#creator-library-dialog').waitFor({state:'hidden'});
 const edit=async(selector,value)=>{await page.locator(selector).fill(String(value));await page.locator(selector).blur();};
 await edit('#creator-title',profile.title);await edit('#creator-description',profile.description);
 if(profile.weather){await page.locator('[data-workspace=land]').click();await page.locator('#creator-weather > summary').click();for(const [key,value]of Object.entries(profile.weather))await edit('#creator-weather-'+key,value);}
 if(profile.cast){
  await page.locator('[data-workspace=people]').click();await page.locator('#creator-residents > summary').click();
  for(const person of profile.cast){
   await page.locator('[data-add-resident]').click();let row=page.locator('details[data-resident]').last();if(!await row.evaluate(el=>el.open))await row.locator(':scope > summary').click();
   const name=row.locator('[data-resident-field="name"]');await name.fill(person.name);await name.blur();
   await row.locator('[data-resident-field="appearance"]').selectOption(person.look);
   const biography=row.locator('[data-resident-field="biography"]');await biography.fill(person.biography);await biography.blur();
   await row.locator('.creator-experience > summary').click();await row.locator('[data-resident-field="background"]').selectOption(person.background);
  }
  for(const identity of profile.removeFounders??['resident-iara','resident-bento','resident-luz','resident-caua','resident-nina']){const row=page.locator(`details[data-resident="${identity}"]`);if(!await row.evaluate(el=>el.open))await row.locator(':scope > summary').click();await row.locator('[data-remove-resident]').click();}
 }
 await applyExampleResidentLooks(page,id);
 if(profile.inheritedBuildings){
  await page.locator('#creator-zoom-out').click();await page.locator('#creator-zoom-out').click();
  for(const [kind,x,y]of profile.inheritedBuildings){
   await page.locator(`[data-tool="${kind}"]`).click();const point=await page.locator('#creator-map').evaluate((canvas,[x,y])=>{const o=JSON.parse(canvas.dataset.origin),s=Number(canvas.dataset.scale),r=canvas.getBoundingClientRect();return {x:r.left+o.x+(x-y)*34*s,y:r.top+o.y+(x+y)*17*s};},[x,y]);await page.mouse.click(point.x,point.y);assert.equal(await page.locator('#creator-object-x').inputValue(),String(x),kind+' x');assert.equal(await page.locator('#creator-object-y').inputValue(),String(y),kind+' y');
  }
 }
 if(profile.freshWater!==undefined)await edit('#creator-water',profile.freshWater);
 if(profile.routes){
  await page.locator('[data-workspace=village]').click();await page.locator('#creator-route-tools').click();
  for(const route of profile.routes){
   await page.locator('[data-route-action=new]').click();
   await page.locator('[data-route-field=kind]').selectOption(route.kind);
   for(const key of ['from','to']){const input=page.locator(`[data-route-field="${key}"]`),options=await input.locator('option').evaluateAll(options=>options.map(o=>({text:o.textContent,value:o.value}))),choice=options.filter(o=>o.text.includes(route[key]))[route[key+'Occurrence']??0];assert(choice,route[key]);await input.selectOption(choice.value);}
   await page.locator('[data-route-action=preview]').click();await page.locator('[data-route-action=apply]').click();
  }
  await page.locator('[data-workspace=village]').click();await page.locator('#creator-routes > summary').click();
 }
 if(profile.equipment){await page.locator('[data-workspace=village]').click();await page.locator('#creator-equipment > summary').click();for(const item of profile.equipment){const input=page.locator('[data-equipment-asset]').filter({hasText:item.label}).nth(item.occurrence??0).locator('[data-equipment-field=condition]');await input.fill(String(item.condition));await input.blur();}await page.locator('[data-workspace=village]').click();await page.locator('#creator-equipment > summary').click();}
 await page.locator('[data-workspace=story]').click();await page.locator('#creator-journal > summary').click();
 if(await page.locator('[data-journal-action="disable"]').count())await page.locator('[data-journal-action="disable"]').click();
 await page.locator('[data-journal-action="enable"]').click();await page.locator('[data-journal-action="open"]').click();
 const field=async(path,value)=>edit(`[data-journal-path="${path}"]`,value);
 await field('introduction',profile.introduction);await field('completion',profile.completion);
 if(profile.deadline){await page.locator('[data-challenge-enabled]').check();await field('challenge.day',profile.deadline.day);await field('challenge.time',profile.deadline.time);await field('challenge.failure_message','The dry season arrived before our reserve was ready. Restart to try a different plan, or continue this village freely.');}
 const chapters=profile.chapters;
 for(const [c,chapter]of chapters.entries()){
  if(c)await page.locator('[data-journal-action="add-chapter"]').click();
  await field(`chapters.${c}.title`,chapter.title);await field(`chapters.${c}.description`,chapter.description);
  for(const [i,goal]of chapter.goals.entries()){
   if(i)await page.locator('[data-journal-action="add-goal"]').click();
   const base=`chapters.${c}.goals.${i}`;await field(base+'.title',goal.title);await field(base+'.description',goal.description);
   if(goal.optional)await page.locator(`[data-journal-path="${base}.optional"]`).check();
   await page.locator(`[data-journal-path="${base}.condition.kind"]`).selectOption(goal.kind);
   if(goal.state)await page.locator(`[data-journal-path="${base}.condition.state"]`).selectOption(goal.state);
   if(goal.building)await page.locator(`[data-journal-path="${base}.condition.building"]`).selectOption(goal.building);
   if(goal.count)await field(base+'.condition.count',goal.count);
   if(goal.kind==='harvests')await page.locator(`[data-journal-path="${base}.condition.credit"]`).selectOption('run');
   if(goal.outcome)await page.locator(`[data-journal-path="${base}.condition.outcome"]`).selectOption(goal.outcome);
   if(goal.service)await page.locator(`[data-journal-path="${base}.condition.service"]`).selectOption(goal.service);
   if(goal.minimum!==undefined)await field(base+'.condition.minimum',goal.minimum);
   if(goal.minutes)await field(base+'.condition.minutes',goal.minutes);
  }
 }
 await page.screenshot({path:`/private/tmp/solar-${profile.id}-authoring.png`});await page.locator('[data-journal-done]').click();assert(await page.locator('#creator-test').isEnabled());
 const pending=page.waitForEvent('download');await page.locator('#creator-export').click();const raw=await readFile(await (await pending).path(),'utf8'),definition=JSON.parse(raw);assert.equal(definition.journal.chapters.length,profile.chapters.length);assert.equal(definition.map.biome.id,profile.biome);assert.deepEqual(errors,[]);
 await mkdir('web/examples',{recursive:true});await writeFile(`web/examples/${profile.id}.solar-scenario`,raw);
 console.log(`PASS: ${profile.title} authored and exported through regular player controls; native review accepts the draft. Completion and balance require a separate playthrough.`);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}

}
