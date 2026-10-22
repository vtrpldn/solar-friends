import {MATERIAL_KEYS} from '../web/materials.js';
import {startEmptySandbox} from './lib/empty-sandbox.mjs';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import init,{Game} from '../web/pkg/solar_friends.js';
import {sandboxPlanningScene} from '../web/dev/sandbox-fixture.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const output='artifacts/sandbox-rules';await mkdir(output,{recursive:true});
const snap=g=>JSON.parse(g.snapshot()),checks=[];
function checkpoint(g){const raw=g.snapshot(),copy=new Game();assert(copy.restore(raw));assert.equal(copy.snapshot(),raw);for(let i=0;i<4;i++){g.tick(.25);copy.tick(.25);}assert.equal(copy.snapshot(),g.snapshot());copy.free();assert(JSON.parse(g.simulation_report()).materials.every(m=>m.difference===0));const w=JSON.parse(g.water_report());for(let i=0;i<4;i++)assert(Math.abs(w.opening[i]+w.received[i]-w.consumed[i]-w.present[i])<.001);const n=snap(g).village.power.network,a=n.account;assert(Math.abs(a.opening+a.generated-a.consumed-a.curtailed-a.discharged-n.nodes.reduce((sum,p)=>sum+p.charge,0))<.001);}
function until(g,test,label,limit=3*1920){for(let i=0;i<limit;i++){g.tick(.25);if(i%4===3&&test(snap(g)))return;}throw Error(label+' did not complete');}
const fresh=new Game();assert.equal(snap(fresh).village.version,45);const story=fresh.snapshot();assert.equal(fresh.configure_sandbox_rules(false,false,false),false);assert.equal(fresh.snapshot(),story);assert.deepEqual(JSON.parse(fresh.sandbox_rules_report()),{editable:false,logistics:true,land:true,utilities:true,supplied_energy:0});fresh.free();
const g=new Game();assert(startEmptySandbox(g));const initial=snap(g);assert.deepEqual(initial.village.sandbox_rules,{logistics:false,land:false,utilities:false,supplied_energy:0});
assert.equal(g.place('home',5,5),'ok');assert.equal(snap(g).village.buildings[0].progress,100);
assert(g.configure_sandbox_rules(true,false,false));assert.equal(g.place('garden',13,10),'ok');assert.equal(snap(g).village.buildings[1].progress,0);const fund=snap(g).village.economy.money;let hauling=false;
until(g,s=>{hauling||=s.residents.some(r=>r.task==='haul');return s.village.buildings[1].progress===100;},'Resident-built constrained garden');assert(hauling);assert.equal(snap(g).village.economy.money,fund);checkpoint(g);await writeFile(output+'/construction.json',g.snapshot());checks.push('New projects require actual resident material trips and work, with conserved supplies');
const basket=Array(MATERIAL_KEYS.length).fill(0);basket[0]=1;assert.equal(g.order_supplies(JSON.stringify(basket)),'ok');const order=structuredClone(snap(g).village.economy.orders.at(-1));
assert.equal(g.place('workshop',18,16),'ok');const project=snap(g).village.economy.projects.at(-1);assert.equal(g.configure_project(project.building,3,true,'standard'),'ok');const pending=structuredClone(snap(g).village.economy.projects.at(-1));
assert(g.configure_sandbox_rules(false,false,false));assert.deepEqual(snap(g).village.economy.orders.at(-1),order);assert.deepEqual(snap(g).village.economy.projects.at(-1),pending);assert.equal(snap(g).village.buildings.at(-1).progress,0);checkpoint(g);checks.push('Switching rules preserves confirmed receipts and paused construction');
for(let mask=0;mask<8;mask++){
  assert(g.configure_sandbox_rules(!!(mask&1),!!(mask&2),!!(mask&4)));const r=JSON.parse(g.sandbox_rules_report());assert.equal(r.logistics,!!(mask&1));assert.equal(r.land,!!(mask&2));assert.equal(r.utilities,!!(mask&4));const before=g.snapshot();assert.deepEqual(JSON.parse(g.sandbox_rules_report()),r);assert.equal(g.snapshot(),before);checkpoint(g);
}
checks.push('All eight independent saved rule combinations continue exactly');g.free();
const source=new Game();startEmptySandbox(source);assert.equal(source.place_source(2,4,4),'ok');assert.equal(source.configure_source(0,false,false),'ok');const reserve=snap(source).village.economy.sources[0].remaining;
assert.equal(source.harvest_source(0),'ok');until(source,s=>s.village.economy.sources[0].harvests===1,'Non-depleting extraction');assert.equal(snap(source).village.economy.sources[0].remaining,reserve);checkpoint(source);
assert(source.configure_sandbox_rules(false,true,false));assert.equal(source.harvest_source(0),'ok');until(source,s=>s.village.economy.sources[0].harvests===2,'Finite extraction after enabling living land');assert.equal(snap(source).village.economy.sources[0].remaining,reserve-4);checkpoint(source);await writeFile(output+'/extraction.json',source.snapshot());source.free();checks.push('Actual extraction yields materials without depleting preserved reserves until living land is enabled');
const power=new Game();startEmptySandbox(power);assert.equal(power.place('streetlight',5,5),'ok');until(power,s=>s.village.minutes%1440>=1260,'Nightfall');let p=snap(power);assert.equal(p.environment.power.connections[0].light_level,1);assert(p.village.sandbox_rules.supplied_energy>0);assert.equal(p.village.power.stored,0);assert.equal(p.village.power.network.account.consumed,0);const supplied=p.village.sandbox_rules.supplied_energy;
assert(power.configure_sandbox_rules(false,false,true));p=snap(power);assert.equal(p.environment.power.connections[0].light_level,0);assert.equal(p.village.sandbox_rules.supplied_energy,supplied);checkpoint(power);await writeFile(output+'/local-power.json',power.snapshot());power.free();checks.push('Free operating power lights a disconnected path, and local utilities restores the real outage without invented charge');
const planned=sandboxPlanningScene();assert.equal(planned.village.mode,'sandbox');assert(planned.village.sandbox_rules.logistics&&planned.village.sandbox_rules.land&&planned.village.sandbox_rules.utilities);assert(planned.village.buildings.some(b=>b.kind==='workshop'&&b.progress===0));const preview=new Game();assert(preview.restore(JSON.stringify(planned)));checkpoint(preview);await writeFile(output+'/planning.json',preview.snapshot());preview.free();checks.push('Protected Sandbox planning scene uses the actual free-build and constrained-project commands');
let baselineMinutes=0;
if(process.env.SOLAR_SANDBOX_BASELINE){
 const pkg=pathToFileURL(path.resolve(process.env.SOLAR_SANDBOX_BASELINE)+'/'),{default:oldInit,Game:Old}=await import(new URL('solar_friends.js',pkg));await oldInit({module_or_path:await readFile(new URL('solar_friends_bg.wasm',pkg))});const old=new Old(),current=new Game();
 for(let i=0;i<1920;i++){old.tick(.25);current.tick(.25);}const a=JSON.parse(old.snapshot()),b=snap(current);delete b.village.sandbox_rules;b.village.version=a.village.version;assert.deepEqual(b.village,a.village,'Story state remains identical for a day with its fixed constraints');assert.deepEqual(b.residents,a.residents);baselineMinutes=1440;old.free();current.free();checks.push('One full Story day matches the supplier release apart from additive schema metadata');
}
await writeFile(output+'/report.json',JSON.stringify({passed:true,checks,baselineMinutes},null,2));
console.log('PASS: '+checks.join('; ')+'.');
