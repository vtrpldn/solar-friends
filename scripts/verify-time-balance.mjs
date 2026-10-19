// Compare the actual browser scheduler with small native steps on one earned world.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {advanceSimulation} from '../web/simulation-speed.js';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const pkg=process.env.SOLAR_WASM_DIR?pathToFileURL(path.resolve(process.env.SOLAR_WASM_DIR)+'/'):new URL('../web/pkg/',import.meta.url);
const {default:init,Game}=await import(new URL('solar_friends.js',pkg));
await init({module_or_path:await readFile(new URL('solar_friends_bg.wasm',pkg))});
const snap=g=>JSON.parse(g.snapshot()),g=new Game();
assert(g.restore(await readFile('artifacts/housing-balance/common.json','utf8')));
assert(g.set_resident_job(4,true));assert.equal(g.place('garden',5,5),'ok');
const id=snap(g).village.buildings.at(-1).id;
assert.equal(g.configure_project(id,3,false,'standard'),'ok');
const basket=snap(g).environment.economy.shortage;
assert.equal(g.order_supplies_pickup(JSON.stringify(basket),3),'ok');
const initial=g.snapshot(),before=snap(g),fast=new Game();assert(fast.restore(initial));
assert.equal(fast.snapshot(),initial);
// Follow actual delivery, construction and paid return, including meals and
// overnight routines if the delivery misses a community work window.
let frames=0,paidDays=0,lastPaid=before.village.economy.work_day[4],checks=0;
for(;frames<1500;frames++){
 for(let step=0;step<16;step++)g.tick(.1);
 assert(Math.abs(advanceSimulation(fast,.1,16)-1.6)<1e-9);
 const s=snap(g);if(s.village.economy.work_day[4]!==lastPaid){lastPaid=s.village.economy.work_day[4];paidDays++;}
 if(frames%25===24){
  assert.equal(fast.snapshot(),g.snapshot(),'Speed changes wall time, never simulated transactions or work');
  const raw=g.snapshot(),copy=new Game();assert(copy.restore(raw));assert.equal(copy.snapshot(),raw);copy.free();
  checks++;
 }
 if(paidDays>0&&s.village.buildings.find(b=>b.id===id).progress>=100)break;
}
assert(frames<1500,'Both speed paths must actually finish the supplied garden within five game days');
assert.equal(fast.snapshot(),g.snapshot());
const after=snap(g),order=after.village.economy.orders.at(-1);
assert.equal(order.status,'delivered');assert(after.village.economy.work_day[4]>before.village.economy.work_day[4]);
assert.equal(after.village.economy.money-before.village.economy.money,paidDays*22000,'Each shift pays exactly once after real return');
assert(after.village.buildings.find(b=>b.id===id).progress>0,'Delivered supplies advance the actual garden');
assert(after.village.simulation.materials.spent.some((n,i)=>n>before.village.simulation.materials.spent[i]));
for(const game of [g,fast]){
 const r=JSON.parse(game.simulation_report());assert(r.materials.every(m=>m.difference===0));
 for(let i=0;i<4;i++)assert(Math.abs(r.water.opening[i]+r.water.received[i]-r.water.consumed[i]-r.water.present[i])<.001);
 const n=snap(game).village.power.network,a=n.account;assert(Math.abs(a.opening+a.generated-a.consumed-a.curtailed-a.discharged-n.nodes.reduce((sum,p)=>sum+p.charge,0))<.001);
}
await mkdir('artifacts/clock-balance',{recursive:true});await writeFile('artifacts/clock-balance/before.json',initial);await writeFile('artifacts/clock-balance/after.json',g.snapshot());
await writeFile('artifacts/clock-balance/report.json',JSON.stringify({passed:true,source:'Identical copies of the earned one-home Story comparison; only player commands',simulatedSeconds:(frames+1)*1.6,smallNativeSteps:(frames+1)*16,fastBrowserFrames:frames+1,checkpoints:checks,comparison:'Exact complete snapshots; no numeric tolerance for speed equivalence',moneyPaid:paidDays*22000,gardenProgress:after.village.buildings.find(b=>b.id===id).progress},null,2));
g.free();fast.free();console.log('PASS: small native steps and selected 16x browser frames produce exact deliveries, wages, completed construction, consumption, physical accounts and saved state.');
