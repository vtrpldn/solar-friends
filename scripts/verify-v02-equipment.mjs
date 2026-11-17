import {enableFastNavigation} from '../web/v02/weekend/simulation.js';
import assert from 'node:assert/strict';
import {useEquipment,releaseEquipment,equipmentSummary,equipmentState,EQUIPMENT_LIFE} from '../web/v02/weekend/equipment.js';
import {createSandbox,PROJECTS,requiredLoads,tick,save,restore,queueProduction,sellMaterial} from '../web/v02/weekend/simulation.js';
import {syncInfrastructure} from '../web/v02/weekend/infrastructure.js';
import {salePreview,economyPolicies} from '../web/v02/weekend/economy-policies.js';
import {MATERIALS,PROCESSES,materialCount} from '../web/v02/weekend/simulation.js';
function fresh() {
 const s=createSandbox(42);s.mode='story';s.emergencyFood=false;s.wood=30;
 for(const key of Object.keys(s.materials))s.materials[key]=0;
 s.materials.meals=100; s.materials.repair_supplies=5;
 enableFastNavigation(s);return s;
}
const s=fresh(), [a,b]=s.people;
s.materials['carpentry-tools']=1;
const p={id:s.nextId++,key:'supply-5',x:40,z:39,work:0,delivered:requiredLoads('supply-5')};s.projects.push(p);
a.job=b.job=p.id;a.action=b.action='build';
assert.equal(useEquipment(s,a,'carpentry-tools',`job:${p.id}`,1,90),1.25);
assert.equal(useEquipment(s,b,'carpentry-tools',`job:${p.id}`,1,90),1,'one item cannot serve two residents');
assert.equal(s.materials['carpentry-tools'],1,'borrowing never consumes ownership');
assert.equal(sellMaterial(s,'carpentry-tools'),false,'borrowed tools cannot be sold');
economyPolicies(s).sales['carpentry-tools']={enabled:true,keep:0,above:0,daily:0};
assert.equal(salePreview(s,'carpentry-tools',MATERIALS,PROCESSES,materialCount).quantity,0,'automatic sales protect borrowed/worn tools');
economyPolicies(s).sales['carpentry-tools'].enabled=false;
a.needTask={kind:'hunger'};releaseEquipment(s);
assert.equal(equipmentSummary(s,'carpentry-tools').borrowers.length,0,'needs return the shared tool');
assert.equal(useEquipment(s,b,'carpentry-tools',`job:${p.id}`,1,90),1.25);
equipmentState(s).wear['carpentry-tools']=EQUIPMENT_LIFE-.5;
useEquipment(s,b,'carpentry-tools',`job:${p.id}`,.5,90);
assert.equal(equipmentSummary(s,'carpentry-tools').broken,1);
assert.equal(useEquipment(s,b,'carpentry-tools',`job:${p.id}`,1,90),1,'worn tools stop granting a bonus');
p.work=PROJECTS[p.key].work;a.needTask=null;syncInfrastructure(s,PROJECTS);
assert.equal(queueProduction(s,p.id,'repair_carpentry-tools'),'');
assert.equal(s.materials.repair_supplies,4);
let loaded=restore(save(s));assert(loaded);enableFastNavigation(loaded);
assert.equal(equipmentSummary(loaded,'carpentry-tools').broken,1,'wear survives reload');
for(let i=0;i<20000&&!loaded.operations[0].done;i++)tick(loaded,.1);
assert(loaded.operations[0].done);
assert.equal(equipmentSummary(loaded,'carpentry-tools').broken,0);
assert.equal(loaded.materials['carpentry-tools'],1,'repair does not mint a tool');
assert.equal(loaded.materials.repair_supplies,4,'repair supplies consumed once across reload');
for(const [recipe,item,input] of [['craft_harvest-basket','harvest-basket',{bamboo:2}],['craft_garden-tools','garden-tools',{wood:2,tool_heads:1}]]){
 const state=fresh();state.materials['carpentry-tools']=1; const bench={id:state.nextId++,key:'supply-5',x:40,z:39,work:PROJECTS['supply-5'].work,delivered:requiredLoads('supply-5')};state.projects.push(bench);syncInfrastructure(state,PROJECTS);enableFastNavigation(state);
 for(const [id,n]of Object.entries(input))if(id==='wood')state.wood=n;else state.materials[id]=n;
 assert.equal(queueProduction(state,bench.id,recipe),'');
 for(let i=0;i<4000&&!state.operations[0].done;i++)tick(state,1);
 assert(state.operations[0].done,JSON.stringify({op:state.operations[0],equipment:state.equipment,people:state.people.map(r=>({id:r.id,action:r.action,operation:r.operation,energy:r.energy,needs:r.needs}))}));assert.equal(state.materials[item],1);
 assert(restore(save(state)));
}
const clean=fresh(), worker=clean.people[0];clean.materials['cleaning-kit']=1;
assert.equal(useEquipment(clean,worker,'cleaning-kit','op:1',1),1,'soap is required for the cleaning bonus');
clean.materials.soap=1;
assert.equal(useEquipment(clean,worker,'cleaning-kit','op:1',1),1.25);
assert.equal(clean.materials.soap,0);
assert.equal(useEquipment(clean,worker,'cleaning-kit','op:1',1),1.25,'opened refill supports repeated work');
assert.equal(clean.materials.soap,0);
const malformed=JSON.parse(save(loaded));malformed.equipment.wear['carpentry-tools']=-1;assert.equal(restore(JSON.stringify(malformed)),null);
console.log('PASS: exclusive shared borrowing, needs release, wear, manual/automatic sale protection, resident repairs, durable saves, basket/tool crafting and soap refills.');

function constructionRun(withTools) {
 const state=fresh(); state.materials['carpentry-tools']=withTools?1:0;
 const build={id:state.nextId++,key:'shelter',x:35,z:32,work:0,delivered:requiredLoads('shelter')};state.projects.push(build);
 for(const [i,r]of state.people.entries()){r.x=35+i*.1;r.z=31;r.energy=100;for(const key of Object.keys(r.needs))r.needs[key]=100;}
 let borrowed=false;
 for(let i=0;i<300;i++){tick(state,.1);borrowed ||= equipmentSummary(state,'carpentry-tools').borrowers.length>0;}
 return {work:build.work,borrowed,wear:equipmentSummary(state,'carpentry-tools').wear};
}
const basic=constructionRun(false),equipped=constructionRun(true);
assert(equipped.borrowed);assert(equipped.work>basic.work,'shared carpentry tools accelerate actual construction');assert(equipped.wear>0);
console.log('PASS: actual construction borrows shared carpentry tools, progresses faster and records wear.');
