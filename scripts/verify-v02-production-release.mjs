import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {restore} from '../web/v02/weekend/simulation.js';
import {STORY_SAVE} from '../web/v02/weekend/modes.js';
const revision=process.env.RELEASE_REVISION;if(!revision)throw Error('RELEASE_REVISION is required');
const base=process.env.RELEASE_BASE||'https://solar-friends.paladini.dev',out=process.env.RELEASE_EVIDENCE||'/tmp/solar-performance/production';await mkdir(out,{recursive:true});
const s=JSON.parse(await readFile(process.env.RELEASE_SAVE||'docs/releases/evidence/2026-11-17-production-save.json','utf8'));s.view={...s.view,paused:true};
const browser=await chromium.launch({headless:true,args:['--mute-audio','--use-angle=metal']});
try{
 const context=await browser.newContext({viewport:{width:1440,height:900},permissions:['clipboard-read','clipboard-write']});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({key,value})=>{if(!sessionStorage.getItem('release-fixture')){localStorage.setItem(key,value);sessionStorage.setItem('release-fixture','1');}localStorage.setItem('solar-friends-audio','{"music":0,"effects":0}');},{key:STORY_SAVE,value:JSON.stringify(s)});
 await page.goto(base+'/v2/?mode=story');await page.locator('#supplies [data-need]').first().waitFor();
 const actual=await page.evaluate(async()=> (await import('./build-info.js')).BUILD_INFO);assert.equal(actual.revision,revision);
 await page.locator('#nl-badge-frame').waitFor({timeout:15000});
 await page.locator('.view-menu summary').click();await page.getByRole('button',{name:'Copy bug report',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#diagnostics-status').textContent.startsWith('Bug report copied'));
 const diagnostic=JSON.parse(await page.evaluate(()=>navigator.clipboard.readText()));assert(restore(JSON.stringify(diagnostic.state)));await writeFile(out+'/diagnostic.json',JSON.stringify(diagnostic));await page.locator('.view-menu summary').click();
 await page.locator('[data-manage="water"]:visible').first().click();assert.match(await page.locator('#management').innerText(),/sanitation/i);await page.keyboard.press('Escape');
 await page.locator('[data-manage="crafting"]:visible').first().click();assert(await page.getByRole('button',{name:'Make',exact:true}).isVisible());await page.keyboard.press('Escape');
 if(s.projects.some(p=>p.key==='field')){await page.locator('[data-panel-toggle="projects"]').click();await page.locator('#completed-tasks button').filter({hasText:'Cultivated field'}).first().click();await page.locator('#farm-inspect-bed').click();assert.equal(await page.locator('#farm-crop').inputValue(),'beans');await page.screenshot({path:out+'/field.png'});await page.locator('#close-farm').click();await page.keyboard.press('Escape');}
 await page.locator('#open-guide').click();await page.locator('#guide-search').fill('Resident needs');await page.locator('#guide-topics button').first().click();await page.screenshot({path:out+'/guide.png'});await page.keyboard.press('Escape');
 await page.setViewportSize({width:1280,height:720});await page.locator('.view-menu summary').click();assert(await page.getByRole('button',{name:'Copy bug report',exact:true}).isVisible());await page.locator('.view-menu summary').click();await page.screenshot({path:out+'/desktop.png'});
 await page.reload();await page.locator('#supplies [data-need]').first().waitFor();assert(restore(await page.evaluate(key=>localStorage.getItem(key),STORY_SAVE)));assert.deepEqual(errors,[]);
 await writeFile(out+'/result.json',JSON.stringify({checkedAt:new Date().toISOString(),build:actual,errors,passed:true,checks:['normal badge-area pointer click','reloadable diagnostic export','combined water/sanitation','crafting','Guide','desktop resize','save reload',...(s.projects.some(p=>p.key==='field')?['field crop retention']:[])]},null,2));console.log('PASS verified production identity, normal options clicks, diagnostics, management, Guide, desktop resize and reload');
}finally{await browser.close();}
