import {startEmptySandbox} from './lib/empty-sandbox.mjs';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import init,{Game} from '../web/pkg/solar_friends.js';
import {makeScenario} from '../web/dev/scenarios.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const output='artifacts/skills';await mkdir(output,{recursive:true});
const g=new Game(),snap=()=>JSON.parse(g.snapshot()),fresh=snap();
assert.equal(fresh.village.version,28);assert(fresh.village.skills.enabled);
assert(g.restore(await readFile(new URL('../web/artwork/village-preview.json',import.meta.url),'utf8')));
assert(g.restore(JSON.stringify(makeScenario('farming',fresh,snap()))));g.set_resident_learning(true);
assert.equal(g.place('garden',20,15),'ok');assert.equal(g.set_production_target(6,snap().environment.economy.materials[6].stored+2),'ok');assert(g.set_resident_job(4,true));
const before=g.snapshot();g.skills_report();assert.equal(g.snapshot(),before);
await writeFile(output+'/before.json',before);
const days=[];
for(let tick=0;tick<14*1920;tick++){
 g.tick(.25);if(tick%1920)continue;
 const s=snap();for(const p of s.village.skills.people){assert(p.experience.every(n=>n>=0&&n<=160));assert(p.today.every(n=>n<=6));assert(p.today.reduce((a,b)=>a+b)<=12);}
 const saved=g.snapshot(),copy=new Game();assert(copy.restore(saved));assert.equal(copy.snapshot(),saved);
 for(let i=0;i<4;i++){g.tick(.25);copy.tick(.25);}assert.equal(copy.snapshot(),g.snapshot());copy.free();
 assert(JSON.parse(g.simulation_report()).materials.every(m=>m.difference===0));
 days.push({minutes:s.village.minutes,people:s.village.skills.people});
}
await writeFile(output+'/earned.json',g.snapshot());
const learned=snap(),xp=learned.village.skills.people.map(p=>p.experience),report=JSON.parse(g.skills_report());
for(const domain of [0,1,2,3,4,5])assert(xp.some(p=>p[domain]>0),`Useful completed work teaches domain ${domain}`);
assert(report.people.some(p=>p.skills.some(s=>s.level>0)),'Normal village work gradually changes an actual skill level');
assert(learned.village.buildings.at(-1).progress>=100,'Learning accompanies completed construction');
assert(learned.village.economy.work_day[4]>=0,'Outside-job experience follows a real paid shift');
g.set_resident_learning(false);for(let tick=0;tick<1920;tick++)g.tick(.25);
assert.deepEqual(snap().village.skills.people.map(p=>p.experience),xp,'Pausing never deletes or grants experience');
assert(JSON.parse(g.skills_report()).people.every(p=>p.skills.every(s=>s.bonus_percent===0)));
g.set_resident_learning(true);assert.deepEqual(snap().village.skills.people.map(p=>p.experience),xp);
let baselineMinutes=0;
if(process.env.SOLAR_SKILLS_BASELINE){
 const base=pathToFileURL(path.resolve(process.env.SOLAR_SKILLS_BASELINE)+'/');const {default:oldInit,Game:OldGame}=await import(new URL('solar_friends.js',base));await oldInit({module_or_path:await readFile(new URL('solar_friends_bg.wasm',base))});
 const old=new OldGame(),current=new Game();startEmptySandbox(old);startEmptySandbox(current);
 for(const [kind,x,y]of [['home',6,6],['solar_farm',12,6],['workshop',18,12]]){assert.equal(old.place(kind,x,y),'ok');assert.equal(current.place(kind,x,y),'ok');}
 for(let tick=0;tick<1920;tick++){old.tick(.25);current.tick(.25);}
 const previous=JSON.parse(old.snapshot()),now=JSON.parse(current.snapshot());delete now.village.skills;delete now.environment.skills;delete now.village.market;delete now.environment.economy.market;for(const m of now.environment.economy.materials)delete m.sell_price;for(const o of now.village.economy.orders)delete o.terms;for(const b of now.village.production.batches)delete b.contributors;now.village.version=previous.village.version;
 assert.deepEqual(now,previous,'Sandbox without learning preserves one day of the parent simulation apart from additive skill metadata');baselineMinutes=1440;old.free();current.free();
}
await writeFile(output+'/after.json',g.snapshot());await writeFile(output+'/report.json',JSON.stringify({days:14,baselineMinutes,experience:xp,report,daysObserved:days},null,2));
g.free();console.log('PASS: useful work in six domains, bounded daily practice, natural level growth, completed construction and paid outside shifts, exact daily continuation, read-only reports and paused-learning preservation'+(baselineMinutes?'; one day of disabled Sandbox parity.':'.'));
