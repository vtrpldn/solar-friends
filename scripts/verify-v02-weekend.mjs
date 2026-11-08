import assert from 'node:assert/strict';
import {createWeekend,chooseCamp,plan,tick,finished,canFinish,endWeekend,supplyRun,resolveRain,moveProject,save,restore,route} from '../web/v02/weekend/simulation.js';
function run(s,seconds){for(let i=0;i<seconds*10;i++)tick(s,.1);}
for(const camp of ['shade','entrance','clearing']){
 const s=createWeekend();assert(chooseCamp(s,camp));assert.equal(plan(s,'gathering',29,30),'');assert.equal(plan(s,'shelter',34,32),'');assert.equal(s.wood,4);assert.equal(s.money,170);
 run(s,420);assert(finished(s,'gathering'),`${camp} gathering stalls`);assert(finished(s,'shelter'),`${camp} shelter stalls`);assert(s.people.every(r=>r.energy>=0&&r.energy<=100));
 if(camp==='entrance'){assert(!canFinish(s));assert(resolveRain(s,'move'));}assert(canFinish(s));assert(endWeekend(s));run(s,60);assert(s.people.every(r=>r.action==='meal'));assert(restore(save(s)));
}
const s=createWeekend();assert(!plan(s,'water',30,30).includes('Unknown'));chooseCamp(s,'shade');assert.equal(plan(s,'gathering',30,30),'');assert(plan(s,'shelter',31,31));assert(plan(s,'shelter',19,30));assert(plan(s,'gathering',35,35));assert.equal(plan(s,'water',35,35),'');assert(supplyRun(s));assert(!supplyRun(s));run(s,60);assert.equal(s.wood,23);assert(!s.trip);assert.equal(s.money,105);assert.equal(moveProject(s,1,28,33),'');run(s,360);assert(finished(s,'gathering'));assert(finished(s,'water'));assert.equal(plan(s,'toilet',39,30),'');run(s,240);assert(finished(s,'toilet'));assert.equal(plan(s,'shelter',40,36),'');run(s,300);assert(finished(s,'shelter'));assert(s.people.some(r=>r.work>0));
const path=route(s,{x:28,z:30},{x:33,z:35});assert(path&&path.every(v=>!s.projects.some(p=>v.x>=p.x&&v.x<p.x+2&&v.z>=p.z&&v.z<p.z+2)));
const bad=JSON.parse(save(s));bad.projects[0].work=-1;assert.equal(restore(JSON.stringify(bad)),null);assert.equal(restore('{broken'),null);const loaded=restore(save(s));assert(loaded);assert.equal(loaded.money,s.money);assert.equal(loaded.projects.length,4);
console.log('PASS: three camp playthroughs, rain choices, supply trip accounting, all four projects, relocation, obstacle paths, energy bounds, evening and save validation.');
