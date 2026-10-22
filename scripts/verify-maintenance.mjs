import {startEmptySandbox} from './lib/empty-sandbox.mjs';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const pkg=process.env.SOLAR_WASM_DIR?pathToFileURL(path.resolve(process.env.SOLAR_WASM_DIR)+'/'):new URL('../web/pkg/',import.meta.url);
const {default:init,Game}=await import(new URL('solar_friends.js',pkg));
await init({module_or_path:await readFile(new URL('solar_friends_bg.wasm',pkg))});
const output='artifacts/maintenance';await mkdir(output,{recursive:true});
const g=new Game(),snap=()=>JSON.parse(g.snapshot());
assert(startEmptySandbox(g));
for(const [kind,x,y] of [['workshop',6,6],['solar_farm',12,6],['home',18,12]])assert.equal(g.place(kind,x,y),'ok');
g.tick(.25);
const before=g.snapshot(),report=JSON.parse(g.maintenance_report());
assert.equal(g.snapshot(),before,'Equipment inspection is read-only');
assert.equal(report.enabled,false);assert.equal(report.operating_penalties_active,false,'Sandbox starts without operating penalties');
assert.equal(report.equipment.length,4);
g.set_equipment_condition(true);
function checkpoint(){const raw=g.snapshot(),copy=new Game();assert(copy.restore(raw));assert.equal(copy.snapshot(),raw);copy.free();}
checkpoint();
const initial=snap();
for(let day=0;day<4;day++){
  for(let tick=0;tick<1920;tick++)g.tick(.25);
  checkpoint();
  const s=snap(),r=JSON.parse(g.maintenance_report());assert(r.equipment.every(a=>a.condition>=0&&a.condition<=100));
  assert(s.village.maintenance.records.every(a=>a.exposure_minutes>0));
  assert(JSON.parse(g.simulation_report()).materials.every(m=>m.difference===0));
  const n=s.village.power.network,a=n.account;
  assert(Math.abs(a.opening+a.generated-a.consumed-a.curtailed-a.discharged-n.nodes.reduce((sum,n)=>sum+n.charge,0))<.001);
}
const worn=JSON.parse(g.maintenance_report());assert(worn.equipment.some(a=>a.use_units>0),'Actual electrical charge changes wear the owned battery');
assert(worn.equipment.every(a=>a.condition<100));
g.set_equipment_condition(false);const paused=snap().village.maintenance.records.map(r=>[r.equipment,r.condition,r.use_units,r.exposure_minutes]);
for(let tick=0;tick<80;tick++)g.tick(.25);
assert.deepEqual(snap().village.maintenance.records.map(r=>[r.equipment,r.condition,r.use_units,r.exposure_minutes]),paused,'Disabling pauses condition without healing or deleting it');
g.set_equipment_condition(true);assert.deepEqual(snap().village.maintenance.records.map(r=>[r.equipment,r.condition,r.use_units,r.exposure_minutes]),paused);
const raw=g.snapshot(),bad=snap();bad.village.maintenance.records.pop();assert.equal(g.restore(JSON.stringify(bad)),false);assert.equal(g.snapshot(),raw);
const clone=new Game();assert(clone.restore(raw));for(let tick=0;tick<160;tick++){g.tick(.25);clone.tick(.25);}assert.equal(g.snapshot(),clone.snapshot(),'Weather, wear and charge movement continue identically');clone.free();
let baselineMinutes=0;
if(process.env.SOLAR_CONDITION_BASELINE){
  const baseline=pathToFileURL(path.resolve(process.env.SOLAR_CONDITION_BASELINE)+'/');
  const {default:oldInit,Game:OldGame}=await import(new URL('solar_friends.js',baseline));
  await oldInit({module_or_path:await readFile(new URL('solar_friends_bg.wasm',baseline))});
  const old=new OldGame(),fresh=new Game();startEmptySandbox(old);startEmptySandbox(fresh);
  for(const [kind,x,y] of [['workshop',6,6],['solar_farm',12,6],['home',18,12]]){assert.equal(old.place(kind,x,y),'ok');assert.equal(fresh.place(kind,x,y),'ok');}
  for(let tick=0;tick<1920;tick++){old.tick(.25);fresh.tick(.25);}
  const current=JSON.parse(fresh.snapshot());assert.equal(current.village.version,44);delete current.village.maintenance;delete current.environment.economy.pickup_minutes;current.village.version=JSON.parse(old.snapshot()).village.version;
  assert.deepEqual(current,JSON.parse(old.snapshot()),'Disabled groundwork preserves the released farming simulation');
  baselineMinutes=1440;old.free();fresh.free();
}
await writeFile(output+'/before.json',JSON.stringify(initial));await writeFile(output+'/after.json',g.snapshot());
await writeFile(output+'/report.json',JSON.stringify({days:4,exactCheckpoints:5,baselineMinutes,equipment:JSON.parse(g.maintenance_report())},null,2));g.free();
console.log(`PASS: four days of owned equipment condition, read-only diagnostics, real battery use, exact checkpoints, frozen wear and invalid-save rejection${baselineMinutes?'; released-build parity over one day':''}. Wear and service can be enabled independently of seasonal weather.`);

