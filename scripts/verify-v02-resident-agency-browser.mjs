import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {launchBrowser} from './browser.mjs';
import {serve} from './serve.mjs';
import {PROFILES} from '../web/v02/weekend/resident-personality.js';
import {village,advance,seedSave} from './fixtures.mjs';

// Generate the displayed memories through normal simulation, then load its save.
const {s}=village();
s.rainSeen=s.rainResolved=true;s.people[0].needs.social=5;s.people[1].needs.social=20;
advance(s,{seconds:300,until:()=>s.people.some(r=>r.mind?.memories.some(m=>m.kind==='conversation'))});
const speaker=s.people.find(r=>r.mind?.memories.some(m=>m.kind==='conversation'));
assert(speaker,'fixture conversation must really complete');
s.view={speed:1,paused:true,position:[20,35,20],target:[1,2,3],zoom:1};
const directory=process.env.SOLAR_EVIDENCE_DIR;
if(directory)await mkdir(directory,{recursive:true});
const server=await serve();let browser;
try {
 browser=await launchBrowser();
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.setDefaultTimeout(30000);
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',message=>{if(message.type()==='warning'||message.type()==='error')console.error(message.text());});
 await seedSave(page,s,{mute:false});
 await page.goto(`http://127.0.0.1:${server.address().port}/v2/?mode=story`);
 console.log('Loaded resident profile fixture');
 await page.locator('[data-panel-toggle="people"]').click();
 const detail=page.locator('#resident-detail');
 await page.waitForFunction(()=>[...document.querySelectorAll('#roster img')].every(img=>img.complete && img.naturalWidth>0),null,{timeout:180000});
 console.log('Resident portraits rendered');
 for(const r of s.people){
  await page.getByRole('button',{name:`View ${r.name}`,exact:true}).click();
  await page.getByRole('button',{name:'Story',exact:true}).click();
  const text=await detail.innerText();
  for(const key of ['backstory','desire','motivation','fear','flaw','boundary','growth'])assert(text.includes(PROFILES[r.id][key]),`${r.name}: ${key}`);
  await detail.getByRole('heading',{name:'Room to grow',exact:true}).scrollIntoViewIfNeeded();
  assert(await detail.getByText(PROFILES[r.id].growth,{exact:true}).isVisible(),'long story can be reached');
  await detail.getByRole('heading',{name:r.name,exact:true}).scrollIntoViewIfNeeded();
  if(directory && r.id==='bento')await page.screenshot({path:path.join(directory,'bento-story.png')});
  await page.getByRole('button',{name:'Overview',exact:true}).click();
  assert((await detail.innerText()).includes(PROFILES[r.id].aspiration.label));
  assert((await detail.innerText()).includes('On my mind'));
 }
 await page.getByRole('button',{name:`View ${speaker.name}`,exact:true}).click();
 assert((await detail.innerText()).includes(speaker.mind.memories[0].text),'saved simulation memory is visible');
 if(directory){
  await page.screenshot({path:path.join(directory,'resident-overview.png')});
  await detail.getByRole('heading',{name:'Recent memories',exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(directory,'resident-memories.png')});
  await detail.getByRole('heading',{name:speaker.name,exact:true}).scrollIntoViewIfNeeded();
 }
 await page.getByRole('button',{name:'Relationships',exact:true}).click();
 assert.equal(await detail.locator('.relationship-row').count(),4);
 assert((await detail.innerText()).includes(speaker.mind.memories.find(m=>m.other).text));
 if(directory)await page.screenshot({path:path.join(directory,'resident-relationships.png')});
 // Smaller desktop windows retain all four tabs and scrolling profile content.
 await page.setViewportSize({width:1000,height:750});
 await page.getByRole('button',{name:'Story',exact:true}).click();
 await detail.getByRole('heading',{name:'Room to grow',exact:true}).scrollIntoViewIfNeeded();
 assert(await detail.getByText(PROFILES[speaker.id].growth,{exact:true}).isVisible());
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal page overflow');
 await page.getByRole('button',{name:'Close residents',exact:true}).click();
 assert(!await page.locator('#people').isVisible());
 assert.deepEqual(errors,[]);
 console.log('PASS desktop resident profiles: all five stories, hopes, current thoughts, real saved memories, relationship context, scrolling, tabs and close control; no browser exceptions');
} catch(error){console.error(error);throw error;} finally {await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
