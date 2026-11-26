import assert from 'node:assert/strict';
import {plan,tick,PROJECTS,PROCESSES,MATERIALS,save,restore,removeProject} from '../web/v02/weekend/simulation.js';
import {physicalInventory} from '../web/v02/weekend/economy-inventory.js';
import {village,advance} from './fixtures.mjs';
const {s}=village({seed:0,emergencyFood:false});
const wood=()=>physicalInventory(s,PROJECTS,PROCESSES,MATERIALS).wood;
const total=r=>['available','reserved','processing','transit','installed'].reduce((n,k)=>n+r[k],0);
const opening=wood();assert.equal(opening.unit,'kg');
assert.equal(plan(s,'gathering',34,39),'');const p=s.projects.at(-1),mass=p.billOfMaterials.wood*4;
assert.equal(wood().available,opening.available-mass);assert.equal(wood().reserved,mass);assert.equal(total(wood()),total(opening));
let changed=false;
for(let i=0;i<96000&&p.work<PROJECTS.gathering.work;i++){
 tick(s,.1);assert.equal(total(wood()),total(opening),'construction moves ownership but cannot invent or lose timber');
 if(p.delivered>0&&!changed){assert(restore(save(s)));changed=true;}
}
assert.equal(p.work,PROJECTS.gathering.work);assert.equal(wood().reserved,0);assert.equal(wood().installed,mass);
assert.equal(removeProject(s,p.id,'salvage'),'');
advance(s,{seconds:9600,until:()=>!s.projects.some(x=>x.id===p.id)});
assert(!s.projects.some(x=>x.id===p.id));
const recovered=Math.floor(p.billOfMaterials.wood*.5)*4;
assert.equal(wood().installed,0);assert.equal(total(wood()),total(opening)-mass+recovered,'salvage loss is explicit, with no duplicate installed stock');
assert(restore(save(s)));
console.log('PASS kg ownership reconciles available → reserved → installed → salvaged through normal construction, resident work and reload');
