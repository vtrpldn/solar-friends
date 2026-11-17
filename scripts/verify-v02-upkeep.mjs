import assert from 'node:assert/strict';
import {createWeekend,chooseCamp,PROJECTS,MATERIALS,tick,save,restore,enableFastNavigation} from '../web/v02/weekend/simulation.js';
import {upkeep,upkeepStep,recordVehicleDistance,serviceFactor} from '../web/v02/weekend/asset-upkeep.js';
import {GAME_DAY} from '../web/v02/weekend/biological-production.js';
const s=createWeekend(42);chooseCamp(s,'entrance');enableFastNavigation(s);
const p={id:s.nextId++,key:'workshop',x:s.stock.x+4,z:s.stock.z+4,work:PROJECTS.workshop.work,delivered:0,condition:69};s.projects.push(p);
const before={tools:s.materials.tools,hardware:s.materials.hardware};
upkeepStep(s,PROJECTS,.1);assert.equal(upkeep(s).jobs.length,1);
assert(restore(save(s)),'queued service save');
for(let i=0;i<12000&&p.condition<99;i++)tick(s,.1);
assert(p.condition>99,'residents perform service');
assert.equal(s.materials.tools,before.tools-1);assert.equal(s.materials.hardware,before.hardware-1);
assert(restore(save(s)),'completed service restores');
recordVehicleDistance(s,0,5001);upkeepStep(s,PROJECTS,0);assert(s.upkeep.jobs.some(j=>j.vehicle===0));
assert(serviceFactor({condition:20})<serviceFactor({condition:100}));
const denied=createWeekend(43);chooseCamp(denied,'entrance');denied.projects.push({...p,id:denied.nextId++,condition:60});upkeep(denied).dailyBudget=0;
for(let i=0;i<100;i++)tick(denied,.1);assert.equal(denied.materials.tools,4,'budget prevents material consumption');
const bad=JSON.parse(save(s));bad.upkeep.vehicles[0].condition=-1;assert.equal(restore(JSON.stringify(bad)),null);
console.log('PASS wear, automatic resident service, exact parts consumption, budget limits, vehicle mileage and save validation');
const aged=createWeekend(45);chooseCamp(aged,'entrance');enableFastNavigation(aged);
const pump={id:aged.nextId++,key:'water-pump',x:aged.stock.x+4,z:aged.stock.z+4,work:PROJECTS['water-pump'].work,delivered:0,assetAgeDays:3650};aged.projects.push(pump);aged.materials.pumps=1;aged.materials.plumbing=1;upkeep(aged).dailyBudget=500;
upkeepStep(aged,PROJECTS,.1);assert(aged.upkeep.jobs.some(j=>j.replacementParts?.pumps===1));assert(restore(save(aged)));
for(let i=0;i<180000&&pump.assetAgeDays>=3650;i++)tick(aged,.1);
assert(pump.assetAgeDays<3650,'residents replace aged pump');assert.equal(aged.materials.pumps,0);assert.equal(aged.materials.plumbing,0);assert(restore(save(aged)));
console.log('PASS lifetime equipment replacement consumes real parts and resident labor, with persistent age');

// An unaffordable roof/battery replacement must not starve livestock or block
// unrelated affordable repairs behind it in the queue.
{
 const village=createWeekend();chooseCamp(village,'entrance');
 const target={id:900,key:'coop',x:10,z:10,work:PROJECTS.coop.work,delivered:0,animalHealth:50};village.projects.push(target);
 const u=upkeep(village);u.jobs=[{target:900,battery:true,work:0,partsPaid:false,done:false},{target:900,care:'coop',work:0,partsPaid:false,done:false}];
 village.materials.fodder=2;village.materials.batteries=0;
 const resident=village.people[0];
 const {performUpkeep}=await import('../web/v02/weekend/asset-upkeep.js');
 performUpkeep(village,resident,1,()=>true,(_s,id,n)=>{village.materials[id]+=n;},MATERIALS,()=>({x:0,z:0}),()=>true,()=>({x:0,z:0}));
 assert.equal(u.jobs[0].partsPaid,false);assert.match(u.jobs[0].status,/Needs/);
 assert.equal(u.jobs[1].partsPaid,true);assert.equal(village.materials.fodder,1);
 assert.equal(resident.action,'service');
 console.log('PASS blocked replacement does not prevent affordable animal care');
}
