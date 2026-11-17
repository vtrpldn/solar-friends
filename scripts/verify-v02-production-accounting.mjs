import assert from 'node:assert/strict';
import {createWeekend,chooseCamp,PROJECTS,PROCESSES,queueProduction,tick,save,restore,enableFastNavigation} from '../web/v02/weekend/simulation.js';
import {recipeBalance,productionSummary,validProductionAccounting} from '../web/v02/weekend/production-accounting.js';
import {materialMass} from '../web/v02/weekend/material-measures.js';
import {cargoSize} from '../web/v02/weekend/physical-trade.js';
for(const [id,r]of Object.entries(PROCESSES)){
 const b=recipeBalance(id,r);if(!b)continue;
 assert(b.lossKg>=0,`${id} does not create mass`);
 assert.equal(b.inputKg,b.outputKg+b.lossKg,`${id} reconciles`);
 assert.equal(cargoSize(r.output).kg,materialMass(r.output),'cargo uses identical units');
}
assert.equal(recipeBalance('vegetables',PROCESSES.vegetables),null,'biological growth is not a closed material transformation');
const s=createWeekend(42);chooseCamp(s,'entrance');enableFastNavigation(s);s.rainResolved=s.rainSeen=true;
// Diagnostic fixture: a completed workbench, then ordinary resident production.
const site={id:s.nextId++,key:'supply-5',x:s.stock.x+3,z:s.stock.z+3,rotation:0,work:PROJECTS['supply-5'].work,delivered:0};s.projects.push(site);
const wood=s.wood,planks=s.materials.planks;
assert.equal(queueProduction(s,site.id,'saw_planks'),'');assert.equal(s.wood,wood-3,'inputs reserved once');
assert.equal(productionSummary(s,PROCESSES).batches,0,'queueing is not processing');
let resumed=s,processed=false;
for(let i=0;i<12000;i++){
 tick(resumed,.1);
 const op=resumed.operations.find(o=>o.recipe==='saw_planks');
 if(!processed&&op.phase==='return'){
  processed=true;assert.equal(resumed.materials.planks,planks,'finished output is not in storage before delivery');
  assert.equal(productionSummary(resumed,PROCESSES).batches,1);
  resumed=restore(save(resumed));assert(resumed,'carried output survives restore');
 }
 if(op.done)break;
}
assert(processed,'resident finishes actual work');
assert.equal(resumed.materials.planks,planks+6,'output delivered once');
const totals=productionSummary(resumed,PROCESSES);assert.equal(totals.batches,1);assert.equal(totals.inputKg,12);assert.equal(totals.outputKg,9);assert.equal(totals.lossKg,3);
assert(restore(save(resumed)),'ledger persists');
const bad=JSON.parse(save(resumed));bad.productionAccounting.batches.saw_planks=-1;assert.equal(restore(JSON.stringify(bad)),null);
bad.productionAccounting={version:2,since:0,batches:{}};assert(!validProductionAccounting(bad,PROCESSES));
console.log('PASS shared mass definitions, seven balanced transformations, real processing/delivery, mid-carry reload and ledger validation');
