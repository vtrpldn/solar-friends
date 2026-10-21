import {startEmptySandbox} from './lib/empty-sandbox.mjs';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import init,{Game} from '../web/pkg/solar_friends.js';
import {makeScenario} from '../web/dev/scenarios.js';
import {resetMaterialLocations} from '../web/dev/material-fixture.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const output='artifacts/suppliers';await mkdir(output,{recursive:true});
const snap=g=>JSON.parse(g.snapshot()),raw=(material,n)=>JSON.stringify(Array.from({length:29},(_,i)=>i===material?n:0));
const base=new Game(),fresh=snap(base);assert.equal(fresh.village.version,38);assert(fresh.village.market.enabled&&!fresh.environment.economy.market.active);
assert(base.restore(await readFile(new URL('../web/artwork/village-preview.json',import.meta.url),'utf8')));const established=snap(base);
const g=new Game();assert(g.restore(JSON.stringify(makeScenario('suppliers',fresh,established))));
const before=g.snapshot(),e=snap(g).environment.economy,offer=e.market.current.offer,data=raw(offer.material,1);
const q=JSON.parse(g.supply_order_quote(data,false));assert(q.allowed);assert.equal(q.terms.discount.units,1);g.supplier_report();assert.equal(g.snapshot(),before);
await writeFile(output+'/before.json',before);
assert.equal(g.order_supplies_quoted(data,q.token),'ok');assert.equal(snap(g).village.economy.money,e.money-q.total);
assert.equal(snap(g).environment.economy.market.current.offer.remaining,offer.stock-1);
let saved=g.snapshot();assert(g.restore(saved));assert.equal(g.snapshot(),saved);
const paid=snap(g).village.economy.orders.at(-1).paid;assert.equal(g.cancel_order(0),'ok');assert.equal(snap(g).village.economy.money,e.money);assert.equal(snap(g).environment.economy.market.current.offer.remaining,offer.stock);
saved=g.snapshot();assert.notEqual(g.cancel_order(0),'ok');assert.equal(g.snapshot(),saved);
g.set_supplier_variation(false);saved=g.snapshot();assert.notEqual(g.order_supplies_quoted(data,q.token),'ok');assert.equal(g.snapshot(),saved);g.set_supplier_variation(true);
const pickup=JSON.parse(g.supply_order_quote(data,true));assert(pickup.allowed);assert.equal(g.order_supplies_pickup_quoted(data,1,pickup.token),'ok');
const receipt=structuredClone(snap(g).village.economy.orders.at(-1).terms),phases=new Set();let checkpoints=0;
for(let tick=0;tick<1920;tick++){
 g.tick(.25);if(tick%20)continue;const s=snap(g);phases.add(s.residents[1].trip?.phase||'home');
 saved=g.snapshot();const copy=new Game();assert(copy.restore(saved));assert.equal(copy.snapshot(),saved);for(let i=0;i<3;i++){g.tick(.25);copy.tick(.25);}assert.equal(g.snapshot(),copy.snapshot());copy.free();checkpoints++;
 assert(JSON.parse(g.simulation_report()).materials.every(m=>m.difference===0));
 if(s.village.economy.orders.at(-1).status==='delivered')break;
}
assert.equal(snap(g).village.economy.orders.at(-1).status,'delivered');assert(phases.has('leaving')&&phases.has('away'));assert.deepEqual(snap(g).village.economy.orders.at(-1).terms,receipt);
assert.equal(snap(g).village.economy.orders.at(-1).paid,pickup.total);await writeFile(output+'/pickup-after.json',g.snapshot());
// Author only the initial date from the announced calendar; the order and
// subsequent work, food, travel and delivery all use normal simulation ticks.
const freight=new Game();let delayed;
for(let start=14;start<98&&!delayed;start+=7){
 const initial=makeScenario('suppliers',fresh,established);initial.village.minutes=start*1440+540;initial.village.market.enabled=false;
 const staged=resetMaterialLocations(initial);staged.village.market.enabled=true;assert(freight.restore(JSON.stringify(staged)));
 delayed=snap(freight).environment.economy.market.calendar.find(d=>Math.floor(d.delivery/1440)-d.day>1);
}
assert(delayed,'The seeded future contains an announced freight delay');
const initial=makeScenario('suppliers',fresh,established);initial.village.minutes=delayed.day*1440+540;initial.village.market.enabled=false;
const staged=resetMaterialLocations(initial);staged.village.market.enabled=true;assert(freight.restore(JSON.stringify(staged)));
const freightQuote=JSON.parse(freight.supply_order_quote(raw(8,1),false));assert(freightQuote.allowed);
await writeFile(output+'/freight-before.json',freight.snapshot());assert.equal(freight.order_supplies_quoted(raw(8,1),freightQuote.token),'ok');const due=freightQuote.terms.arrival,money=snap(freight).village.economy.money;
freight.set_supplier_variation(false);let observedWait=false;
for(let tick=0;tick<3*1920;tick++){
 freight.tick(.25);if(tick%20)continue;const s=snap(freight),order=s.village.economy.orders.at(-1);
 assert.equal(order.arrival,due);assert.equal(order.paid,freightQuote.total);assert.equal(s.village.economy.money,money);
 if(s.village.minutes>=due-1440&&s.village.minutes<due){assert.notEqual(order.status,'delivered');observedWait=true;}
 if(tick%1920===0){const saved=freight.snapshot();assert(freight.restore(saved));assert.equal(freight.snapshot(),saved);}
 assert(JSON.parse(freight.simulation_report()).materials.every(m=>m.difference===0));
 if(order.status==='delivered')break;
}
assert(observedWait);assert.equal(snap(freight).village.economy.orders.at(-1).status,'delivered');await writeFile(output+'/freight-after.json',freight.snapshot());
const rollover=makeScenario('suppliers',fresh,established);rollover.village.minutes=27*1440+1437;rollover.village.market.enabled=false;
const rolloverFixture=resetMaterialLocations(rollover);rolloverFixture.village.market.enabled=true;
const rolloverGame=new Game();assert(rolloverGame.restore(JSON.stringify(rolloverFixture)));await writeFile(output+'/weekly-rollover.json',rolloverGame.snapshot());rolloverGame.free();
let baselineMinutes=0;
if(process.env.SOLAR_SUPPLIER_BASELINE){
 const folder=pathToFileURL(path.resolve(process.env.SOLAR_SUPPLIER_BASELINE)+'/'),{default:oldInit,Game:Old}=await import(new URL('solar_friends.js',folder));await oldInit({module_or_path:await readFile(new URL('solar_friends_bg.wasm',folder))});
 const old=new Old(),now=new Game();startEmptySandbox(old);startEmptySandbox(now);
 for(const [kind,x,y]of [['home',6,6],['solar_farm',12,6],['workshop',18,12]]){assert.equal(old.place(kind,x,y),'ok');assert.equal(now.place(kind,x,y),'ok');}
 for(let tick=0;tick<1920;tick++){old.tick(.25);now.tick(.25);}
 const a=JSON.parse(old.snapshot()),b=snap(now);delete b.village.market;delete b.environment.economy.market;for(const m of b.environment.economy.materials)delete m.sell_price;for(const o of b.village.economy.orders)delete o.terms;b.village.version=a.village.version;
 assert.deepEqual(b,a,'Steady Sandbox preserves one day of the learning release apart from additive supplier metadata');baselineMinutes=1440;old.free();now.free();
}
await writeFile(output+'/report.json',JSON.stringify({paidDelivery:paid,paidPickup:pickup.total,offerMaterial:offer.material,pickupPhases:[...phases],exactPickupCheckpoints:checkpoints,freightDue:due,freightPaid:freightQuote.total,delayedCalendarDay:delayed.day,baselineMinutes},null,2));
base.free();g.free();freight.free();console.log('PASS: bounded supplier offers, firm native quotes and receipts, stale-confirmation rejection, once-only refund and restock, actual resident pickup, fixed delayed delivery through option changes, exact continuations and material accounts'+(baselineMinutes?'; one day of steady Sandbox parity.':'.'));
