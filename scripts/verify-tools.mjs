import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {resetMaterialLocations} from '../web/dev/material-fixture.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
await mkdir('artifacts/tools',{recursive:true});
const TOOLS=15,snap=g=>JSON.parse(g.snapshot()),person=(s,id=0)=>s.residents.find(r=>r.id===id);
function checkpoint(g){const saved=g.snapshot(),copy=new Game();assert(copy.restore(saved));assert.equal(copy.snapshot(),saved);copy.free();}
function scene(){
 const g=new Game();g.start_mode('sandbox');assert.equal(g.place('workshop',6,6),'ok');assert.equal(g.place('garden',14,10),'ok');
 const s=snap(g);Object.assign(s.village,{mode:'story',arrived:true,minutes:540,food:80,meals:10,water:40});
 Object.assign(s.village.progress,{completed:Array(4).fill(true),later_completed:Array(9).fill(true),use_tools:false,tool_uses:0});
 s.village.economy.outside_jobs=Array(5).fill(false);
 for(const r of s.residents)Object.assign(r,{task:'idle',trip:null,remaining:0,requested:false,energy:90,hunger:10,social:90,last_meal_slot:0,x:10+(r.id-2)*1.25,y:13,target_x:10+(r.id-2)*1.25,target_y:13,activity_batch:null});
 assert(g.restore(JSON.stringify(resetMaterialLocations(s))));return g;
}
function until(g,predicate,label,frames=12000){
 for(let frame=0;frame<frames;frame++){const s=snap(g);if(predicate(s))return s;g.tick(.25);}
 const s=snap(g);throw Error(`${label}: Day ${1+Math.floor(s.village.minutes/1440)} ${person(s).task} ${person(s).help?.reason}`);
}
const g=scene();await writeFile('artifacts/tools/start.json',g.snapshot());
for(let id=1;id<5;id++)g.set_resident_job(id,true);
const wood=snap(g).village.wood;
assert.match(g.visit_building(0,0),/Happy/);
let s=snap(g),help=person(s).help,b=s.village.production.batches.find(b=>b.id===help.batch);
assert.equal(help.task,'craft');assert.equal(help.building,0);assert.equal(b.material,TOOLS);assert(b.manual);
assert.equal(person(s).task,'haul','Crafting includes its own timber delivery');
const duplicate=g.snapshot();assert.match(g.visit_building(0,0),/already accepted/);assert.equal(g.snapshot(),duplicate);
let carried=false;
until(g,s=>{
 const inbound=s.village.logistics.shipments.find(h=>h.carrying&&s.village.logistics.stores.some(p=>p.id===h.to&&p.owner.kind==='production'));
 if(inbound)carried=true;
 return s.village.production.batches.some(b=>b.id===help.batch&&b.work>1&&b.work<9);
},'Start actual attended tool production');
assert(carried);s=snap(g);b=s.village.production.batches.find(b=>b.id===help.batch);
assert.equal(s.village.wood,wood-8);assert.equal(s.village.progress.tool_uses,0);
await writeFile('artifacts/tools/working.json',g.snapshot());checkpoint(g);
const cancellation=new Game();assert(cancellation.restore(g.snapshot()));
assert.equal(cancellation.cancel_production_batch(b.id),'ok');
assert.equal(snap(cancellation).village.wood,wood);assert.equal(snap(cancellation).village.progress.tool_uses,0);
assert.notEqual(cancellation.cancel_production_batch(b.id),'ok');checkpoint(cancellation);
const resting=snap(g);person(resting).energy=20;assert(g.restore(JSON.stringify(resting)));g.tick(.25);
assert.equal(person(snap(g)).task,'rest');assert.equal(person(snap(g)).help.phase,'paused');
const copy=new Game();assert(copy.restore(g.snapshot()));
for(let frame=0;frame<12000;frame++){
 s=snap(g);if(s.village.production.accounting.outputs[TOOLS]===12)break;
 g.tick(.25);copy.tick(.25);assert.equal(copy.snapshot(),g.snapshot(),'Interrupted crafting replays the same saved batch and input spending');
}
s=snap(g);assert.equal(s.village.production.accounting.outputs[TOOLS],12);assert.equal(s.village.progress.tools_crafted,1);
assert.equal(s.village.progress.tool_uses,12);assert.equal(person(s).help.phase,'complete');assert.equal(s.village.wood,wood-8);
assert.equal(s.village.logistics.stores.find(p=>p.owner.kind==='production'&&p.owner.id===b.site).items[TOOLS],12,'Tools start at the workshop buffer');
assert.equal(s.village.logistics.stores.find(p=>p.owner.kind==='camp').items[TOOLS],0);
await writeFile('artifacts/tools/finished.json',g.snapshot());checkpoint(g);
g.set_tools_enabled(true);
assert.match(g.request(0,'garden',false),/Happy/);
until(g,s=>s.village.buildings.find(b=>b.id===1).crop.planted,'Plant a real garden');
let toolCargo=false;
until(g,s=>{
 if(s.village.logistics.shipments.some(h=>h.material===TOOLS&&h.carrying))toolCargo=true;
 return s.village.logistics.stores.some(p=>p.owner.kind==='site'&&p.owner.id===1&&p.items[TOOLS]===1);
},'Deliver a tool use to the planted bed');
assert(toolCargo);assert.equal(snap(g).village.progress.tool_uses,12,'Hauling keeps ownership unchanged');
await writeFile('artifacts/tools/at-garden.json',g.snapshot());checkpoint(g);
until(g,s=>{const c=s.village.buildings.find(b=>b.id===1).crop;return c.growth>=180;},'Let the planted crop grow passively');
const harvests=snap(g).village.harvests;
assert.match(g.request(0,'garden',false),/Happy/);
until(g,s=>s.village.harvests>harvests,'Harvest with physically delivered tools');
s=snap(g);assert.equal(s.village.progress.tool_uses,11);assert.equal(s.village.simulation.materials.spent[TOOLS],1);
assert(JSON.parse(g.simulation_report()).materials.every(m=>m.difference===0));checkpoint(g);
await writeFile('artifacts/tools/harvested.json',g.snapshot());
for(const game of [g,copy,cancellation])game.free();
console.log('PASS: targeted workshop requests haul real inputs, retain partial work through rest, replay exactly, recover once on cancellation, create tools at the workshop, carry them to a planted bed and consume one actual local use at harvest.');
