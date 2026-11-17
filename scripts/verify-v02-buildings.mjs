import assert from 'node:assert/strict';
import {PROJECTS,PROCESSES,createSandbox,plan,placementError,tick,save,restore,requiredLoads,enableFastNavigation,moveProject} from '../web/v02/weekend/simulation.js';
import {syncInfrastructure} from '../web/v02/weekend/infrastructure.js';
function fresh(){const s=createSandbox(42);enableFastNavigation(s);s.instantBuild=false;return s;}
function place(s,key){
 for(let radius=3;radius<=32;radius++)for(let z=s.stock.z-radius;z<=s.stock.z+radius;z++)for(let x=s.stock.x-radius;x<=s.stock.x+radius;x++){
  if(Math.max(Math.abs(x-s.stock.x),Math.abs(z-s.stock.z))!==radius||placementError(s,key,x,z))continue;
  assert.equal(plan(s,key,x,z),'');return s.projects.at(-1);
 }
 assert.fail(`${key}: no legal accessible site`);
}
function runUntil(s,seconds,done){for(let i=0;i<seconds*10&&!done();i++)tick(s,.1);return done();}
// Real shell labor now spans weeks, and crops have calendar growth. This catalog
// test covers the physical completion boundary and saved service registration;
// complete paid construction is exercised by opening and long-run regressions.
// Biological cycles, crafting, hauling and installation have dedicated tests.
const choices=Object.entries(PROJECTS).filter(([,d])=>!d.natural);
const startAt=process.argv.find(arg=>arg.startsWith('--from='))?.slice(7);
assert(!startAt||choices.some(([key])=>key===startAt),'unknown placeable building');
for(const [key,d]of choices.slice(startAt?choices.findIndex(([key])=>key===startAt):0)){
 const s=fresh(),p=place(s,key);p.work=Math.max(0,d.work-.1);p.delivered=requiredLoads(p,PROJECTS);
 assert(runUntil(s,600,()=>p.work===d.work),`${key}: a resident must finish actual construction`);
 syncInfrastructure(s,PROJECTS);
 assert(s.people.some(r=>r.work>0),`${key}: no resident supplied final labor`);
 const loaded=restore(save(s));assert(loaded,`${key}: completed building restores`);
 assert.equal(loaded.projects.find(other=>other.id===p.id).work,d.work);
 if(d.kind==='home'||key.startsWith('canvas-tent')){
  for(const r of s.people){r.energy=10;r.walk=[];r.target=null;r.job=null;r.restSite=null;}
  assert(runUntil(s,600,()=>s.people.some(r=>r.restSite===p.id&&r.tentPhase==='inside')),`${key}: residents enter to sleep`);
  assert(s.people.filter(r=>r.restSite===p.id).length<=(d.beds||2),`${key}: beds overbooked`);
  assert.match(moveProject(s,p.id,p.x+10,p.z+10),/resting/);
  const sleeping=restore(save(s));assert(sleeping,`${key}: sleeping save restores`);enableFastNavigation(sleeping);
  assert(runUntil(sleeping,600,()=>sleeping.people.every(r=>!r.tentPhase&&r.energy>=60)),`${key}: residents leave after recovery`);
 }
 console.log(`PASS ${key}: legal site, resident completion, service/save${d.kind==='home'||key.startsWith('canvas-tent')?', bounded indoor sleep and exit':''}`);
}
for(const [recipe,d]of Object.entries(PROCESSES))assert(Object.values(PROJECTS).some(p=>p.kind===d.kind),`${recipe}: compatible production site exists`);
console.log(`PASS ${choices.length} placeable building completion contracts and all recipe/site mappings; full cycles covered by dedicated production and balance checks`);
