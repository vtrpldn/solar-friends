import {enableFastNavigation} from '../web/v02/weekend/simulation.js';
import assert from 'node:assert/strict';
import {PROJECTS,PROCESSES,queueProduction,tick,save,restore,moveCraftJob} from '../web/v02/weekend/simulation.js';
import {syncInfrastructure} from '../web/v02/weekend/infrastructure.js';
import {craftSkills,skillLevel,craftStage} from '../web/v02/weekend/crafting.js';
import {equipmentState,EQUIPMENT_LIFE} from '../web/v02/weekend/equipment.js';
import {village,addSite,advance} from './fixtures.mjs';
function fixture(kind='supply-5'){
 const {s,sites:[p]}=village({sandbox:true,story:true,emergencyFood:false,wood:20,zero:true,materials:{planks:12,hardware:5,wheel_kit:1,bamboo:8,tool_heads:2,meals:150,'carpentry-tools':1,repair_supplies:2},buildings:[{key:kind,x:40,z:39}]});
 return {s,p};
}
const {s,p}=fixture();
assert.match(queueProduction(s,p.id,'craft_wheelbarrow'),/compatible/);
s.materials['carpentry-tools']=0;
assert.match(queueProduction(s,p.id,'craft_produce-crates'),/tools/);
s.materials['carpentry-tools']=1;s.materials.planks=0;
assert.match(queueProduction(s,p.id,'craft_produce-crates'),/Missing/);
assert.equal(s.operations?.length||0,0);
const advanced=fixture('workshop');
for(const r of advanced.s.people)craftSkills(r).woodworking=0;
assert.match(queueProduction(advanced.s,advanced.p.id,'craft_wheelbarrow'),/level 2/);
craftSkills(advanced.s.people[1]).woodworking=14400;
assert.equal(queueProduction(advanced.s,advanced.p.id,'craft_wheelbarrow'),'');
let world=restore(save(advanced.s));assert(world);
const startXp=craftSkills(world.people[1]).woodworking;
const stages=new Set();let progressSaved=false;
for(let i=0;i<4000&&!world.operations[0].done;i++){
 enableFastNavigation(world);tick(world,1);const op=world.operations[0];
 if(op.work>0)assert.equal(op.crafter,'bento','only qualified resident performs skilled assembly');
 if(op.phase!=='return'&&!op.done)assert.equal(world.materials.wheelbarrow,0,'unfinished work is not inventory');
 if(op.work>0)stages.add(craftStage(PROCESSES[op.recipe],op.work));
 if(op.work>30&&!progressSaved){world=restore(save(world));assert(world);progressSaved=true;}
}
assert(world.operations[0].done,JSON.stringify(world.operations));
assert.equal(world.materials.wheelbarrow,1);assert.equal(world.materials.wheel_kit,0);
assert(craftSkills(world.people[1]).woodworking>startXp);
assert.equal(craftSkills(world.people[0]).woodworking,0,'unqualified resident did not gain craft experience');
assert.equal(stages.size,3);
assert.equal(restore(save(world)).materials.wheelbarrow,1);
const interrupted=fixture();
assert.equal(queueProduction(interrupted.s,interrupted.p.id,'craft_garden-tools'),'');
equipmentState(interrupted.s).wear['carpentry-tools']=EQUIPMENT_LIFE;
advance(interrupted.s,{seconds:10});
assert.equal(interrupted.s.operations[0].work,0,'worn required tools stop crafting');
assert.equal(interrupted.s.materials['garden-tools'],0);
assert(interrupted.s.operations[0].status.includes('repair'));
const migrated=fixture();
migrated.s.operations=[{id:1,site:migrated.p.id,recipe:'craft_wheelbarrow',work:10,phase:'process',done:false}];
advance(migrated.s,{seconds:1});
assert.equal(migrated.s.operations[0].work,10,'legacy job cannot assemble at the wrong workspace');
const workshop=addSite(migrated.s,'workshop',{x:40,z:40});syncInfrastructure(migrated.s,PROJECTS);
assert.equal(moveCraftJob(migrated.s,1,workshop.id),'');assert.equal(migrated.s.operations[0].work,10,'transfer preserves unfinished work');
const invalid=JSON.parse(save(world));invalid.people[0].craftSkills.woodworking=-1;assert.equal(restore(JSON.stringify(invalid)),null);
assert.equal(skillLevel({id:'bento'},'woodworking'),2);
console.log('PASS: skill, material, tool and building gates; qualified-worker assembly; three stages; physical output delivery; skill practice; in-progress save/resume; worn-tool pause and legacy workspace transfer.');
