import assert from 'node:assert/strict';
import {createWeekend,chooseCamp,plan,tick,PROJECTS,requiredLoads,save,restore,prioritize} from '../web/v02/weekend/simulation.js';
import {crewLimit,carriedLoads} from '../web/v02/weekend/construction-logistics.js';
const s=createWeekend();chooseCamp(s,'clearing');
s.wood=200;for(const k of Object.keys(s.materials))s.materials[k]=50;
assert.equal(plan(s,'covered-stores',40,39),'');
const depot=s.projects[0];depot.delivered=requiredLoads(depot.key);depot.work=PROJECTS[depot.key].work;
assert.equal(plan(s,'shelter',43,40),'');
const project=s.projects[1];let staged=false,batched=false,reloaded=false;
for(let step=0;step<25000 && project.work<PROJECTS[project.key].work;step++) {
 tick(s,.1);
 const cargo=s.people.filter(r=>r.job===project.id).reduce((n,r)=>n+carriedLoads(r),0);
 assert(project.delivered+(project.staged||0)+cargo<=requiredLoads(project.key),'reserved loads must never duplicate');
 staged ||= project.staged>0;batched ||= s.people.some(r=>r.haulLoads>1);
 if(!reloaded && project.staged>0){assert(restore(save(s)),'staged inventory survives saving');reloaded=true;}
}
assert(staged,'storage must receive physical deliveries');assert(batched,'storage uses consolidated loads');
assert.equal(project.work,PROJECTS[project.key].work,'project must finish');
assert(crewLimit(PROJECTS.gathering)<crewLimit(PROJECTS.shelter));
const carrier={job:project.id,cargo:true};const builder={job:project.id,cargo:false,walk:[{}]};s.people=[carrier,builder];prioritize(s,project.id);assert.equal(carrier.job,project.id);assert.equal(builder.job,null);
console.log('PASS physical staging, batched hauling, material conservation, save restoration, completion and safe priority reassignment.');
