import {foodChange as changeMaterial} from '../web/v02/weekend/food-storage.js';
import assert from 'node:assert/strict';
import {createWeekend,MATERIALS,materialCount,save,restore} from '../web/v02/weekend/simulation.js';
import {tradeQuote,reserveExport,cancelExport} from '../web/v02/weekend/physical-trade.js';
import {buyerQuote,buyerFor} from '../web/v02/weekend/local-market.js';
const s=createWeekend(42);s.wood=200;
const first=tradeQuote(s,'wood',MATERIALS,materialCount);assert.equal(first.buyer,'materials');
for(let i=0;i<4;i++)assert(reserveExport(s,'wood',MATERIALS,materialCount,changeMaterial));
const bulk=tradeQuote(s,'wood',MATERIALS,materialCount);assert(bulk.cents<first.cents);
for(let i=0;i<4;i++)assert(reserveExport(s,'wood',MATERIALS,materialCount,changeMaterial));
assert.match(tradeQuote(s,'wood',MATERIALS,materialCount).error,/enough/);
const loaded=restore(save(s));assert(loaded);assert.equal(loaded.trade.orders[0].cents,first.cents);
assert(cancelExport(s,s.trade.orders.at(-1).id,changeMaterial));assert.equal(tradeQuote(s,'wood',MATERIALS,materialCount).error,'');
s.time+=3200;assert.equal(tradeQuote(s,'wood',MATERIALS,materialCount).cents,first.cents);
for(const [id,item]of Object.entries(MATERIALS))if(item.quantity&&item.price){assert(buyerFor(id));assert(buyerQuote(id,item).cents<item.price*100,'no buy/sell arbitrage');}
console.log('PASS named buyers, disclosed price bands, finite daily demand, cancellation, locked quotes, reload and no arbitrage');
