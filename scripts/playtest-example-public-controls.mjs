// Only normal UI controls change the game. solarDev.snapshot is read-only
// observation; no advance(), loadScenario(), direct Game calls or save patches.
import {MATERIAL_KEYS} from '../web/materials.js';
import assert from 'node:assert/strict';import {mkdir,readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {chromium} from 'playwright';import {serve} from './serve.mjs';
const id=process.argv[2]??'first-clearing',configs={
 'first-clearing':{purchase:[[7,2],[12,2],[13,2]],placements:[['home',27,32,'village'],['home',28,36,'village'],['kitchen',32,34,'food'],['garden',35,34,'food']]},
 'before-the-dry-season':{purchase:[[9,1],[14,1]],placements:[['well',27,32,'village'],['kitchen',32,34,'food'],['garden',35,34,'food']]},
 'an-inherited-village':{purchase:[[15,3]],placements:[]},
};const config=configs[id];if(!config)throw Error('Choose a supported example');
const server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/editor.html`);await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');await page.locator(`[data-example="${id}"]`).click();await page.locator('#creator-library-dialog').waitFor({state:'hidden'});await page.waitForFunction(()=>document.querySelector('#creator-save-status').textContent.startsWith('Saved'));
 const editorURL=page.url(),definition=await page.evaluate(async()=>{const {ContentLibrary}=await import('/content-library.js'),l=new ContentLibrary();try{return (await l.getProject(new URL(location.href).searchParams.get('project'))).checkpoint.definition;}finally{l.close();}});
 await page.locator('#creator-test').click();await page.waitForURL(/\?run=/);await page.waitForFunction(()=>window.solarDev);assert.equal(await page.locator('#pause').getAttribute('aria-label'),'Resume simulation');
 const snapshot=()=>page.evaluate(()=>window.solarDev.snapshot());const before=await snapshot();
 await page.locator('#open-village').click();await page.locator('[data-panel="town-panel"]').click();
 for(const [id,count]of config.purchase)await page.locator(`#buy-${id}`).fill(String(count));assert(await page.locator('#town-order').isEnabled());await page.locator('#town-order').click();assert((await snapshot()).village.economy.money<before.village.economy.money);await page.locator('#town-panel [data-close-panel]').click();
 const placements=config.placements;
 for(const [kind,x,y,group]of placements){
  if(await page.locator('#build-panel').isHidden())await page.locator('[data-panel="build-panel"]').click();await page.locator(`[data-build-group="${group}"]`).click();await page.locator(`.build-tool[data-kind="${kind}"]`).click();
  const p=await page.locator('#world').evaluate((canvas,[x,y])=>{const r=canvas.getBoundingClientRect(),center=JSON.parse(canvas.dataset.cameraCenter),scale=Math.max(.18,Math.min(r.width/1900,r.height/1050)*1.3);return {x:r.left+r.width/2+(x-y-center.x+center.y)*34*scale,y:r.top+r.height/2+(x+y-center.x-center.y)*17*scale};},[x,y]);await page.mouse.click(p.x,p.y);assert((await snapshot()).village.buildings.some(b=>b.kind===kind&&b.x===x&&b.y===y),`Public pointer placement failed for ${kind} at ${x},${y}`);
 }
 if(await page.locator('#build-panel').isVisible())await page.locator('#build-panel [data-close-panel]').click();await page.locator('[data-speed="8"]').click();await page.locator('#pause').click();
 await mkdir('assets/scenario-reviews',{recursive:true});const observations=[],started=Date.now();let finished=null;
 while(Date.now()-started<600000){
  await page.waitForTimeout(5000);const s=await snapshot();finished=s.village.progress.scenario_journal.finished_at;observations.push({elapsedSeconds:(Date.now()-started)/1000,minute:s.village.minutes,finished,construction:s.village.buildings.map(b=>({kind:b.kind,progress:b.progress}))});
  if(observations.length%4===0)console.log(`${id} public controls: minute ${s.village.minutes.toFixed(1)}, ${finished===null?'required goals in progress':'required goals complete'}`);if(finished!==null)break;
 }
 assert(finished!==null,'Normal gameplay controls must reach scenario completion without hidden time advancement');assert.equal(await page.locator('#goal-label').textContent(),'Our story fulfilled');
 if(await page.locator('#pause').getAttribute('aria-label')==='Pause simulation')await page.locator('#pause').click();await page.getByRole('button',{name:'Save checkpoint',exact:true}).click();await page.getByRole('button',{name:'Save checkpoint',exact:true}).waitFor({state:'visible'});await page.waitForFunction(()=>[...document.querySelectorAll('.creation-session button')].find(b=>b.textContent==='Save checkpoint')?.disabled===false);
 const completed=await snapshot();await page.screenshot({path:`assets/scenario-reviews/${id}-public-completion.png`});await page.reload();await page.waitForFunction(()=>window.solarDev);assert.deepEqual(await snapshot(),completed);
 await page.locator('[data-panel="goals-panel"]').click();await page.locator('.scenario-completion').waitFor();await page.screenshot({path:`assets/scenario-reviews/${id}-public-journal.png`});await page.locator('#close-journal').click();await page.getByRole('button',{name:'Return to editor',exact:true}).click();await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');assert.equal(page.url(),editorURL);
 const retained=await page.evaluate(async()=>{const {ContentLibrary}=await import('/content-library.js'),l=new ContentLibrary();try{return {definition:(await l.getProject(new URL(location.href).searchParams.get('project'))).checkpoint.definition,runs:await l.listRuns()};}finally{l.close();}});assert.deepEqual(retained.definition,definition);assert.equal(retained.runs.length,0);assert.deepEqual(errors,[]);
 const raw=await readFile(`web/examples/${id}.solar-scenario`,'utf8');await writeFile(`assets/scenario-reviews/${id}-public-controls.json`,JSON.stringify({schema:1,sourceSha256:createHash('sha256').update(raw).digest('hex'),controls:{purchase:Object.fromEntries(config.purchase.map(([id,n])=>[MATERIAL_KEYS[id],n])),placements,preferredSpeed:8},finishedAt:finished,observations,saveReloadExact:true,editorUnchanged:true,scratchRunRemoved:true,scope:'Full completion through public UI; read-only snapshot observation; no direct simulation commands, forced work, stock changes or runtime patches.'},null,2)+'\n');
 console.log(`PASS: ${id}: public picker, paid Town purchase, ${placements.length} pointer-placed blueprints, real resident work, required-goal completion at ordinary speed controls, exact checkpoint reload and unchanged editor return.`);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
