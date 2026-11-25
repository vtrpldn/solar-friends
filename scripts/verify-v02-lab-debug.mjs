import assert from 'node:assert/strict';
import {createSandbox,createWeekend,chooseCamp,PROJECTS,save,restore,tick,enableFastNavigation} from '../web/v02/weekend/simulation.js';
import {labCommand,labSample,stopReason} from '../web/v02/weekend/lab-debug.js';
import {LabRunner} from '../web/v02/weekend/lab-runner.js';
let s=createSandbox(42);
assert.equal(labCommand(s,{type:'build',key:'field',x:50,z:50,size:[4,4],rotation:0}),'');const p=s.projects.at(-1),site=p.id;
assert(p.cultivation?.beds.length);
assert.match(labCommand(s,{type:'bed-config',site,bed:'all',settings:{crop:'beans',density:.5,irrigation:false,residues:'collect'}}),/accepted/);
assert(p.cultivation.beds.every(b=>b.crop==='beans'&&b.density===.5&&!b.irrigation&&b.residues==='collect'));
assert.match(labCommand(s,{type:'bed',site,bed:'all',action:'prepare'}),/accepted/);
assert.equal(s.operations.filter(o=>o.farm?.action==='prepare').length,p.cultivation.beds.length);
assert.match(labCommand(s,{type:'bed',site,bed:0,action:'plant'}),/pending/);
assert.equal(labCommand(s,{type:'outside',resident:'iara',enabled:true}),'');assert(s.people[0].outsideJobEnabled);
assert.match(labCommand(s,{type:'maintain',site:0,field:'water'}),/supported/);
 Object.assign(p.cultivation.beds[0],{stage:'harvestable',ripeAt:s.time});assert.match(stopReason(s,'harvest'),/ready/);p.cultivation.beds[0].stage='failed';assert.match(stopReason(s,'crop-failed'),/failed/);
s=createWeekend(42);chooseCamp(s,'entrance');enableFastNavigation(s);tick(s,.1);
const sample=labSample(s);assert.equal(sample.needs.hydration,Math.min(...s.people.map(r=>r.needs.hydration)));assert(sample.hydrology);assert(sample.weather.temperatureC);assert(sample.inventory);assert(sample.finance);assert(sample.residents.every(r=>Number.isFinite(r.needs.hydration)));
const water=Object.values(s.infrastructure.nodes).map(n=>[n,n.water[0]]);for(const [n]of water)n.water[0]=0;assert.match(stopReason(s,'water'),/potable/);for(const [n,v]of water)n.water[0]=v;
 s.operations??=[];s.operations.push({done:false,accessRetryAt:{iara:s.time+30}});assert.match(stopReason(s,'blocked'),/access/);s.operations.pop();
 s.people[0].needs.hydration=0;assert.match(stopReason(s,'hydration'),/thirst/);assert.equal(stopReason(s,'none'),'');
let n=0;const runner=new LabRunner(s,()=>{if(++n===3)runner.paused=true;});runner.paused=false;runner.advance(.25,Infinity,()=>0);assert.equal(n,3,'pause condition stops inside a CPU slice');
assert(restore(save(s)));
console.log('PASS normal field/bed orders, partial bulk rejection, crop settings, employment, telemetry, policy allowlist and exact mid-slice pause');
{
 // The lab can put one project first, exactly as the game's own control does.
 const {createWeekend,chooseCamp,plan:planProject}=await import('../web/v02/weekend/simulation.js');
 const v=createWeekend();v.arrivalElapsed=17;chooseCamp(v,'clearing');v.money=100000;
 assert.equal(planProject(v,'shelter',40,39),'');assert.equal(planProject(v,'gathering',29,35),'');
 const second=v.projects.find(p=>p.key==='gathering');
 assert.equal(labCommand(v,{type:'prioritize',site:second.id}),'');
 assert.equal(v.projects.filter(p=>p.prioritized).length,1);assert.equal(second.prioritized,true);
 assert.match(labCommand(v,{type:'prioritize',site:-5}),/unfinished/);
 console.log('PASS lab project priority order');
}
