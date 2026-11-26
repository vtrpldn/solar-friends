import assert from 'node:assert/strict';
import {plan,PROJECTS,PROCESSES,MATERIALS,queueProduction,save,restore,tick} from '../web/v02/weekend/simulation.js';
import {inventoryOwnership} from '../web/v02/weekend/economy-inventory.js';
import {removalYield} from '../web/v02/weekend/building-lifecycle.js';
import {village,advance} from './fixtures.mjs';
// Focused accounting fixture; real blueprint procurement and resident assembly.
const {s}=village({materials:{seedlings:2}});
assert.equal(plan(s,'garden',34,39),'');const p=s.projects.at(-1);advance(s,{seconds:9600,until:()=>p.work>=PROJECTS.garden.work});assert.equal(p.work,PROJECTS.garden.work);tick(s,.1);
assert(restore(save(s)),'completed garden restores before planting');s.materials.seedlings=0;
assert(p.cultivation.beds.every(b=>b.stage==='unprepared'&&b.growth===0),'new beds do not grant a planting or harvest');
assert.match(queueProduction(s,p.id,'vegetables'),/cultivation beds/);
// Reconstruct the pre-cultivation save contract: its already queued legacy
// recipe must retain paid starter seeds and finish under the old accounting.
delete p.cultivation;
const seeds=()=>inventoryOwnership(s,PROJECTS,PROCESSES,MATERIALS).rows.seedlings;
assert.equal(seeds().installed,2);
assert.equal(queueProduction(s,p.id,'vegetables'),'');assert.equal(s.materials.seedlings,0);
assert.equal(seeds().installed,0);assert.equal(seeds().processing,2);
assert.match(queueProduction(s,p.id,'vegetables'),/already has a job/);
assert.equal(seeds().processing,2);
assert.equal(restore(save(s)).projects.find(x=>x.id===p.id).starterSeedlingsUsed,true);
assert.equal(removalYield(p,PROJECTS,PROCESSES,'salvage').recovered.seedlings,0);
s.operations.find(o=>o.recipe==='vegetables').done=true;
assert.match(queueProduction(s,p.id,'vegetables'),/Missing/);
s.materials.seedlings=2;assert.equal(queueProduction(s,p.id,'vegetables'),'');assert.equal(s.materials.seedlings,0);
const old={...p,starterSeedlingsUsed:undefined,harvestCount:1};s.projects[s.projects.indexOf(p)]=old;s.operations.forEach(o=>o.done=true);
assert.match(queueProduction(s,old.id,'vegetables'),/Missing/);
s.operations.forEach(o=>o.done=true);tick(s,.1);assert(old.cultivation,'legacy beds migrate after their last job finishes');assert(old.cultivation.beds.every(b=>b.stage==='unprepared'));
console.log('PASS legacy first planting consumes paid seeds once; reload, repeated orders, later cycles and salvage conserve stock');
