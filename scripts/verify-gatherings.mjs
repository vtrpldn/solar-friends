import {startEmptySandbox} from './lib/empty-sandbox.mjs';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {resetMaterialLocations} from '../web/dev/material-fixture.js';
import {gatheringInfo} from '../web/gathering-ui.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
await mkdir('artifacts/gathering',{recursive:true});
const MEALS=17,snap=g=>JSON.parse(g.snapshot()),plan=s=>s.village.progress.gathering_delivery;
function checkpoint(g){const saved=g.snapshot(),copy=new Game();assert(copy.restore(saved));assert.equal(copy.snapshot(),saved);copy.free();}
function conserved(g){assert(JSON.parse(g.simulation_report()).materials.every(m=>m.difference===0));}
function until(g,test,label,limit=5000){
  for(let frame=0;frame<limit;frame++){const s=snap(g);if(test(s))return s;g.tick(.25);}
  throw Error(label+': '+JSON.stringify({plan:plan(snap(g)),residents:snap(g).residents.map(r=>[r.name,r.task,r.reason])}));
}
const g=new Game();startEmptySandbox(g);
assert.equal(g.place('square',6,6),'ok');assert.equal(g.place('kitchen',14,6),'ok');
const fixture=snap(g);Object.assign(fixture.village,{mode:'story',arrived:true,minutes:540,food:60,meals:10,water:40});
Object.assign(fixture.village.progress,{completed:Array(4).fill(true),later_completed:Array(9).fill(true),use_tools:false});
fixture.village.economy.outside_jobs=Object.fromEntries(Array.from({length:5},(_,id)=>[id,false]));
for(const r of fixture.residents)Object.assign(r,{task:'idle',trip:null,remaining:0,requested:false,energy:90,hunger:0,social:90,last_meal_slot:0,x:10+(r.id-2)*1.25,y:13,target_x:10+(r.id-2)*1.25,target_y:13,activity_batch:null,activity_store:null,activity_material:null,activity_building:null,walking:{}});
assert(g.restore(JSON.stringify(resetMaterialLocations(fixture))));assert.equal(g.set_production_target(MEALS,0),'ok');
await writeFile('artifacts/gathering/start.json',g.snapshot());
assert.equal(g.host_gathering(),'ok');
let s=snap(g);assert.equal(s.village.meals,10);assert.equal(plan(s).phase,'preparing');assert.equal(plan(s).building,0);
assert.equal(s.environment.economy.materials[MEALS].reserved,5);assert.equal(s.environment.economy.materials[MEALS].available,5);
assert.match(gatheringInfo(s.village).summary,/0\/5 meals delivered/);
const accepted=g.snapshot();assert.notEqual(g.host_gathering(),'ok');assert.equal(g.snapshot(),accepted);
await writeFile('artifacts/gathering/planned.json',g.snapshot());checkpoint(g);conserved(g);
s=until(g,s=>s.village.logistics.shipments.some(h=>h.to===plan(s).store&&h.material===MEALS&&h.carrying),'Carry five real portions');
assert.equal(s.village.meals,10);assert.equal(s.village.progress.gathering_until,0);assert.equal(plan(s).spent_after,null);
await writeFile('artifacts/gathering/cargo.json',g.snapshot());checkpoint(g);
const cancelled=new Game();assert(cancelled.restore(g.snapshot()));assert.equal(cancelled.cancel_gathering(),'ok');assert.notEqual(cancelled.cancel_gathering(),'ok');cancelled.tick(.25);
const recovered=snap(cancelled);assert.equal(recovered.village.meals,10);assert.equal(plan(recovered).phase,'cancelled');
assert(recovered.village.logistics.stores.some(p=>p.owner.kind==='ground'&&p.items[MEALS]>0));checkpoint(cancelled);conserved(cancelled);
await writeFile('artifacts/gathering/cancelled.json',cancelled.snapshot());
const carrier=s.village.logistics.shipments.find(h=>h.to===plan(s).store&&h.carrying).resident;
const tired=structuredClone(s);tired.residents.find(r=>r.id===carrier).energy=20;
const rested=new Game();assert(rested.restore(JSON.stringify(tired)));rested.tick(.25);
assert.equal(snap(rested).village.meals,10);assert(snap(rested).village.logistics.stores.some(p=>p.owner.kind==='ground'&&p.items[MEALS]>0));
checkpoint(rested);conserved(rested);await writeFile('artifacts/gathering/interrupted.json',rested.snapshot());
const copy=new Game();assert(copy.restore(g.snapshot()));
let serving=false;
for(let frame=0;frame<5000;frame++){
  s=snap(g);if(plan(s).phase==='complete')break;
  if(!serving&&plan(s).phase==='serving'&&plan(s).spent_after==null){serving=true;await writeFile('artifacts/gathering/table.json',g.snapshot());assert.equal(s.village.logistics.stores.find(p=>p.id===plan(s).store).items[MEALS],5);}
  g.tick(.25);copy.tick(.25);assert.equal(copy.snapshot(),g.snapshot(),'Every delivery and attendance checkpoint continues exactly');
}
s=snap(g);assert(serving);assert.equal(plan(s).phase,'complete');assert.equal(s.village.progress.gatherings,1);assert(plan(s).spent_after>=5);assert.equal(s.village.supplies.portions_eaten,5);
assert.equal(s.environment.economy.materials[MEALS].reserved,0);assert.equal(gatheringInfo(s.village).active,false);
const attendees=plan(s).attended;assert(attendees.toString(2).replaceAll('0','').length>=3);
for(let i=0;i<5;i++)for(let j=0;j<5;j++)assert.equal(s.village.progress.friendships[i*5+j],Number(i!==j&&(attendees&(1<<i))!==0&&(attendees&(1<<j))!==0));
checkpoint(g);conserved(g);await writeFile('artifacts/gathering/complete.json',g.snapshot());
const moving=new Game();assert(moving.restore(await readFile('artifacts/gathering/table.json','utf8')));
assert.equal(moving.queue_building_work(0,'move',18,18),'ok');moving.tick(.25);
assert.equal(plan(snap(moving)).phase,'cancelled');assert.equal(snap(moving).village.progress.gathering_until,0);
checkpoint(moving);conserved(moving);
const dusk=new Game(),late=JSON.parse(await readFile('artifacts/gathering/planned.json','utf8'));late.village.minutes=late.village.progress.gathering_delivery.deadline;
assert(dusk.restore(JSON.stringify(late)));dusk.tick(.25);assert.equal(plan(snap(dusk)).phase,'cancelled');assert.equal(snap(dusk).village.meals,10);assert.match(gatheringInfo(snap(dusk).village).summary,/Add a road from the pantry/);checkpoint(dusk);conserved(dusk);
const evening=new Game(),eveningState=JSON.parse(await readFile('artifacts/gathering/start.json','utf8'));eveningState.village.minutes=945;
assert(evening.restore(JSON.stringify(eveningState)));assert.equal(evening.host_gathering(),'ok');
let restedOvernight=false;
s=until(evening,s=>{restedOvernight||=s.village.minutes>=1440&&plan(s).phase==='preparing';return plan(s).phase==='complete';},'Energetic neighbours prepare an afternoon plan',6000);
assert(!restedOvernight);assert.equal(Math.floor(plan(s).started/1440),0);assert.equal(s.village.progress.gathering_day,0);assert.notEqual(evening.host_gathering(),'ok');checkpoint(evening);conserved(evening);
await writeFile('artifacts/gathering/overnight.json',evening.snapshot());
const before=g.snapshot(),bad=snap(g);bad.village.progress.gathering_delivery.spent_after=Number.MAX_SAFE_INTEGER;
assert(!g.restore(JSON.stringify(bad)));assert.equal(g.snapshot(),before);
for(const game of [g,copy,cancelled,rested,moving,dusk,evening])game.free();
console.log('PASS: shared-table food is physically carried, reserved without premature consumption, recovered through rest/cancellation/moving/dusk, served once after attendance, and exactly replayed with conserved stock.');
