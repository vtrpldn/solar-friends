import {startEmptySandbox} from './lib/empty-sandbox.mjs';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {resetMaterialLocations} from '../web/dev/material-fixture.js';
const pkg=process.env.SOLAR_WASM_DIR?pathToFileURL(path.resolve(process.env.SOLAR_WASM_DIR)+'/'):new URL('../web/pkg/',import.meta.url);
const {default:init,Game}=await import(new URL('solar_friends.js',pkg));
await init({module_or_path:await readFile(new URL('solar_friends_bg.wasm',pkg))});
const output='artifacts/electricity';await mkdir(output,{recursive:true});
const snap=g=>JSON.parse(g.snapshot());
const line=(s,id)=>s.village.pipes.lines.find(p=>p.id===id);
function checkpoint(g){const raw=g.snapshot(),h=new Game();assert(h.restore(raw));assert.equal(h.snapshot(),raw);h.free();assert(JSON.parse(g.simulation_report()).materials.every(m=>m.difference===0));}
function until(g,goal,label,observe=()=>{}){for(let i=0;i<8*1920;i++){const s=snap(g);observe(s);if(goal(s))return s;g.tick(.25);}throw new Error(label+': '+g.electricity_report());}
const g=new Game();startEmptySandbox(g);
for(const [kind,x,y] of [['solar_farm',5,5],['workshop',12,5],['streetlight',18,5],['home',18,12]])assert.equal(g.place(kind,x,y),'ok');
const authored=snap(g),v=authored.village;
Object.assign(v,{mode:'story',arrived:true,minutes:540,food:60,meals:12,wood:8});
v.progress.completed.fill(true);v.progress.later_completed.fill(true);v.progress.use_tools=false;
v.economy.stock.fill(0);v.economy.stock[2]=8;v.economy.money=2000000;v.economy.outside_jobs.fill(false);v.power.stored=10;
for(const r of authored.residents)Object.assign(r,{task:'idle',trip:null,help:null,remaining:0,requested:false,energy:90,hunger:0,social:90,last_meal_slot:0,x:10+(r.id-2)*1.25,y:13,target_x:10+(r.id-2)*1.25,target_y:13,activity_building:null,activity_material:null,activity_batch:null,activity_store:null});
assert(g.restore(JSON.stringify(resetMaterialLocations(authored))));
assert.equal(snap(g).village.version,31);
assert.equal(g.set_production_target(17,0),'ok');
await writeFile(`${output}/before.json`,g.snapshot());
const port=building=>snap(g).village.power.network.nodes.find(n=>n.owner.kind==='building'&&n.owner.id===building).id;
function install(building){
 const from=port(0),to=port(building),before=g.snapshot(),quote=JSON.parse(g.electrical_connection_quote(from,to));assert(quote.allowed);assert.equal(g.snapshot(),before);assert.equal(quote.parts[9],0);assert.equal(quote.parts[14],0);
 assert.equal(g.queue_electrical_connection(from,to),'ok');const id=snap(g).village.pipes.lines.at(-1).id;checkpoint(g);
 let ordered=false;for(let i=0;i<2*1920;i++){if(g.order_supplies_pickup(JSON.stringify(quote.parts),4)==='ok'){ordered=true;break;}g.tick(.25);}assert(ordered);
 let carried=false,partial=false;
 until(g,s=>line(s,id).phase==='active','Actual paid cable installation',s=>{
   if(s.village.logistics.shipments.some(h=>h.carrying&&s.village.logistics.stores.find(p=>p.id===h.to)?.owner.kind==='utility'))carried=true;
   if(line(s,id).phase==='installing'){partial=true;checkpoint(g);}
 });assert(carried&&partial);checkpoint(g);return id;
}
const cable=install(1),lamp=install(2);
let circuitReport=JSON.parse(g.electricity_report());
assert(circuitReport.circuits.some(c=>!c.private_roof&&c.nodes.includes(port(0))&&c.nodes.includes(port(1))&&c.nodes.includes(port(2))));
assert(circuitReport.circuits.some(c=>c.private_roof&&c.nodes.length===1&&c.nodes[0]===port(3)));
assert.equal(JSON.parse(g.simulation_report()).water_connections.lines.length,0);
assert.equal(JSON.parse(g.simulation_report()).electricity.connections.lines.length,2);

