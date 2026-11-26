// check-tier: soak
import assert from 'node:assert/strict';
import {enableFastNavigation,PROJECTS,PROCESSES,tick,save,restore} from '../web/v02/weekend/simulation.js';
import {foodPolicy} from '../web/v02/weekend/food-policy.js';
import {ensureFoodStorage,foodChange} from '../web/v02/weekend/food-storage.js';
import {syncInfrastructure} from '../web/v02/weekend/infrastructure.js';
import {materialReconciliation} from '../web/v02/weekend/material-ledger.js';
import {village} from './fixtures.mjs';
// Established-kitchen diagnostic: finite starting supplies, real jobs and travel.
let s=village().s;ensureFoodStorage(s);foodPolicy(s).automatic=true;
foodChange(s,'food',80);foodChange(s,'greens',8);
const p={id:s.nextId++,key:'kitchen',x:s.stock.x+3,z:s.stock.z+3,rotation:0,work:PROJECTS.kitchen.work,delivered:0};s.projects.push(p);
const sys=syncInfrastructure(s,PROJECTS);sys.nodes[p.id].water[0]=sys.nodes[p.id].capacity[0];sys.biogas=20;s.rainSeen=s.rainResolved=true;
let completed=new Set(),starved=0;
for(let day=1;day<=3;day++){
 while(s.time<day*3200-.05){tick(s,.1);for(const op of s.operations||[])if(op.done&&PROCESSES[op.recipe]?.kind==='kitchen')completed.add(op.id);if(s.people.some(r=>r.needs.hunger<5))starved+=.1;}
 assert.deepEqual(materialReconciliation(s),{});assert(s.money>=0);assert(Object.values(s.materials).every(n=>n>=-1e-8));
 const reloaded=restore(save(s));assert(reloaded,`save at day ${day}`);s=reloaded;enableFastNavigation(s);
 console.log(`Food policy day ${day}: ${completed.size} kitchen batches, ${s.materials.food} ingredients, ${s.materials.meals} meals, R$${s.money.toFixed(2)}`);
}
assert(completed.size>0,'residents must finish kitchen jobs');assert(starved<120,'no sustained severe hunger in supplied kitchen fixture');
console.log(`PASS three-day managed-kitchen simulation, completed work, inventory reconciliation, reload and finite cash; severe hunger ${starved.toFixed(1)} seconds`);
