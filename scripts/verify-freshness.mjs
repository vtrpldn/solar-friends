import {startEmptySandbox} from './lib/empty-sandbox.mjs';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {resetMaterialLocations} from '../web/dev/material-fixture.js';
import {freshnessMarkup,freshnessWarning} from '../web/freshness-ui.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
await mkdir('artifacts/freshness',{recursive:true});
const FOOD=16,MEALS=17,EGGS=18,life={16:5760,17:4320,18:11520},snap=g=>JSON.parse(g.snapshot());
const pot=(s,id)=>s.village.production.batches.find(b=>b.id===id);
const allLots=s=>[...s.village.logistics.stores,...s.village.logistics.shipments,...s.village.production.batches].flatMap(p=>p.food_lots);
function checkpoint(g){const saved=g.snapshot(),copy=new Game();assert(copy.restore(saved),'Dated snapshot restores');assert.equal(copy.snapshot(),saved);copy.free();}
function conserved(g){assert(JSON.parse(g.simulation_report()).materials.every(m=>m.difference===0));}
function until(g,test,label,limit=12000){for(let frame=0;frame<limit;frame++){const s=snap(g);if(test(s))return s;g.tick(.25);}throw Error(label+': '+JSON.stringify(snap(g).residents.map(r=>[r.name,r.task,r.reason,r.help?.reason])));}
function scene(kitchen=true,eggs=0){
  const g=new Game();startEmptySandbox(g);if(kitchen)assert.equal(g.place('kitchen',6,6),'ok');
  const s=snap(g);Object.assign(s.village,{mode:'story',arrived:true,minutes:540,food:36,meals:0,water:40});
  Object.assign(s.village.supplies,{eggs,use_eggs:eggs>0,feed_hens:false});
  Object.assign(s.village.circular,{biogas:eggs?3:0,use_biogas:true});
  Object.assign(s.village.progress,{completed:Array(4).fill(true),later_completed:Array(9).fill(true),use_tools:false});
  s.village.economy.outside_jobs=Array(5).fill(false);
  for(const r of s.residents)Object.assign(r,{task:'idle',trip:null,remaining:0,requested:false,energy:90,hunger:0,social:90,last_meal_slot:0,x:10+(r.id-2)*1.25,y:13,target_x:10+(r.id-2)*1.25,target_y:13,activity_batch:null,activity_store:null,activity_material:null,activity_building:null,walking:{}});
  assert(g.restore(JSON.stringify(resetMaterialLocations(s))));assert.equal(g.set_production_target(MEALS,0),'ok');return g;
}
// Fixture authoring chooses a later epoch; ordinary game transfers never restamp.
function epoch(s,now=6300){s.village.minutes=now;for(const l of allLots(s)){l.produced=now;l.expires=now+life[l.material];}return s;}
function aged(material,amount,expires){return {material,amount,produced:expires-life[material],expires};}
const g=scene();let s=until(g,s=>s.village.logistics.shipments.some(h=>h.carrying&&h.material===FOOD),'Carry dated ingredients');
const h=s.village.logistics.shipments.find(h=>h.carrying&&h.material===FOOD),dates=structuredClone(h.food_lots);
assert.equal(dates[0].produced,540);checkpoint(g);conserved(g);
const interrupted=new Game(),tired=structuredClone(s);tired.residents.find(r=>r.id===h.resident).energy=20;
assert(interrupted.restore(JSON.stringify(tired)));interrupted.tick(.25);
const ground=snap(interrupted).village.logistics.stores.find(p=>p.owner.kind==='ground'&&p.items[FOOD]>0);
assert.deepEqual(ground.food_lots,dates,'Putting food down preserves its original age');checkpoint(interrupted);conserved(interrupted);
// A partial loss changes actual cargo and accounting, not only a summary.
const agedCargo=epoch(structuredClone(s)),load=agedCargo.village.logistics.shipments.find(x=>x.id===h.id);
assert(load.amount>=2);load.food_lots=[aged(FOOD,1,6300.5),aged(FOOD,load.amount-1,12060)];
assert(g.restore(JSON.stringify(agedCargo)));await writeFile('artifacts/freshness/cargo.json',g.snapshot());
const copy=new Game();assert(copy.restore(g.snapshot()));g.tick(.25);copy.tick(.25);assert.equal(copy.snapshot(),g.snapshot());
s=snap(g);assert.equal(s.village.freshness.expired[FOOD],1);assert.equal(s.village.food,35);
assert.equal(s.village.logistics.shipments.find(x=>x.id===h.id).amount,h.amount-1);checkpoint(g);conserved(g);
g.tick(.25);assert.equal(snap(g).village.freshness.expired[FOOD],1,'Expiry is once-only');
await writeFile('artifacts/freshness/partial-cargo.json',g.snapshot());
// Oldest portions are eaten first at their real location.
const fifo=scene(false),mixed=epoch(snap(fifo)),store=mixed.village.logistics.stores.find(p=>p.items[FOOD]);
store.food_lots=[aged(FOOD,1,6360),aged(FOOD,store.items[FOOD]-1,12060)];
const eater=mixed.residents.find(r=>r.id===0);Object.assign(eater,{x:store.x,y:store.y,target_x:store.x,target_y:store.y,hunger:80});
assert(fifo.restore(JSON.stringify(mixed)));assert.match(fifo.request(0,'eat',false),/Happy/);
until(fifo,s=>s.residents.find(r=>r.id===0).help?.phase==='complete','Eat oldest real portion');
s=snap(fifo);assert.equal(s.village.freshness.expired[FOOD],0);assert(!allLots(s).some(l=>l.expires===6360));assert.equal(s.village.food,35);checkpoint(fifo);conserved(fifo);
// Eating prepared food must not be displaced by older raw ingredients.
const cooked=scene(false),ready=epoch(snap(cooked));
const cookingStore=ready.village.logistics.stores.find(p=>p.items[FOOD]);
ready.village.meals=2;ready.village.economy.stock[MEALS]=2;ready.village.simulation.materials.opening[MEALS]=2;
cookingStore.items[MEALS]=2;cookingStore.food_lots=[aged(FOOD,cookingStore.items[FOOD],6360),aged(MEALS,2,10620)];
Object.assign(ready.residents.find(r=>r.id===0),{x:cookingStore.x,y:cookingStore.y,target_x:cookingStore.x,target_y:cookingStore.y,hunger:80});
assert(cooked.restore(JSON.stringify(ready)));assert.match(cooked.request(0,'eat',false),/Happy/);
assert.equal(snap(cooked).residents.find(r=>r.id===0).activity_material,MEALS);
until(cooked,s=>s.residents.find(r=>r.id===0).help?.phase==='complete','Eat prepared food before older raw ingredients');
assert.equal(snap(cooked).village.food,36);assert.equal(snap(cooked).village.meals,1);checkpoint(cooked);conserved(cooked);
// Store expiry makes space and cannot be reversed by a reload.
const waste=scene(false),old=epoch(snap(waste)),pile=old.village.logistics.stores.find(p=>p.items[FOOD]);
pile.food_lots=[aged(FOOD,pile.items[FOOD],6300.5)];assert(waste.restore(JSON.stringify(old)));
assert.match(freshnessMarkup(snap(waste)),/36 to use within a day/);assert.match(freshnessWarning(snap(waste)),/Use within a day: 36 ingredients/);await writeFile('artifacts/freshness/use-soon.json',waste.snapshot());
waste.tick(.25);s=snap(waste);assert.equal(s.village.food,0);assert.equal(s.village.freshness.expired[FOOD],36);assert.match(freshnessMarkup(s),/Spoiled so far: 36 ingredients/);assert.equal(freshnessWarning(s),'');checkpoint(waste);conserved(waste);
await writeFile('artifacts/freshness/spoiled.json',waste.snapshot());
until(waste,s=>s.village.food>0,'Recover a pantry after spoilage');checkpoint(waste);conserved(waste);
// An interrupted egg pot returns fresh eggs and gas, never spoiled ingredients.
const kitchen=scene(true,4);assert.match(kitchen.visit_building(0,0),/Happy/);
const id=snap(kitchen).residents.find(r=>r.id===0).help.batch;
s=until(kitchen,s=>pot(s,id).work>=2&&pot(s,id).work<9,'Attend a real egg pot');
const interruptedPot=epoch(s),batch=pot(interruptedPot,id),heldEggs=interruptedPot.village.supplies.eggs,heldGas=interruptedPot.village.circular.biogas;
batch.food_lots.find(l=>l.material===FOOD).produced=540.5;batch.food_lots.find(l=>l.material===FOOD).expires=6300.5;
const spent=interruptedPot.village.simulation.materials.spent[FOOD];
assert(kitchen.restore(JSON.stringify(interruptedPot)));await writeFile('artifacts/freshness/interrupted-pot.json',kitchen.snapshot());kitchen.tick(.25);
s=snap(kitchen);assert.equal(pot(s,id).phase,'cancelled');assert(pot(s,id).spoiled);assert.equal(s.village.meals,0);
assert.equal(s.village.supplies.eggs,heldEggs+2);assert.equal(s.village.circular.biogas,heldGas+1);assert.equal(s.village.freshness.expired[FOOD],2);
assert.equal(s.village.simulation.materials.spent[FOOD],spent,'Committed food cannot be spent twice');assert(!s.village.production.sites.find(site=>site.id===batch.site).paused);
assert(allLots(s).filter(l=>l.material===EGGS).every(l=>l.produced===6300));checkpoint(kitchen);conserved(kitchen);
assert.notEqual(kitchen.cancel_production_batch(id),'ok');await writeFile('artifacts/freshness/pot-spoiled.json',kitchen.snapshot());
// Forged dates, amounts and expired saves are rejected atomically.
const before=fifo.snapshot();for(const [field,value] of [['amount',600],['produced',99999],['expires',99999]]){const bad=snap(fifo);bad.village.logistics.stores.find(p=>p.food_lots.length).food_lots[0][field]=value;assert(!fifo.restore(JSON.stringify(bad)));assert.equal(fifo.snapshot(),before);}
const sandbox=new Game();startEmptySandbox(sandbox);const free=epoch(snap(sandbox),20000);for(const l of allLots(free)){l.produced=0;l.expires=life[l.material];}assert(sandbox.restore(JSON.stringify(free)));sandbox.tick(.25);assert.equal(snap(sandbox).village.freshness.expired.reduce((a,b)=>a+b,0),0);assert.match(freshnessMarkup(snap(sandbox)),/does not spoil in Sandbox/);checkpoint(sandbox);
for(const game of [g,copy,interrupted,fifo,cooked,waste,kitchen,sandbox])game.free();
console.log('PASS: food age survives real hauling and recovery; FIFO eating, partial cargo expiry, once-only losses, fresh-only pot refunds, exact replay, invalid-date rejection, recovery and forgiving Sandbox are verified.');
