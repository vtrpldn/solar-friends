import {startEmptySandbox} from './lib/empty-sandbox.mjs';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {resetMaterialLocations} from '../web/dev/material-fixture.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
await mkdir('artifacts/food',{recursive:true});
const FOOD=16,MEALS=17,EGGS=18,snap=g=>JSON.parse(g.snapshot());
const person=(s,id=0)=>s.residents.find(r=>r.id===id);
const pantry=s=>s.village.logistics.stores.find(p=>p.owner.kind==='pantry'&&p.owner.id===0);
function checkpoint(g){const saved=g.snapshot(),copy=new Game();assert(copy.restore(saved));assert.equal(copy.snapshot(),saved);copy.free();}
function conserved(g){assert(JSON.parse(g.simulation_report()).materials.every(m=>m.difference===0));}
function until(g,test,label,limit=12000){for(let frame=0;frame<limit;frame++){const s=snap(g);if(test(s))return s;g.tick(.25);}throw Error(label+': '+JSON.stringify(snap(g).residents.map(r=>[r.name,r.task,r.reason])));}
const g=new Game();startEmptySandbox(g);assert.equal(g.place('kitchen',6,6),'ok');
const fixture=snap(g);Object.assign(fixture.village,{mode:'story',arrived:true,minutes:540,food:36,meals:0,water:40});
fixture.village.supplies.eggs=0;fixture.village.supplies.use_eggs=false;fixture.village.supplies.feed_hens=false;
for(const r of fixture.residents)Object.assign(r,{task:'idle',trip:null,remaining:0,requested:false,energy:90,hunger:0,social:90,last_meal_slot:0,x:10+(r.id-2)*1.25,y:13,target_x:10+(r.id-2)*1.25,target_y:13,activity_batch:null,activity_store:null,activity_material:null,activity_building:null,walking:{}});
assert(g.restore(JSON.stringify(resetMaterialLocations(fixture))));
await writeFile('artifacts/food/start.json',g.snapshot());
assert.equal(pantry(snap(g)).items[FOOD],0);
let s=until(g,s=>s.village.logistics.shipments.some(h=>h.carrying&&h.material===FOOD&&h.to===pantry(s).id),'Kitchen ingredient haul');
const cargo=s.village.logistics.shipments.find(h=>h.carrying&&h.material===FOOD&&h.to===pantry(s).id);
assert.equal(s.village.food,36);assert.equal(s.village.meals,0);assert(cargo.amount>0);
await writeFile('artifacts/food/cargo.json',g.snapshot());checkpoint(g);conserved(g);
const interrupted=new Game(),rest=structuredClone(s);person(rest,cargo.resident).energy=20;assert(interrupted.restore(JSON.stringify(rest)));interrupted.tick(.25);
assert.equal(snap(interrupted).village.food,36);assert(snap(interrupted).village.logistics.stores.some(p=>p.owner.kind==='ground'&&p.items[FOOD]>0));checkpoint(interrupted);conserved(interrupted);interrupted.free();
s=until(g,s=>s.village.simulation.materials.received[MEALS]>0,'Cook delivered ingredients');
assert.equal(s.village.simulation.materials.received[MEALS],5);assert.equal(s.village.simulation.materials.spent[FOOD],3);
assert.equal(pantry(s).items[MEALS],5);assert.equal(s.village.logistics.stores.find(p=>p.owner.kind==='camp').items[MEALS],0);
await writeFile('artifacts/food/cooked.json',g.snapshot());checkpoint(g);conserved(g);
// A meal break must keep the kitchen pantry in place instead of shuttling it to camp.
for(let frame=0;frame<40;frame++){g.tick(.25);const current=snap(g);assert(!current.village.logistics.shipments.some(h=>h.from===pantry(current).id&&h.material===MEALS));}
// A public helping request must walk to the actual kitchen portions.
const hungry=snap(g),r=person(hungry);Object.assign(r,{task:'idle',remaining:0,requested:false,energy:90,hunger:80,activity_store:null,activity_material:null,activity_building:null,activity_batch:null,walking:{},x:10,y:13,target_x:10,target_y:13});
assert(g.restore(JSON.stringify(hungry)));assert.match(g.request(0,'eat',false),/Happy/);
s=snap(g);assert.equal(person(s).activity_store,pantry(s).id);assert.equal(person(s).activity_material,MEALS);
const eaten=s.village.supplies.portions_eaten;g.tick(.25);assert.equal(snap(g).village.supplies.portions_eaten,eaten,'No remote meals while travelling');
await writeFile('artifacts/food/eating-route.json',g.snapshot());checkpoint(g);
s=until(g,s=>person(s).help?.task==='eat'&&person(s).help.phase==='complete','Eat the requested local portion');
assert(person(s).hunger<30);assert(s.village.simulation.materials.spent[MEALS]>=1);conserved(g);checkpoint(g);
await writeFile('artifacts/food/eaten.json',g.snapshot());
const invalid=snap(g);invalid.village.food+=1;const before=g.snapshot();assert(!g.restore(JSON.stringify(invalid)));assert.equal(g.snapshot(),before);
const order=Array(s.environment.economy.materials.length).fill(0);order[FOOD]=3;order[MEALS]=2;order[EGGS]=1;
assert.equal(g.order_supplies(JSON.stringify(order)),'ok');const id=snap(g).village.economy.orders.at(-1).id;
s=until(g,s=>s.village.economy.orders.find(o=>o.id===id).status==='delivered','Town food delivery');
assert(s.village.simulation.materials.received[FOOD]>=3);assert(s.village.simulation.materials.received[EGGS]>=1);conserved(g);checkpoint(g);
g.free();console.log('PASS: carried kitchen inputs, interrupted food recovery, local cooked meals, routed portion claims, no remote eating, town food delivery, exact reloads and zero food accounting discrepancies.');