until(g,s=>s.village.progress.night_lights,'A real cable powers a light after dusk');assert(line(snap(g),lamp).transferred>0);
const site=snap(g).village.production.sites.find(s=>s.building===1).id;
assert.equal(g.set_workshop_powered(site,true),'ok');
assert.equal(g.set_production_target(7,2),'ok');
const first=snap(g).village.production.batches.find(b=>b.material===7&&b.finished==null).id;
let requested=false;for(let i=0;i<2*1920;i++){const reply=g.request(0,'prepare',true);if(/lend a hand|Happy|already accepted/.test(reply)){requested=true;break;}g.tick(.25);}assert(requested);
let inputsCarried=false;
until(g,s=>{const b=s.village.production.batches.find(b=>b.id===first);return b.work>0&&b.work<10;},'Resident attends a powered batch after input hauling',s=>{if(s.village.logistics.shipments.some(h=>h.carrying&&s.village.logistics.stores.find(p=>p.id===h.to)?.owner.kind==='production'))inputsCarried=true;});
assert(inputsCarried);checkpoint(g);await writeFile(`${output}/workshop-working.json`,g.snapshot());
assert.equal(g.configure_electrical_connection(cable,1,true),'ok');
const paused=snap(g),work=paused.village.production.batches.find(b=>b.id===first).work,used=paused.village.production.sites.find(s=>s.id===site).energy_used;
const copy=new Game();assert(copy.restore(g.snapshot()));
for(let i=0;i<20;i++){g.tick(.25);copy.tick(.25);assert.equal(g.snapshot(),copy.snapshot());}
copy.free();
let s=snap(g);assert.equal(s.village.production.batches.find(b=>b.id===first).work,work);assert.equal(s.village.production.sites.find(s=>s.id===site).energy_used,used);assert.equal(s.village.production.batches.find(b=>b.id===first).phase,'awaiting_power');
assert.match(s.residents.find(r=>r.id===0).help.reason,/hand tools/);checkpoint(g);await writeFile(`${output}/workshop-outage.json`,g.snapshot());
assert.equal(g.set_workshop_powered(site,false),'ok');
until(g,s=>s.village.production.batches.find(b=>b.id===first).phase==='complete','Manual fallback finishes the committed batch');
assert.equal(snap(g).village.production.accounting.outputs[7],2);assert.equal(snap(g).village.production.sites.find(s=>s.id===site).energy_used,used);checkpoint(g);await writeFile(`${output}/workshop-manual-finish.json`,g.snapshot());
assert.equal(g.configure_electrical_connection(cable,1,false),'ok');assert.equal(g.set_workshop_powered(site,true),'ok');assert.equal(g.set_production_target(7,4),'ok');
until(g,s=>s.village.production.accounting.outputs[7]===4,'A full powered batch finishes through actual work');
s=snap(g);assert(Math.abs(s.village.production.sites.find(s=>s.id===site).energy_used-used-.3)<.000001);checkpoint(g);await writeFile(`${output}/workshop-powered-finish.json`,g.snapshot());
const raw=g.snapshot();g.electricity_report();g.production_report();assert.equal(g.snapshot(),raw);
const energy=s.village.power.network.account;
assert(Math.abs(energy.opening+energy.generated-energy.consumed-energy.curtailed-(energy.discharged||0)-s.village.power.network.nodes.reduce((n,p)=>n+p.charge,0))<.0001);
console.log(JSON.stringify({version:s.village.version,cables:s.village.pipes.lines.filter(p=>p.plan.kind==='electricity').length,tiles:s.village.production.accounting.outputs[7],workshop_energy:s.village.production.sites.find(s=>s.id===site).energy_used,energy,paid_orders:s.village.economy.orders.length,checks:'paid kits, actual hauling and work, dusk light, powered inputs, outage, exact continuation, manual fallback, full powered batch, conservation'},null,2));
g.free();
