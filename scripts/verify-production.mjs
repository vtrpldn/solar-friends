import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {resetMaterialLocations} from '../web/dev/material-fixture.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
await mkdir('artifacts/production',{recursive:true});
const snap=g=>JSON.parse(g.snapshot()),person=(s,id=0)=>s.residents.find(r=>r.id===id);
function scene(x=6,y=6){
 const g=new Game();g.start_mode('sandbox');assert.equal(g.place('workshop',x,y),'ok');
 const s=snap(g);Object.assign(s.village,{mode:'story',arrived:true,minutes:540,food:80,meals:10,water:40});
 s.village.progress.completed=Array(4).fill(true);s.village.progress.later_completed=Array(9).fill(true);
 s.village.economy.stock[7]=0;s.village.economy.outside_jobs=Array(5).fill(false);
 for(const r of s.residents)Object.assign(r,{task:'idle',trip:null,remaining:0,energy:90,hunger:10,social:90,last_meal_slot:0,x:10+(r.id-2)*1.25,y:13,target_x:10+(r.id-2)*1.25,target_y:13,activity_batch:null});
 assert(g.restore(JSON.stringify(resetMaterialLocations(s))));return g;
}
function checkpoint(g){const raw=g.snapshot(),copy=new Game();assert(copy.restore(raw));assert.equal(copy.snapshot(),raw);copy.free();}
const g=scene();await writeFile('artifacts/production/start.json',g.snapshot());
for(let id=1;id<5;id++)assert(g.set_resident_job(id,true));
assert.equal(g.set_production_target(7,2),'ok');
let s=snap(g),b=s.village.production.batches.find(b=>b.material===7&&b.phase==='awaiting_inputs');assert(b);
const id=b.id,site=b.site,before=g.snapshot(),report=g.production_report();assert.equal(g.snapshot(),before);assert(JSON.parse(report).recipes.some(r=>r.site===site));assert.deepEqual(JSON.parse(g.simulation_report()).production,JSON.parse(report));
assert.match(g.request(0,'prepare',false),/Happy/);assert.equal(person(snap(g)).help.batch,id);
assert.equal(person(snap(g)).task,'haul','Preparing a saved batch includes collecting its own inputs');
let cargo=false,partial=false;
for(let frame=0;frame<4000;frame++){
 s=snap(g);b=s.village.production.batches.find(b=>b.id===id);
 assert(s.residents.filter(r=>r.task==='prepare'&&r.activity_batch===id&&r.remaining>0).length<=1,'Only one resident claims this work position');
 const inbound=s.village.logistics.shipments.find(h=>h.carrying&&s.village.logistics.stores.find(p=>p.id===h.to)?.owner.kind==='production');
 if(inbound&&!cargo){cargo=true;await writeFile('artifacts/production/cargo.json',g.snapshot());checkpoint(g);}
 if(b.work>1&&b.work<10){partial=true;await writeFile('artifacts/production/working.json',g.snapshot());break;}
 g.tick(.25);
}
assert(cargo&&partial,'Actual input trips must precede attended preparation');
const saved=snap(g);person(saved).energy=20;assert(g.restore(JSON.stringify(saved)));g.tick(.25);
assert.equal(person(snap(g)).task,'rest');assert.equal(person(snap(g)).help.phase,'paused');
await writeFile('artifacts/production/rest.json',g.snapshot());
const copy=new Game();assert(copy.restore(g.snapshot()));
let done=false;
for(let frame=0;frame<6000;frame++){
 s=snap(g);b=s.village.production.batches.find(b=>b.id===id);
 if(b.phase==='complete'){
  done=true;assert.equal(person(s).help.phase,'complete');assert.equal(s.village.production.accounting.outputs[7],2);
  const camp=s.village.logistics.stores.find(p=>p.owner.kind==='camp');assert.equal(camp.items[7],0,'New output starts at the workshop or in actual onward cargo');
  assert.equal(s.environment.economy.materials[7].stored,2);break;
 }
 g.tick(.25);copy.tick(.25);assert.equal(copy.snapshot(),g.snapshot(),'Needs interruptions and production progress replay exactly after a checkpoint');
}
assert(done);await writeFile('artifacts/production/finished.json',g.snapshot());checkpoint(g);
assert(JSON.parse(g.simulation_report()).materials.every(m=>m.difference===0));
const cancellation=scene();cancellation.set_production_target(7,2);
const raw=await readFile('artifacts/production/working.json','utf8');assert(cancellation.restore(raw));
const committed=snap(cancellation).village.production.batches.find(b=>b.id===id);assert(committed.committed);
const prior=snap(cancellation).environment.economy.materials.map(m=>m.stored);
assert.equal(cancellation.cancel_production_batch(id),'ok');
assert.deepEqual(snap(cancellation).environment.economy.materials.map(m=>m.stored),prior.map((n,i)=>n+committed.inputs[i]));
assert.notEqual(cancellation.cancel_production_batch(id),'ok');checkpoint(cancellation);
assert(JSON.parse(cancellation.simulation_report()).materials.every(m=>m.difference===0));
const atomic=g.snapshot();assert.notEqual(g.set_production_target(7,31),'ok');assert.equal(g.snapshot(),atomic);
// Identical resources and one available resident isolate the worksite layout.
const comparison=[];
for(const [name,x,y] of [['near',8,10],['distant',3,3]]){
 const village=scene(x,y);for(let id=1;id<5;id++)village.set_resident_job(id,true);
 village.set_production_target(7,2);assert.match(village.request(0,'prepare',false),/Happy/);
 let result;
 for(let frame=0;frame<8000;frame++){
  village.tick(.25);const state=snap(village);
  if(state.village.production.accounting.outputs[7]===2){
   result={name,x,y,finished:state.village.minutes,elapsed:state.village.minutes-540,inputs:state.village.production.accounting.inputs,output:state.village.production.accounting.outputs[7]};
   checkpoint(village);assert(JSON.parse(village.simulation_report()).materials.every(m=>m.difference===0));break;
  }
 }
 assert(result,`${name} workshop must finish through real hauling and attendance`);comparison.push(result);village.free();
}
assert(comparison[0].elapsed<comparison[1].elapsed,'A nearby worksite must complete the same supplied batch sooner');
assert.deepEqual(comparison[0].inputs,comparison[1].inputs,'Placement changes time, never recipe consumption');
await writeFile('artifacts/production/layout-comparison.json',JSON.stringify(comparison,null,2));
for(const game of [g,copy,cancellation])game.free();
console.log('PASS: real worksite input hauling, bounded work positions, saved helping batches, attended production through rest and exact replay, local output, once-only cancellation recovery, read-only batch diagnostics and faster production at a nearby worksite.');
