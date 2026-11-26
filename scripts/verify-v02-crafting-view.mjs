import assert from 'node:assert/strict';
import {PROCESSES,queueProduction,productionBlocker} from '../web/v02/weekend/simulation.js';
import {village} from './fixtures.mjs';
import {craftSkills} from '../web/v02/weekend/crafting.js';
import {craftEntries,chosenWorkspace,recipeStatus,craftJobStatus} from '../web/v02/weekend/crafting-view.js';
function fixture() {
 const {s,sites}=village({sandbox:true,story:true,fast:false,wood:20,materials:{planks:20,hardware:10,tool_heads:3,bamboo:8,wheel_kit:1,'carpentry-tools':1,'garden-tools':1,repair_supplies:2},buildings:[40,44].map(x=>({key:'supply-5',x,z:39}))});
 s.equipment={wear:{'garden-tools':900},loans:{},soapLeft:0};return {s,sites};
}
function blocked(change,recipe='craft_garden-tools',pattern) {
 const {s,sites}=fixture();change(s,sites);
 const before=JSON.stringify(s.materials),wood=s.wood;
 assert.match(recipeStatus(s,recipe,sites[0]),pattern);
 assert(productionBlocker(s,sites[0].id,recipe));
 assert(queueProduction(s,sites[0].id,recipe));
 assert.equal(JSON.stringify(s.materials),before);assert.equal(s.wood,wood);
}
blocked(s=>{s.materials.tool_heads=0;},undefined,/tool heads/i);
blocked(s=>{for(const r of s.people)craftSkills(r).woodworking=0;},undefined,/level 1/);
blocked(s=>{s.materials['carpentry-tools']=0;},undefined,/tools/);
blocked((s,sites)=>{s.infrastructure.nodes[sites[0].id].enabled=false;},undefined,/switched off/);
blocked((s,sites)=>{assert.equal(queueProduction(s,sites[0].id,'craft_produce-crates'),'');},undefined,/already has a job/);
blocked(s=>{s.equipment.loans.bento={item:'garden-tools',task:'job:1'};},'repair_garden-tools',/Return borrowed/);
blocked(s=>{s.equipment.wear['garden-tools']=0;},'repair_garden-tools',/does not need repair/);
blocked((s,sites)=>{assert.equal(queueProduction(s,sites[1].id,'repair_garden-tools'),'');},'repair_garden-tools',/repair queued/);
const {s,sites}=fixture(),recipe=PROCESSES['craft_garden-tools'];
s.infrastructure.nodes[sites[0].id].enabled=false;
assert.equal(chosenWorkspace(s,recipe)?.id,sites[1].id,'prefer enabled idle workspace');
assert.equal(chosenWorkspace(s,recipe,sites[0].id)?.id,sites[0].id,'retain explicit choice even when blocked');
s.infrastructure.nodes[sites[0].id].enabled=true;
assert.equal(queueProduction(s,sites[0].id,'craft_garden-tools'),'');
assert.equal(chosenWorkspace(s,recipe)?.id,sites[1].id,'prefer idle workspace over busy');
assert.equal(craftEntries(s,'repair')[0].recipe.equipmentRepair,'garden-tools');
assert.equal(craftEntries(s,'make').length,4);
assert.equal(craftEntries(s,'jobs').length,1);
s.operations[0].phase='return';
assert.equal(craftJobStatus(s,s.operations[0]).state,'Delivering');
s.operations[0].done=true;assert.equal(craftEntries(s,'jobs').length,0);
s.projects=[];
assert.equal(chosenWorkspace(s,recipe),undefined);
assert.match(recipeStatus(s,'craft_garden-tools',undefined),/Build a timber workbench/);
for(const entry of craftEntries(s,'repair'))s.materials[entry.recipe.equipmentRepair]=0;
assert.equal(craftEntries(s,'repair').length,0);
console.log('PASS crafting readiness matches queue failures without spending; default/explicit workspace choice, owned repairs, job delivery and empty states.');
