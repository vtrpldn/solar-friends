import {transportCost} from '../web/v02/weekend/physical-trade.js';
import {enableFastNavigation} from '../web/v02/weekend/simulation.js';
import { syncInfrastructure } from '../web/v02/weekend/infrastructure.js';
import assert from 'node:assert/strict';
import { ITEMS } from '../web/v02/weekend/items.js';
import { PROCESSES } from '../web/v02/weekend/catalog-rules.js';
import { createSandbox, createWeekend, chooseCamp, PROJECTS, MATERIALS, placementError, plan, requiredLoads, supplyRun, tick, queueProduction, save, restore } from '../web/v02/weekend/simulation.js';
import { RESOURCE_GROUPS } from '../web/v02/weekend/resource-groups.js';
for (const id of Object.keys(ITEMS)) {
  assert(!PROJECTS[id], `${id} is not a building`);
  assert(MATERIALS[id].item);
  assert(RESOURCE_GROUPS.find(g => g.name === 'Items & equipment').ids.includes(id));
  assert.equal(plan(createSandbox(42), id, 40, 40), 'Unknown project.');
}
assert(!PROCESSES['craft_watering-can']);
assert(!PROCESSES.craft_bicycle);
let s = createSandbox(42); s.mode='story'; s.wood=0; for(const key of Object.keys(s.materials))s.materials[key]=0; s.materials.meals=20; s.emergencyFood=false;
s.materials['watering-can'] = 0; s.money = 100;
assert(supplyRun(s,'watering-can'));
assert.equal(s.money,100-MATERIALS['watering-can'].price-transportCost(s));
assert.equal(s.materials['watering-can'],0,'purchase awaits resident delivery');
s = restore(save(s)); assert(s);enableFastNavigation(s);
for(let i=0;i<5000 && s.trip;i++)tick(s,.1);
assert.equal(s.trip,null);
assert.equal(s.materials['watering-can'],1);
assert.equal(restore(save(s)).materials['watering-can'],1);
for (const id of ['wheelbarrow','produce-crates']) {
  const state = createSandbox(42); state.mode='story'; state.emergencyFood=false;
  for (const key of Object.keys(state.materials)) state.materials[key]=0;
  state.wood=30; state.materials.planks=20; state.materials.wheel_kit=2; state.materials.meals=100;
  const kind=PROCESSES[`craft_${id}`].kind;
  state.materials['carpentry-tools']=1;
  let location;
  for(let z=35;z<55&&!location;z++)for(let x=35;x<55&&!location;x++)if(!placementError(state,kind,x,z))location={x,z};
  assert(location,'a legal crafting workspace exists');
  const p = {id:state.nextId++,key:kind,...location,work:PROJECTS[kind].work,delivered:requiredLoads(kind)};
  state.projects.push(p); syncInfrastructure(state,PROJECTS);
  state.materials[id]=0;
  const recipe = PROCESSES[`craft_${id}`];
  const before=state.materials.planks;
  state.materials.hardware=0;
  assert.match(queueProduction(state,p.id,`craft_${id}`),/Missing/);
  assert.equal(state.materials.planks,before,'failed recipe reserves nothing');
  state.materials.hardware=10;
  assert.equal(queueProduction(state,p.id,`craft_${id}`),'');
  assert.equal(state.materials.planks,before-recipe.input.planks);
  assert.equal(state.materials[id],0,'crafting requires resident work and delivery');
  let loaded=restore(save(state)); assert(loaded);enableFastNavigation(loaded);
  for(let i=0;i<4000 && !loaded.operations[0].done;i++)tick(loaded,1);
  assert(loaded.operations[0].done,JSON.stringify(loaded.operations));
  assert.equal(loaded.materials[id],1);
  assert.equal(restore(save(loaded)).materials[id],1);
}
const legacy=createWeekend(42); legacy.arrivalElapsed=17; chooseCamp(legacy,'clearing');
for(const id of ['watering-can','wheelbarrow','bicycle','produce-crates']) {
  delete legacy.materials[id];
  legacy.projects.push({id:legacy.nextId++,key:id,x:40,z:40,work:110,delivered:2});
}
const migrated=restore(save(legacy)); assert(migrated);
for(const id of ['watering-can','wheelbarrow','bicycle','produce-crates']) {
  assert.equal(migrated.materials[id],1);
  assert(!migrated.projects.some(p=>p.key===id));
  assert.equal(restore(save(migrated)).materials[id],1,'migration runs only once');
}
console.log('PASS: items excluded from construction; paid town delivery; resident crafting, ingredient checks and save/reload; legacy items retained exactly once.');

const unfinished=createWeekend(42); unfinished.arrivalElapsed=17; chooseCamp(unfinished,'clearing');
const oldId=unfinished.nextId++;
unfinished.projects.push({id:oldId,key:'watering-can',x:40,z:40,work:0,delivered:0,pendingMaterials:{wood:4,hardware:1}});
unfinished.trip={person:unfinished.people[0].id,material:'wood',project:oldId,projects:[oldId],phase:'boarding',vehicle:0,left:55,duration:55};
const oldWood=unfinished.wood, oldHardware=unfinished.materials.hardware;
const refunded=restore(save(unfinished)); assert(refunded);
assert.equal(refunded.trip,null);
assert.equal(refunded.wood,oldWood+4);
assert.equal(refunded.materials.hardware,oldHardware+1);
assert.equal(refunded.materials['watering-can'],0,'unfinished construction is refunded, not completed for free');
assert.equal(restore(save(refunded)).wood,refunded.wood,'refund runs only once');
console.log('PASS: unfinished legacy item project refunds reserved/prepaid supplies and removes its obsolete pickup order.');