// Authored worn equipment establishes service demand; purchases, carriage and
// attended repair below use the real public game commands and resident queue.
const {resetMaterialLocations}=await import('../web/dev/material-fixture.js');
const repair=new Game();startEmptySandbox(repair);
for(const [kind,x,y] of [['workshop',6,6],['solar_farm',12,6],['home',8,16]])assert.equal(repair.place(kind,x,y),'ok');
repair.tick(.25);
const fixture=JSON.parse(repair.snapshot()),v=fixture.village;
v.mode='story';v.arrived=true;v.minutes=540;v.food=40;v.meals=12;v.economy.stock.fill(0);v.progress.tool_uses=0;v.progress.completed.fill(true);v.progress.later_completed.fill(true);
for(const r of fixture.residents){Object.assign(r,{task:'idle',remaining:0,requested:false,trip:null,help:null,activity_material:null,activity_store:null,activity_batch:null,activity_building:null,visit_building:null,energy:90,hunger:10,social:90,x:10+r.id*.8,y:13});r.target_x=r.x;r.target_y=r.y;r.walking={};}
assert(repair.restore(JSON.stringify(resetMaterialLocations(fixture))));repair.set_outside_work(false);repair.set_equipment_condition(true);
const wornScene=JSON.parse(repair.snapshot());wornScene.village.maintenance.records.find(r=>r.equipment.kind==='workshop').condition=40;
assert(repair.restore(JSON.stringify(wornScene)));await writeFile(output+'/repair-before.json',repair.snapshot());
assert.equal(repair.queue_equipment_service(JSON.stringify({kind:'workshop',id:0})),'ok');
const service=JSON.parse(repair.maintenance_report()).jobs.at(-1),serviceId=service.job.id;
assert.deepEqual(service.missing,service.kit);
assert.equal(repair.order_supplies_pickup(JSON.stringify(service.kit),3),'ok','A real resident buys the service kit in town');
let carried=false,attended=false,interrupted=false,finished=false;
function repairCheckpoint(){const raw=repair.snapshot(),copy=new Game();assert(copy.restore(raw));assert.equal(copy.snapshot(),raw);copy.free();assert(JSON.parse(repair.simulation_report()).materials.every(m=>m.difference===0));}
for(let tick=0;tick<5*1920;tick++){
  repair.tick(.25);
  if(tick%4)continue;
  const s=JSON.parse(repair.snapshot()),j=s.village.maintenance.jobs.find(j=>j.id===serviceId),store=s.village.logistics.stores.find(p=>p.owner.kind==='maintenance'&&p.owner.id===serviceId);
  carried ||= !!store&&s.village.logistics.shipments.some(h=>h.carrying&&h.to===store.id);
  attended ||= j.work>0;
  if(j.work>0&&j.finished==null&&!interrupted){
    assert(s.residents.some(r=>r.task==='utility'&&r.activity_material===serviceId),'A named resident is physically servicing the equipment');
    assert(repair.configure_equipment_service(serviceId,true));repairCheckpoint();
    const work=j.work;for(let t=0;t<40;t++)repair.tick(.25);
    assert.equal(JSON.parse(repair.snapshot()).village.maintenance.jobs.find(j=>j.id===serviceId).work,work);
    assert(repair.configure_equipment_service(serviceId,false));interrupted=true;
  }
  if(j.finished!=null){assert.equal(j.cancelled,false);finished=true;break;}
  if(tick%500===0)repairCheckpoint();
}
assert(finished&&carried&&attended&&interrupted,'Pickup, local delivery, attendance and interruption lead to actual completed service');
repairCheckpoint();const repaired=JSON.parse(repair.snapshot()),done=repaired.village.maintenance.jobs.find(j=>j.id===serviceId);
assert(repaired.village.maintenance.records.find(r=>r.equipment.kind==='workshop').condition>99.9);
for(let i=0;i<service.kit.length;i++)assert.equal(done.spent[i][1]-done.spent[i][0],service.kit[i]);
const beforeQuery=repair.snapshot(),serviceReport=JSON.parse(repair.maintenance_report());assert.equal(repair.snapshot(),beforeQuery);
assert.equal(serviceReport.jobs.find(r=>r.job.id===serviceId).phase,'complete');
assert.equal(repair.cancel_equipment_service(serviceId),false);
await writeFile(output+'/repair-after.json',repair.snapshot());await writeFile(output+'/repair-report.json',JSON.stringify({carried,attended,interrupted,finished,service:serviceReport.jobs.find(r=>r.job.id===serviceId)},null,2));repair.free();
console.log('PASS: a town pickup supplies an authored worn workshop; residents deliver its kit, perform real service, pause/save/resume it and finish with exactly one recorded kit and valid material accounts.');
