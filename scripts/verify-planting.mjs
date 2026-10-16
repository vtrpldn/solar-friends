import {startEmptySandbox} from './lib/empty-sandbox.mjs';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {resetMaterialLocations} from '../web/dev/material-fixture.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
await mkdir('artifacts/planting',{recursive:true});
const snap=g=>JSON.parse(g.snapshot());
function scene(crops=false,stock=true){
 const g=new Game();startEmptySandbox(g);
 if(crops){assert.equal(g.place('greenhouse',5,5),'ok');assert.equal(g.place('garden',8,5),'ok');}
 const f=snap(g),v=f.village;Object.assign(v,{mode:'story',minutes:540,arrived:true,food:60,meals:16,seedlings:0});
 v.economy.money=300000;v.economy.outside_jobs.fill(false);v.economy.stock[22]=stock?4:0;v.economy.stock[23]=1;
 Object.assign(v.progress,{completed:Array(4).fill(true),later_completed:Array(9).fill(true)});
 for(const r of f.residents)Object.assign(r,{task:'idle',trip:null,remaining:0,requested:false,energy:90,hunger:0,social:90,last_meal_slot:0,x:10+(r.id-2)*1.25,y:13,target_x:10+(r.id-2)*1.25,target_y:13,activity_batch:null,activity_store:null,activity_material:null,activity_building:null,walking:{}});
 if(crops)Object.assign(v.buildings[0].crop,{planted:true,moisture:480,growth:0,nursery:0});
 assert(g.restore(JSON.stringify(resetMaterialLocations(f))));return g;
}
function until(g,test,label,limit=14000){for(let n=0;n<limit;n++){const s=snap(g);if(test(s))return s;g.tick(.25);}throw Error(label+': '+JSON.stringify(snap(g).residents.map(r=>[r.name,r.task,r.reason])));}
function checkpoint(g){const saved=g.snapshot(),h=new Game();assert(h.restore(saved));assert.equal(h.snapshot(),saved);h.free();}
const g=scene(),before=snap(g);assert.equal(g.place_source(0,16,13),'ok');assert.equal(g.place_source(1,18,10),'ok');let s=snap(g);
assert.equal(s.village.water,before.village.water);assert(s.village.economy.sources.every(p=>!p.planted&&p.moisture===0&&p.growth===0));
assert.equal(s.environment.economy.materials[22].reserved,4);assert.equal(s.environment.economy.materials[22].available,0);assert.equal(s.environment.economy.materials[23].reserved,1);
await writeFile('artifacts/planting/queued.json',g.snapshot());
until(g,s=>s.village.logistics.shipments.some(h=>h.carrying&&h.material===22),'Real timber seedling cargo');checkpoint(g);await writeFile('artifacts/planting/forestry-cargo.json',g.snapshot());
until(g,s=>s.residents.some(r=>r.task==='source'&&r.activity_material===0&&Math.hypot(r.x-r.target_x,r.y-r.target_y)<.08)&&!s.village.economy.sources[0].planted,'Attended first planting');checkpoint(g);await writeFile('artifacts/planting/planting-work.json',g.snapshot());
const same=new Game();assert(same.restore(g.snapshot()));for(let n=0;n<120;n++){g.tick(.25);same.tick(.25);}assert.equal(same.snapshot(),g.snapshot());same.free();
s=until(g,s=>s.village.economy.sources.every(p=>p.planted),'Both first crops planted');assert.equal(s.village.economy.stock[22],0);assert.equal(s.village.economy.stock[23],0);assert(!s.village.progress.timber_replanted);assert.equal(s.village.simulation.materials.spent[22],4);assert.equal(s.village.simulation.materials.spent[23],1);checkpoint(g);await writeFile('artifacts/planting/planted.json',g.snapshot());
assert(JSON.parse(g.simulation_report()).materials.every(m=>m.difference===0));
const noStock=scene(false,false);assert.equal(noStock.place_source(0,16,13),'ok');for(let n=0;n<1920;n++)noStock.tick(.25);assert(!snap(noStock).village.economy.sources[0].planted);checkpoint(noStock);
const basket=Array(29).fill(0);basket[22]=4;until(noStock,()=>noStock.order_supplies_pickup(JSON.stringify(basket),0)==='ok','Town pickup order');
until(noStock,s=>s.residents.some(r=>r.trip?.purpose==='pickup'&&r.trip.phase==='away'),'Actual drive to fetch timber seedlings');
until(noStock,s=>s.village.economy.sources[0].planted,'Purchased stock is fetched, hauled and planted');assert(snap(noStock).village.economy.orders.some(o=>o.status==='delivered'&&o.items[22]===4));checkpoint(noStock);await writeFile('artifacts/planting/town-planted.json',noStock.snapshot());
const cancelled=scene();assert.equal(cancelled.place_source(0,16,13),'ok');until(cancelled,s=>s.village.logistics.shipments.some(h=>h.carrying&&h.material===22),'Planting cargo to cancel');assert.equal(cancelled.clear_source(0),'ok');until(cancelled,s=>!s.village.logistics.shipments.some(h=>h.carrying&&h.material===22),'Recover cancelled planting stock');assert.equal(snap(cancelled).village.economy.stock[22],4);assert.equal(snap(cancelled).village.simulation.materials.spent[22],0);checkpoint(cancelled);
const nursery=scene(true);until(nursery,s=>s.village.progress.seedlings_raised>0,'A greenhouse raises its own seedling');checkpoint(nursery);await writeFile('artifacts/planting/nursery.json',nursery.snapshot());
until(nursery,s=>s.village.logistics.shipments.some(h=>h.carrying&&h.material===21),'Real vegetable seedling cargo');checkpoint(nursery);await writeFile('artifacts/planting/vegetable-cargo.json',nursery.snapshot());
until(nursery,s=>s.village.logistics.stores.some(p=>p.owner.kind==='site'&&p.owner.id===1&&p.items[21]>0),'Seedling arrives at the garden');
s=until(nursery,s=>{if(s.village.progress.seedlings_used>0)return true;const r=s.residents.find(r=>r.id===1);if(!r.requested&&r.help?.finished!==null)nursery.request(1,'garden',true);return false;},'A resident uses a locally delivered vegetable seedling');
assert(s.village.buildings[1].crop.growth>=45&&s.village.buildings[1].crop.growth<60,'Observed the actual 25% planting head start');assert(s.village.progress.seedlings_raised>=s.village.progress.seedlings_used);checkpoint(nursery);await writeFile('artifacts/planting/seedling-used.json',nursery.snapshot());
assert(JSON.parse(nursery.simulation_report()).materials.every(m=>m.difference===0));
g.free();noStock.free();cancelled.free();nursery.free();console.log('PASS: first planting waits for real stock and attendance, separate timber/bamboo inputs, exact working checkpoints, actual town pickup and hauling, cancelled cargo recovery, local greenhouse output, delivered vegetable seedling use and reconciled materials.');
