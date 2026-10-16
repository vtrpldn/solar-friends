import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const pkg=process.env.SOLAR_WASM_DIR?pathToFileURL(path.resolve(process.env.SOLAR_WASM_DIR)+'/'):new URL('../web/pkg/',import.meta.url);
const {default:init,Game}=await import(new URL('solar_friends.js',pkg));
await init({module_or_path:await readFile(new URL('solar_friends_bg.wasm',pkg))});
const output='artifacts/maintenance';await mkdir(output,{recursive:true});
const g=new Game(),snap=()=>JSON.parse(g.snapshot());
assert(g.start_mode('sandbox'));
for(const [kind,x,y] of [['workshop',6,6],['solar_farm',12,6],['home',18,12]])assert.equal(g.place(kind,x,y),'ok');
g.tick(.25);
const before=g.snapshot(),report=JSON.parse(g.maintenance_report());
assert.equal(g.snapshot(),before,'Equipment inspection is read-only');
assert.equal(report.enabled,false);assert.equal(report.operating_penalties_active,false,'No failure without a completed repair path');
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
  const old=new OldGame(),fresh=new Game();old.start_mode('sandbox');fresh.start_mode('sandbox');
  for(const [kind,x,y] of [['workshop',6,6],['solar_farm',12,6],['home',18,12]]){assert.equal(old.place(kind,x,y),'ok');assert.equal(fresh.place(kind,x,y),'ok');}
  for(let tick=0;tick<1920;tick++){old.tick(.25);fresh.tick(.25);}
  const current=JSON.parse(fresh.snapshot());delete current.village.maintenance;
  assert.deepEqual(current,JSON.parse(old.snapshot()),'Disabled groundwork preserves the released farming simulation');
  baselineMinutes=1440;old.free();fresh.free();
}
await writeFile(output+'/before.json',JSON.stringify(initial));await writeFile(output+'/after.json',g.snapshot());
await writeFile(output+'/report.json',JSON.stringify({days:4,exactCheckpoints:5,baselineMinutes,equipment:JSON.parse(g.maintenance_report())},null,2));g.free();
console.log(`PASS: four days of owned equipment condition, read-only diagnostics, real battery use, exact checkpoints, frozen wear and invalid-save rejection${baselineMinutes?'; released-build parity over one day':''}. Repair jobs and operating penalties remain in progress.`);
