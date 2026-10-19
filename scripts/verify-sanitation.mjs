import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {resetMaterialLocations,stageFixtureWater} from '../web/dev/material-fixture.js';
import {advanceGame} from '../web/dev/scenarios.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
await mkdir('artifacts/sanitation',{recursive:true});
const snap=g=>JSON.parse(g.snapshot()),report=g=>JSON.parse(g.water_report()),active=b=>!['complete','cancelled'].includes(b.phase);
const tank=(s,id)=>s.village.water_supply.tanks.find(p=>p.owner.kind==='building'&&p.owner.id===id);
async function save(g,name){checkpoint(g);await writeFile(`artifacts/sanitation/${name}.json`,g.snapshot());}
function checkpoint(g){
  const raw=g.snapshot(),r=report(g);g.simulation_report();assert.equal(g.snapshot(),raw,'Reports cannot alter ownership or create work');
  for(let i=0;i<4;i++)assert(Math.abs(r.opening[i]+r.received[i]-r.consumed[i]-r.present[i])<.001,`Liquid account ${i}`);
  assert(JSON.parse(g.simulation_report()).materials.every(m=>m.difference===0));
  for(const p of r.tanks)for(let i=0;i<4;i++)assert(Math.abs(p.room[i]-Math.max(0,p.capacity[i]-p.water[i]-p.incoming[i]-p.reserved_processing[i]))<.001,'Room includes incoming and processing reservations');
  const h=new Game();assert(h.restore(raw),'Exact liquid checkpoint must restore');assert.equal(h.snapshot(),raw);h.free();
}
function until(g,test,label,limit=5*1920){for(let frame=0;frame<limit;frame++){if(test(snap(g)))return;g.tick(.25);}throw Error(label+' · '+g.water_report());}
function scene(grey=12,sewage=0){
  const g=new Game();g.start_mode('sandbox');
  for(const [kind,x,y]of [['home',5,5],['kitchen',12,5],['wetland',18,5],['eco_toilet',5,11],['biodigester',12,11],['banana_treatment',18,11],['solar_farm',5,18]])assert.equal(g.place(kind,x,y),'ok');
  const f=snap(g),v=f.village;Object.assign(v,{mode:'story',arrived:true,minutes:540,water:0,food:60,meals:12,seedlings:0});
  Object.assign(v.circular,{greywater:grey,waste:sewage,auto_feed:false,filter_water:false,banana_treatment:false});v.production.targets[17]=0;v.economy.outside_jobs.fill(false);v.economy.money=20000000;v.power.stored=10;v.progress.completed.fill(true);v.progress.later_completed.fill(true);
  for(const r of f.residents)Object.assign(r,{task:'idle',remaining:0,requested:false,trip:null,help:null,energy:90,hunger:0,social:90,last_meal_slot:0,last_sanitation_day:0,activity_building:null,activity_material:null,activity_store:null,activity_batch:null,walking:{},x:10+(r.id-2)*1.25,y:13,target_x:10+(r.id-2)*1.25,target_y:13});
  assert(g.restore(JSON.stringify(resetMaterialLocations(f))));
  const staged=snap(g);if(grey)stageFixtureWater(staged,{kind:'building',id:0},'greywater',grey);if(sewage)stageFixtureWater(staged,{kind:'building',id:3},'sewage',sewage);assert(g.restore(JSON.stringify(staged)));return g;
}
const g=scene();g.configure_sanitation(false,true,false);await save(g,'before');
assert.equal(tank(snap(g),2).water[2],0,'Distant home contents are not at the reed bed');
until(g,s=>s.village.water_supply.trips.some(h=>h.class==='greywater'&&h.carrying),'Actual closed-container collection');
const carried=snap(g),load=carried.village.water_supply.trips.find(h=>h.class==='greywater'&&h.carrying);assert(load.amount<=12);assert.equal(tank(carried,2).water[2],0);assert(!carried.village.processes.batches.some(b=>b.kind==='filtration'&&active(b)));await save(g,'greywater-carrying');
const interrupted=new Game();assert(interrupted.restore(g.snapshot()));const before=report(interrupted);assert.match(interrupted.request(load.resident,'rest',false),/Happy/);
const recovery=snap(interrupted).village.water_supply.tanks.find(p=>p.id===load.recovery);assert.equal(recovery.water[2],load.amount);assert.equal(recovery.owner.kind,'ground');assert.deepEqual(report(interrupted).present,before.present);assert.deepEqual(report(interrupted).received,before.received);await save(interrupted,'recovered');
const night=new Game(),dark=snap(interrupted);dark.village.minutes=Math.floor(dark.village.minutes/1440)*1440+1260;assert(night.restore(JSON.stringify(dark)));await save(night,'recovered-night');night.free();
until(g,s=>s.village.processes.batches.some(b=>b.kind==='filtration'&&active(b)),'Only delivered greywater starts filtration');
assert.equal(report(g).sealed[2],12);assert.equal(report(g).tanks.find(p=>p.owner.kind==='building'&&p.owner.id===2).reserved_processing[1],8);await save(g,'filtering');
const completed=new Game();assert(completed.restore(g.snapshot()));advanceGame(completed,360);assert(snap(completed).village.circular.water_reused>=8);await save(completed,'filtered');
const batch=snap(g).village.processes.batches.find(b=>b.kind==='filtration'&&active(b)),held=report(g).present[2];assert.equal(g.cancel_passive_batch(batch.id),'ok');assert(report(g).sealed[2]===0);assert.equal(report(g).present[2],held);assert.notEqual(g.cancel_passive_batch(batch.id),'ok');await save(g,'batch-recovered');
const offsite=scene(0,12);until(offsite,s=>s.village.water_supply.trips.some(h=>h.class==='sewage'&&h.carrying),'Actual closed sewage collection');await save(offsite,'sewage-carrying');
until(offsite,s=>s.village.water_supply.external[3]>=12,'Actual neighbouring service handoff');assert(report(offsite).external[3]>=12);assert.equal(report(offsite).tanks.find(p=>p.owner.kind==='service').water[3],0);assert.equal(snap(offsite).village.circular.biogas,0);assert.equal(snap(offsite).village.circular.waste_treated,0);await save(offsite,'handed-over');
// Installation is earned with a purchased kit and actual corridor attendance.
const pipes=scene(0,0),quote=JSON.parse(pipes.water_connection_quote('greywater',1,2));assert(quote.allowed);assert.equal(pipes.queue_water_connection('greywater',1,2),'ok');assert.equal(pipes.order_supplies_pickup(JSON.stringify(quote.parts),4),'ok');
until(pipes,s=>s.village.pipes.lines[0].phase==='active','Residents install the greywater connection');
const ports=snap(pipes).village.power.network.nodes,pump=ports.find(n=>n.owner.kind==='pump').id,solar=ports.find(n=>n.kind==='solar').id;
const powerQuote=JSON.parse(pipes.electrical_connection_quote(solar,pump));assert(powerQuote.allowed);assert.equal(pipes.queue_electrical_connection(solar,pump),'ok');
const cable=snap(pipes).village.pipes.lines.at(-1).id;
let ordered=false;until(pipes,()=>{if(!ordered)ordered=pipes.order_supplies_pickup(JSON.stringify(powerQuote.parts),4)==='ok';return ordered;},'A resident buys the greywater pump cable kit');
until(pipes,s=>s.village.pipes.lines.find(p=>p.id===cable).phase==='active','Residents deliver and install local pump power');await save(pipes,'connected');
// Controlled local inflow fixture: retain the earned installed line and seed
// owned greywater at the source, with an explicit matching opening account.
const inflow=snap(pipes),source=tank(inflow,1);source.water[2]+=12;inflow.village.circular.greywater=Math.fround(inflow.village.circular.greywater+12);inflow.village.water_supply.opening[2]+=12;assert(pipes.restore(JSON.stringify(inflow)));
until(pipes,s=>s.village.pipes.lines[0].transferred>=6,'Installed compatible line transfers owned local greywater');assert(tank(snap(pipes),2).water[2]>0);const line=snap(pipes).village.pipes.lines[0];assert(Math.abs(line.energy_used-line.transferred*.025)<.001);await save(pipes,'pumping');
const raw=pipes.snapshot();for(const field of ['old_version','handoff','batch']){
  const bad=snap(pipes);if(field==='old_version')bad.village.version=18;else if(field==='handoff')bad.village.water_supply.external[3]+=1;else bad.village.water_supply.opening[2]+=1;
  assert(!pipes.restore(JSON.stringify(bad)));assert.equal(pipes.snapshot(),raw,'Invalid liquid data must fail atomically');
}
for(const game of [g,interrupted,completed,offsite,pipes])game.free();
console.log('PASS: closed greywater/sewage collection and delivery, local treatment and reservations, sealed cancellation and interruption recovery, actual off-site handoff without grants, paid resident greywater installation and powered local flow, four conserved liquid accounts, exact saves and atomic invalid-save rejection.');
