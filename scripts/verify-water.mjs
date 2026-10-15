import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {restockFixtureWater,stageFixtureWater} from '../web/dev/material-fixture.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
await mkdir('artifacts/water',{recursive:true});
const snap=g=>JSON.parse(g.snapshot()),report=g=>JSON.parse(g.water_report());
function checkpoint(g){const raw=g.snapshot(),h=new Game();assert(h.restore(raw),'Water state must restore');assert.equal(h.snapshot(),raw);h.free();}
function account(g){const r=report(g);for(let i=0;i<2;i++)assert(Math.abs(r.opening[i]+r.received[i]-r.consumed[i]-r.present[i])<.001);assert.equal(snap(g).village.water,Math.fround(r.present[0]));assert.equal(snap(g).village.circular.reclaimed,Math.fround(r.present[1]));}
function until(g,test,label,limit=4*1920){for(let frame=0;frame<limit;frame++){if(test(snap(g)))return;g.tick(.25);}throw Error(label+' · '+g.water_report());}
function scene(fresh=0,irrigation=0){
  const g=new Game();g.start_mode('sandbox');
  for(const [kind,x,y]of [['well',5,5],['kitchen',12,5],['garden',18,5],['wetland',5,18],['eco_toilet',12,18]])assert.equal(g.place(kind,x,y),'ok');
  const f=snap(g),v=f.village;Object.assign(v,{mode:'story',arrived:true,minutes:540,water:fresh});v.circular.reclaimed=irrigation;v.progress.completed.fill(true);v.progress.later_completed.fill(true);v.production.targets[17]=0;
  for(const r of f.residents)Object.assign(r,{task:'idle',remaining:0,requested:false,trip:null,help:null,energy:90,hunger:0,social:90,last_meal_slot:0,activity_building:null,activity_material:null,activity_store:null,activity_batch:null,walking:{},x:10+(r.id-2)*1.25,y:13,target_x:10+(r.id-2)*1.25,target_y:13});
  restockFixtureWater(f);if(fresh)stageFixtureWater(f,{kind:'building',id:0},'fresh',fresh);if(irrigation)stageFixtureWater(f,{kind:'building',id:3},'irrigation',irrigation);
  assert(g.restore(JSON.stringify(f)));return g;
}
const tank=(s,owner,id)=>s.village.water_supply.tanks.find(p=>p.owner.kind===owner&&p.owner.id===id);
const g=scene(24);await writeFile('artifacts/water/before.json',g.snapshot());
assert.equal(tank(snap(g),'building',1).water[0],0,'Distant cistern water is not in the kitchen');
const read=g.snapshot();g.water_report();g.utility_preview('fresh',0,1);assert.equal(g.snapshot(),read);
until(g,s=>s.village.water_supply.trips.some(h=>!h.carrying),'Resident claims actual local pickup');account(g);checkpoint(g);await writeFile('artifacts/water/collecting.json',g.snapshot());
until(g,s=>s.village.water_supply.trips.some(h=>h.carrying),'Resident reaches the supply and collects');
let s=snap(g),h=s.village.water_supply.trips.find(h=>h.carrying),destination=s.village.water_supply.tanks.find(p=>p.id===h.to);
assert.equal(destination.water[0],0,'Water in transit is not usable at its destination');assert(h.amount<=12);account(g);checkpoint(g);await writeFile('artifacts/water/carrying.json',g.snapshot());
const cancellation=new Game();assert(cancellation.restore(g.snapshot()));const before=report(cancellation),person=s.residents.find(r=>r.id===h.resident);
assert.match(cancellation.request(h.resident,'rest',false),/Happy/);const recovery=snap(cancellation).village.water_supply.tanks.find(p=>p.id===h.recovery);
assert.equal(recovery.owner.kind,'ground');assert.equal(recovery.water[0],h.amount);assert.equal(recovery.x,person.x);assert.equal(recovery.y,person.y);assert.deepEqual(report(cancellation).present,before.present);assert.deepEqual(report(cancellation).received,before.received);checkpoint(cancellation);account(cancellation);await writeFile('artifacts/water/interrupted.json',cancellation.snapshot());
until(g,s=>tank(s,'camp').water[0]>=10,'Resident delivers the collected load');checkpoint(g);account(g);await writeFile('artifacts/water/delivered.json',g.snapshot());
const manual=scene();until(manual,s=>s.village.water_supply.trips.some(h=>h.from==null&&!h.carrying),'Manual treated-water trip starts');assert.equal(snap(manual).village.water,0);
until(manual,s=>s.village.water_supply.trips.some(h=>h.from==null&&h.carrying),'Manual treated-water pickup');assert.equal(tank(snap(manual),'camp').water[0],0);assert(report(manual).received[0]>0);checkpoint(manual);account(manual);await writeFile('artifacts/water/manual-carrying.json',manual.snapshot());
until(manual,s=>tank(s,'camp').water[0]>=10,'Manual fallback delivers to arrival barrels');checkpoint(manual);account(manual);
const irrigation=scene(32,8);until(irrigation,s=>s.village.water_supply.trips.some(h=>h.class==='irrigation'&&h.carrying),'Residents carry reclaimed irrigation');checkpoint(irrigation);account(irrigation);await writeFile('artifacts/water/irrigation-carrying.json',irrigation.snapshot());
until(irrigation,s=>tank(s,'building',2).water[1]>=2,'Reclaimed irrigation reaches its growing plot');assert.equal(tank(snap(irrigation),'building',1).water[1],0);checkpoint(irrigation);account(irrigation);await writeFile('artifacts/water/irrigation-delivered.json',irrigation.snapshot());
const moved=scene(24);assert.equal(moved.queue_building_work(0,'move',5,24),'ok');
until(moved,s=>s.village.buildings.find(b=>b.id===0).y===24,'Actual crew packs and moves the cistern');s=snap(moved);
assert(s.village.water_supply.tanks.some(p=>p.owner.kind==='ground'&&p.x===5&&p.y===5&&p.water[0]===24),'Stored water remains at its original plot');assert.equal(tank(s,'building',0).water[0],0);checkpoint(moved);account(moved);await writeFile('artifacts/water/moved.json',moved.snapshot());
const rain=scene(),rainFixture=snap(rain);rainFixture.village.minutes=900;assert(rain.restore(JSON.stringify(rainFixture)));rain.tick(.25);s=snap(rain);assert(tank(s,'building',0).water[0]>0);assert.equal(tank(s,'camp').water[0],0);assert.equal(tank(s,'building',1).water[0],0);assert(s.village.progress.rain_caught);checkpoint(rain);account(rain);await writeFile('artifacts/water/rain.json',rain.snapshot());
const original=g.snapshot();for(const key of ['total','ledger','old_version']){const bad=snap(g);if(key==='total')bad.village.water+=1;else if(key==='ledger')bad.village.water_supply.opening[0]+=1;else bad.village.version=16;assert(!g.restore(JSON.stringify(bad)));assert.equal(g.snapshot(),original);}
for(const game of [g,cancellation,manual,irrigation,moved,rain])game.free();
console.log('PASS: actual local collection and delivery, bounded owned cargo, manual treated-water fallback, reachable reclaimed irrigation, local rain, original-site recovery after a resident move, interruption without grants, exact checkpoints, invalid totals/accounts and read-only water reports.');
