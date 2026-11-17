import assert from 'node:assert/strict';
import {productionLoad,HAND_LOAD} from '../web/v02/weekend/production-hauling.js';
import {materialMass,materialMeasure} from '../web/v02/weekend/material-measures.js';
import {createWeekend,chooseCamp,PROJECTS,PROCESSES,tick,save,restore,enableFastNavigation,materialCount} from '../web/v02/weekend/simulation.js';
import {syncInfrastructure} from '../web/v02/weekend/infrastructure.js';
import {inventoryOwnership} from '../web/v02/weekend/economy-inventory.js';
import {MATERIALS} from '../web/v02/weekend/simulation.js';
for(const items of [{logs:12},{stone:8},{wood:20,planks:12}]){
 const load=productionLoad(items);assert(materialMass(load)<=HAND_LOAD.kg);
 assert(Object.entries(load).reduce((v,[id,n])=>v+materialMeasure(id).m3*n,0)<=HAND_LOAD.m3+1e-8);
}
let s=createWeekend(42);chooseCamp(s,'entrance');enableFastNavigation(s);
const site={id:s.nextId++,key:'supply-0',x:s.stock.x+6,z:s.stock.z+4,work:PROJECTS['supply-0'].work,delivered:0};
s.projects.push(site);syncInfrastructure(s,PROJECTS);
const op={id:1,site:site.id,recipe:'wood',phase:'return',work:PROCESSES.wood.work};s.operations=[op];s.nextOperation=2;
const initial=materialCount(s,'logs');let partial=false,previous=initial,legs=0;
for(let i=0;i<64000&&!s.operations[0].done;i++){
 tick(s,.1);const now=materialCount(s,'logs');
 if(now>previous){assert(now-previous<=5,'at most five 6 kg logs per journey');legs++;previous=now;}
 const job=s.operations[0];
 if(job.haulRemaining&&job.returningToSite&&!partial){
  assert.equal(now+inventoryOwnership(s,PROJECTS,PROCESSES,MATERIALS).rows.logs.processing,initial+12);
  const loaded=restore(save(s));assert(loaded,'partially delivered batch survives reload');s=loaded;enableFastNavigation(s);partial=true;
 }
}
assert(partial);assert(s.operations[0].done);assert.equal(materialCount(s,'logs'),initial+12);assert.equal(legs,3);
const invalid=JSON.parse(save(s));invalid.operations[0].haulRemaining.logs=13;assert.equal(restore(JSON.stringify(invalid)),null);
console.log('PASS bounded hand loads, three physical timber trips, partial-load ownership, reload and exact settlement');
