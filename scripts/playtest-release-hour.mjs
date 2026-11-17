// A real wall-clock hour against the published game, in an isolated muted browser.
// Browser actions use public controls; state reads inspect the game's autosave.
import {chromium} from 'playwright';
import {mkdir,writeFile,appendFile} from 'node:fs/promises';
import {restore} from '../web/v02/weekend/simulation.js';
import {STORY_SAVE} from '../web/v02/weekend/modes.js';
const base=process.env.PLAYTEST_BASE||'https://solar-friends.paladini.dev';
const out=process.env.PLAYTEST_OUTPUT||'/tmp/solar-release-playtest';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--mute-audio']});
const context=await browser.newContext({viewport:{width:1440,height:900},permissions:['clipboard-read','clipboard-write']});
await context.addInitScript(()=>localStorage.setItem('solar-friends-audio',JSON.stringify({music:0,effects:0})));
const page=await context.newPage();page.setDefaultTimeout(15000);
const errors=[],actions=[],samples=[];page.on('pageerror',e=>errors.push({at:new Date().toISOString(),message:e.message}));
const log=async value=>{await appendFile(out+'/events.jsonl',JSON.stringify(value)+'\n');console.log(JSON.stringify(value));};
const raw=()=>page.evaluate(key=>localStorage.getItem(key),STORY_SAVE);
const state=async()=>JSON.parse(await raw()||'null');
const close=async()=>{for(let i=0;i<3;i++)await page.keyboard.press('Escape');const menu=page.locator('.view-menu[open] summary');if(await menu.count())await menu.click();};
async function inspect(view){await close();if(view==='finances')await page.locator('#supplies [data-panel="finances"]').click();else await page.locator(`[data-manage="${view}"]:visible`).first().click();await page.locator('#management').waitFor();const text=(await page.locator('#management').innerText()).slice(0,1000);await page.screenshot({path:`${out}/${String(actions.length).padStart(2,'0')}-${view}.png`});await close();return text;}
async function place(key){await close();await page.locator('[data-panel-toggle="build"]').click();const before=(await state())?.projects.length||0;await page.locator('#build-search').fill('');const button=page.locator(`#build-${key}`);if(!await button.isVisible()||await button.isDisabled())return 'Unavailable';await button.click();for(const [x,y]of [[800,420],[900,500],[650,540],[800,600],[450,400]]){await page.mouse.click(x,y);await page.waitForTimeout(3200);const s=await state();if(s.projects.length>before){await close();return `Planned ${key}`;}}await close();return 'No valid placement found';}
const tasks=[
 ()=>inspect('food'),()=>inspect('water'),()=>place('house'),()=>inspect('resources'),()=>place('kitchen'),
 async()=>{await close();await page.locator('#open-guide').click();await page.locator('#guide-search').fill('water');await page.locator('#guide-topics button').first().click();await page.screenshot({path:out+'/guide-water.png'});await close();return 'Read water Guide';},
 ()=>inspect('power'),()=>place('well'),()=>inspect('crafting'),()=>inspect('food'),
 async()=>{await close();await page.locator('[data-panel-toggle="people"]').click();const text=(await page.locator('#resident-detail').innerText()).slice(0,900);await page.screenshot({path:out+'/residents.png'});await close();return text;},
 async()=>{await close();await page.locator('.view-menu summary').click();await page.getByRole('button',{name:'Copy bug report',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#diagnostics-status').textContent.startsWith('Bug report copied'));const report=JSON.parse(await page.evaluate(()=>navigator.clipboard.readText()));await writeFile(out+'/diagnostics.json',JSON.stringify(report));if(!restore(JSON.stringify(report.state)))throw Error('Diagnostic state cannot reload');await close();return 'Copied reloadable diagnostic report';},
 ()=>inspect('items'),()=>inspect('water'),()=>inspect('food'),()=>inspect('finances'),
 async()=>{await close();const before=await state();await page.reload();await page.locator('#supplies [data-need]').first().waitFor();const after=await state();if(after.time<before.time-.11)throw Error('Reload lost simulation progress');await page.keyboard.press('4');return 'Reload retained progress';},
 ()=>inspect('crafting'),()=>inspect('power'),()=>inspect('food'),
];
let started,finished,revision;
try{
 await page.goto(base+'/v2/?mode=story&performance=1');await page.locator('#world').waitFor();
 revision=await page.evaluate(async()=>{const {BUILD_INFO}=await import('./build-info.js');return BUILD_INFO.revision;});
 if(process.env.RELEASE_REVISION&&revision!==process.env.RELEASE_REVISION)throw Error('Published revision differs from release');
 await page.waitForFunction(key=>{const s=JSON.parse(localStorage.getItem(key)||'null');return s&&s.arrivalElapsed>=17;},STORY_SAVE,{timeout:120000});
 for(const [x,y]of [[720,500],[650,450],[800,500],[600,550],[850,600],[500,420]]){if((await state())?.stage!=='arrival')break;await page.mouse.click(x,y);await page.waitForTimeout(4000);}
 if((await state())?.stage==='arrival')throw Error('Could not establish camp through public controls');
 await page.keyboard.press('4');started=Date.now();await log({event:'started',at:new Date(started).toISOString(),revision,base});
 let nextSample=started,nextAction=started+30000,index=0;
 while(Date.now()-started<3600000){
  if(Date.now()>=nextAction){const task=tasks[index%tasks.length];let result;try{result=await task();}catch(e){result='Action unavailable or failed: '+e.message;await close();}const event={event:'action',at:new Date().toISOString(),index,result};actions.push(event);await log(event);index++;nextAction=Date.now()+150000;}
  if(Date.now()>=nextSample){const data=await raw(),s=JSON.parse(data||'null');if(!s)throw Error('No village autosave');const violations=[];for(const [id,n]of Object.entries(s.materials||{}))if(!Number.isFinite(n)||n<-.000001)violations.push(`stock ${id}: ${n}`);for(const n of Object.values(s.infrastructure?.nodes||{}))n.water.forEach((v,i)=>{if(v<-.000001||v>n.capacity[i]+.000001)violations.push(`water ${n.id}/${i}: ${v}`);});if(!restore(data))violations.push('save validation');const event={event:'sample',at:new Date().toISOString(),elapsedSeconds:Math.round((Date.now()-started)/1000),time:s.time,money:s.money,projects:s.projects.length,unfinished:s.operations?.filter(o=>!o.done).length||0,people:s.people.map(r=>({name:r.name,action:r.action,needBlocked:r.needBlocked,needs:r.needs})),violations,performance:await page.locator('#performance').innerText(),errors:errors.length};samples.push(event);await log(event);if(violations.length)await writeFile(out+'/invalid-save.json',data);await writeFile(out+'/latest-save.json',data);nextSample=Date.now()+30000;}
  await page.waitForTimeout(1000);
 }
 finished=Date.now();await page.screenshot({path:out+'/final.png'});await writeFile(out+'/final-save.json',await raw());
}finally{
 const report={revision,base,startedAt:started?new Date(started).toISOString():null,finishedAt:finished?new Date(finished).toISOString():null,elapsedSeconds:started?(Date.now()-started)/1000:0,completed:!!finished,actions,samples,errors};await writeFile(out+'/report.json',JSON.stringify(report,null,2));await log({event:'finished',completed:!!finished,elapsedSeconds:report.elapsedSeconds,errors:errors.length,samples:samples.length});await browser.close();
}
