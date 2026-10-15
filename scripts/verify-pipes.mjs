import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import init,{Game} from '../web/pkg/solar_friends.js';
import {resetMaterialLocations} from '../web/dev/material-fixture.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
await mkdir('artifacts/pipes',{recursive:true});
const snap=g=>JSON.parse(g.snapshot()),line=(s,id)=>s.village.pipes.lines.find(p=>p.id===id);
function account(g){
  const r=JSON.parse(g.simulation_report());assert(r.materials.every(m=>m.difference===0));
  for(let i=0;i<2;i++)assert(Math.abs(r.water.opening[i]+r.water.received[i]-r.water.consumed[i]-r.water.present[i])<.001);
}
function checkpoint(g){const raw=g.snapshot(),h=new Game();if(!h.restore(raw)){writeFileSync('artifacts/pipes/invalid-checkpoint.json',raw);assert.fail('Pipe checkpoint rejected; see artifacts/pipes/invalid-checkpoint.json');}assert.equal(h.snapshot(),raw);h.free();account(g);}
function until(g,test,label,limit=5*1920){for(let frame=0;frame<limit;frame++){if(test(snap(g)))return;g.tick(.25);}throw Error(label+' · '+g.water_connections());}
const g=new Game();g.start_mode('sandbox');
for(const [kind,x,y]of [['well',5,5],['kitchen',12,5],['solar_farm',5,18]])assert.equal(g.place(kind,x,y),'ok');
const f=snap(g),v=f.village;Object.assign(v,{mode:'story',arrived:true,minutes:540,food:60,meals:12,water:80,seedlings:0});
v.economy.stock.fill(0);v.economy.money=20000000;v.economy.outside_jobs.fill(false);v.supplies.eggs=0;Object.assign(v.progress,{compost:0,scraps:0,tool_uses:0});v.power.stored=10;v.progress.completed.fill(true);v.progress.later_completed.fill(true);
for(const r of f.residents)Object.assign(r,{task:'idle',remaining:0,requested:false,trip:null,help:null,energy:90,hunger:0,social:90,last_meal_slot:0,activity_building:null,activity_material:null,activity_store:null,activity_batch:null,walking:{},x:10+(r.id-2)*1.25,y:13,target_x:10+(r.id-2)*1.25,target_y:13});
assert(g.restore(JSON.stringify(resetMaterialLocations(f))));
const before=g.snapshot(),quote=JSON.parse(g.water_connection_quote('fresh',0,1));assert(quote.allowed);g.water_connections();g.utility_preview('fresh',0,1);assert.equal(g.snapshot(),before,'Planning reads cannot spend, move water or allocate identities');
await writeFile('artifacts/pipes/before.json',before);
assert.equal(g.queue_water_connection('fresh',0,1),'ok');const id=snap(g).village.pipes.lines[0].id;
assert.equal(line(snap(g),id).work,0);assert.equal(line(snap(g),id).phase,'awaiting_inputs');checkpoint(g);await writeFile('artifacts/pipes/queued.json',g.snapshot());
const queued=g.snapshot();assert.notEqual(g.queue_water_connection('fresh',0,1),'ok');assert.equal(g.snapshot(),queued);
// Obtain the actual kit through the existing player-facing town pickup command.
assert.equal(g.order_supplies_pickup(JSON.stringify(quote.parts),4),'ok');
until(g,s=>s.village.economy.orders.some(o=>o.status==='delivered'),'Resident drives to collect the pipe kit');checkpoint(g);
until(g,s=>s.village.logistics.shipments.some(h=>h.carrying&&s.village.logistics.stores.some(p=>p.id===h.to&&p.owner.kind==='utility'&&p.owner.id===id)),'Resident carries imported parts to the route');checkpoint(g);await writeFile('artifacts/pipes/kit-carrying.json',g.snapshot());
until(g,s=>line(s,id).phase==='installing','Resident starts laying the route');checkpoint(g);await writeFile('artifacts/pipes/installing.json',g.snapshot());
const partial=line(snap(g),id).work;assert.equal(g.configure_water_connection(id,1,true),'ok');checkpoint(g);await writeFile('artifacts/pipes/installation-paused.json',g.snapshot());
for(let frame=0;frame<120;frame++)g.tick(.25);assert.equal(line(snap(g),id).work,partial,'A pause preserves partial corridor work');assert.equal(g.configure_water_connection(id,1,false),'ok');checkpoint(g);
let previousWork=line(snap(g),id).work;const observed=new Set([0]);
until(g,s=>{const p=line(s,id);if(p.work>previousWork){observed.add(Math.min(p.plan.cells.length-1,Math.floor(previousWork/4)));previousWork=p.work;}return p.phase==='active';},'All pipe cells and pump commissioned');
assert.equal(observed.size,quote.plan.cells.length,'Resident work advances along the complete corridor');checkpoint(g);await writeFile('artifacts/pipes/active.json',g.snapshot());
// Cooking consumes delivered water and creates genuine room for the pump.
until(g,s=>s.residents.find(r=>r.id===2).help?.task==='cook'||/Happy/.test(g.request(2,'cook',true)),'Ask a neighbour to cook using the connected kitchen');
until(g,s=>line(s,id).transferred>0,'Connected water reaches the consumer after actual use');checkpoint(g);await writeFile('artifacts/pipes/pumping.json',g.snapshot());
assert(Math.abs(line(snap(g),id).energy_used-line(snap(g),id).transferred*.025)<.001);
assert.equal(g.configure_water_connection(id,3,true),'ok');const transferred=line(snap(g),id).transferred;
for(let frame=0;frame<80;frame++)g.tick(.25);assert.equal(line(snap(g),id).transferred,transferred);checkpoint(g);await writeFile('artifacts/pipes/paused.json',g.snapshot());
assert.equal(g.configure_water_connection(id,3,false),'ok');const active=g.snapshot();
const night=new Game();assert(night.restore(active));until(night,s=>s.village.minutes%1440>=1260,'Actual evening for line-art review',2*1920);checkpoint(night);await writeFile('artifacts/pipes/night.json',night.snapshot());
// Controlled outage fixture: keep the real installation and water accounts,
// empty the night battery, and move owned buffer water back to its cistern.
const outage=new Game(),dark=snap(night),source=dark.village.water_supply.tanks.find(t=>t.owner.kind==='building'&&t.owner.id===0),target=dark.village.water_supply.tanks.find(t=>t.owner.kind==='building'&&t.owner.id===1);
assert.equal(dark.village.water_supply.trips.length,0);const back=Math.min(2,target.water[0],source.capacity[0]-source.water[0]);assert(back>0);target.water[0]-=back;source.water[0]+=back;dark.village.power.stored=0;assert(outage.restore(JSON.stringify(dark)));
const flow=line(snap(outage),id).transferred;for(let n=0;n<20;n++)outage.tick(.25);assert.equal(line(snap(outage),id).transferred,flow);assert.equal(snap(outage).environment.power.generation,0);checkpoint(outage);await writeFile('artifacts/pipes/outage.json',outage.snapshot());night.free();outage.free();
const moving=new Game();assert(moving.restore(active));assert.equal(moving.queue_building_work(0,'move',5,24),'ok');
until(moving,s=>s.village.buildings.find(b=>b.id===0).y===24,'Resident packs and moves the water source');assert.equal(line(snap(moving),id).phase,'removing');checkpoint(moving);await writeFile('artifacts/pipes/disconnected.json',moving.snapshot());
until(moving,s=>s.village.pipes.lines.some(p=>p.id!==id&&p.plan.from===0&&p.anchors[0].y===24),'Old route dismantled and replacement installation queued');checkpoint(moving);await writeFile('artifacts/pipes/replacement.json',moving.snapshot());
const receipts=snap(g).village.simulation.materials.received;
assert.equal(g.remove_water_connection(id),'ok');assert.equal(line(snap(g),id).removal_work,0);checkpoint(g);await writeFile('artifacts/pipes/removing.json',g.snapshot());
until(g,s=>line(s,id).phase==='retired','Resident dismantles the full route');checkpoint(g);await writeFile('artifacts/pipes/removed.json',g.snapshot());
for(const i of [8,9,10,14])assert.equal(snap(g).village.simulation.materials.received[i]-receipts[i],i===14?quote.parts[i]:Math.floor(quote.parts[i]/2));
const removed=g.snapshot();assert.notEqual(g.remove_water_connection(id),'ok');assert.equal(g.snapshot(),removed);
const bad=snap(g);bad.village.version=17;assert(!g.restore(JSON.stringify(bad)));assert.equal(g.snapshot(),removed);
g.free();moving.free();
console.log('PASS: actual town pickup, separate kit hauling, attended work along every corridor cell, commissioned pumping and energy spending, pause/resume, real source relocation and replacement, resident dismantling, once-only recovery, exact checkpoints and separate water/material accounts.');
