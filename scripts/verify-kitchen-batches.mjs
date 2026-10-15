import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {resetMaterialLocations} from '../web/dev/material-fixture.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
await mkdir('artifacts/kitchen',{recursive:true});
const FOOD=16,MEALS=17,EGGS=18,snap=g=>JSON.parse(g.snapshot()),person=s=>s.residents.find(r=>r.id===0);
const pot=(s,id)=>s.village.production.batches.find(b=>b.id===id);
function checkpoint(g){const saved=g.snapshot(),copy=new Game();assert(copy.restore(saved));assert.equal(copy.snapshot(),saved);copy.free();}
function conserved(g){assert(JSON.parse(g.simulation_report()).materials.every(m=>m.difference===0));}
function until(g,test,label,limit=14000){
  for(let frame=0;frame<limit;frame++){const s=snap(g);if(test(s))return s;g.tick(.25);}
  throw Error(label+': '+JSON.stringify(snap(g).residents.map(r=>[r.name,r.task,r.reason,r.help?.reason])));
}
function scene(eggs=false,gas=0){
  const g=new Game();g.start_mode('sandbox');
  assert.equal(g.place('kitchen',6,6),'ok');assert.equal(g.place('kitchen',16,10),'ok');
  const s=snap(g);Object.assign(s.village,{mode:'story',arrived:true,minutes:540,food:36,meals:0,water:40});
  Object.assign(s.village.supplies,{eggs:eggs?4:0,use_eggs:eggs,feed_hens:false});
  Object.assign(s.village.circular,{biogas:gas,use_biogas:true});
  Object.assign(s.village.progress,{completed:Array(4).fill(true),later_completed:Array(9).fill(true),use_tools:false});
  s.village.economy.outside_jobs=Array(5).fill(false);
  for(const r of s.residents)Object.assign(r,{task:'idle',trip:null,remaining:0,requested:false,energy:90,hunger:0,social:90,last_meal_slot:0,x:10+(r.id-2)*1.25,y:13,target_x:10+(r.id-2)*1.25,target_y:13,activity_batch:null,activity_store:null,activity_material:null,activity_building:null,walking:{}});
  assert(g.restore(JSON.stringify(resetMaterialLocations(s))));
  assert.equal(g.set_production_target(MEALS,0),'ok');
  for(let id=1;id<5;id++)assert(g.set_resident_job(id,true));
  return g;
}
const g=scene();await writeFile('artifacts/kitchen/start.json',g.snapshot());
assert.match(g.visit_building(0,1),/Happy/);
let s=snap(g),id=person(s).help.batch,b=pot(s,id);
assert.equal(person(s).help.task,'cook');assert.equal(person(s).help.building,1);
assert.equal(s.village.production.sites.find(site=>site.id===b.site).building,1);
assert.equal(b.material,MEALS);assert.equal(b.output,5);assert(b.manual);
assert.equal(person(s).task,'haul','The requested cook brings ingredients to the selected kitchen');
const accepted=g.snapshot();assert.match(g.visit_building(0,1),/already accepted/);assert.equal(g.snapshot(),accepted);
let carried=false;
s=until(g,s=>{
  carried||=s.village.logistics.shipments.some(h=>h.carrying&&h.material===FOOD&&s.village.logistics.stores.some(p=>p.id===h.to&&p.owner.kind==='pantry'&&p.owner.id===1));
  return pot(s,id).work>=2&&pot(s,id).work<9;
},'Haul and start the selected pot');
assert(carried);assert.equal(s.village.simulation.materials.spent[FOOD],3);assert.equal(s.village.meals,0);
await writeFile('artifacts/kitchen/working.json',g.snapshot());checkpoint(g);conserved(g);
const cancellation=new Game();assert(cancellation.restore(g.snapshot()));
const foodBefore=s.village.food;assert.equal(cancellation.cancel_production_batch(id),'ok');
assert.equal(snap(cancellation).village.food,foodBefore+3);assert.equal(snap(cancellation).village.meals,0);
assert.notEqual(cancellation.cancel_production_batch(id),'ok');checkpoint(cancellation);conserved(cancellation);
await writeFile('artifacts/kitchen/cancelled.json',cancellation.snapshot());
const dry=new Game(),dryState=snap(g);dryState.village.water=0;dryState.village.circular.reclaimed=20;
assert(dry.restore(JSON.stringify(dryState)));dry.tick(.25);
assert.equal(pot(snap(dry),id).work,pot(s,id).work,'Cooking cannot use reclaimed water');
assert.equal(snap(dry).village.meals,0);checkpoint(dry);
await writeFile('artifacts/kitchen/waiting-water.json',dry.snapshot());
const rested=snap(g);person(rested).energy=20;assert(g.restore(JSON.stringify(rested)));g.tick(.25);
assert.equal(person(snap(g)).task,'rest');assert.equal(person(snap(g)).help.phase,'paused');
const copy=new Game();assert(copy.restore(g.snapshot()));
for(let frame=0;frame<14000;frame++){
  if(pot(snap(g),id).phase==='complete')break;
  g.tick(.25);copy.tick(.25);assert.equal(copy.snapshot(),g.snapshot(),'Interrupted pots replay exactly');
}
s=snap(g);assert.equal(pot(s,id).phase,'complete');assert.equal(person(s).help.phase,'complete');
assert.equal(s.village.production.accounting.outputs[MEALS],5);assert.equal(s.village.production.accounting.inputs[FOOD],3);
assert.equal(s.village.logistics.stores.find(p=>p.owner.kind==='pantry'&&p.owner.id===1).items[MEALS],5);
assert.equal(s.village.logistics.stores.find(p=>p.owner.kind==='camp').items[MEALS],0);
assert.equal(s.village.situations.cooking[0][0],1);checkpoint(g);conserved(g);
await writeFile('artifacts/kitchen/finished.json',g.snapshot());
const egg=scene(true,4);assert.match(egg.visit_building(0,1),/Happy/);
const eggId=person(snap(egg)).help.batch;
until(egg,s=>pot(s,eggId).work>=2&&pot(s,eggId).work<9,'Start an egg and gas pot');
s=snap(egg);assert.equal(pot(s,eggId).output,8);assert(pot(s,eggId).biogas);
assert.equal(s.village.circular.biogas,3);const ingredients=s.village.food,eggs=s.village.supplies.eggs;
checkpoint(egg);assert.equal(egg.cancel_production_batch(eggId),'ok');
s=snap(egg);assert.equal(s.village.circular.biogas,4);assert.equal(s.village.food,ingredients+2);assert.equal(s.village.supplies.eggs,eggs+2);
assert.equal(s.village.production.accounting.biogas_used,0);assert.notEqual(egg.cancel_production_batch(eggId),'ok');checkpoint(egg);conserved(egg);
for(const game of [g,copy,cancellation,dry,egg])game.free();
console.log('PASS: selected kitchens share saved pots, cooks haul their own ingredients, rest preserves labour, replay is exact, fresh water stays distinct, output remains local, and food/egg/gas cancellation is once-only.');
