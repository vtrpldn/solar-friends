import {STARTING_CAPITAL} from '../web/v02/weekend/economy-reference.js';
import assert from 'node:assert/strict';
import {tick,save,restore} from '../web/v02/weekend/simulation.js';
import {village,advance} from './fixtures.mjs';
const fresh=()=>village({materials:{food:10,meals:0}}).s;
const s=fresh();tick(s,.1);assert(s.trip,'replenish before anyone is starving');assert(s.people.every(r=>r.needs.hunger>25));assert(s.money<STARTING_CAPITAL.modest);assert(restore(save(s)));
const capped=fresh();capped.foodPurchaseBudget=10;tick(capped,.1);assert.equal(capped.trip,null);assert.equal(capped.money,STARTING_CAPITAL.modest);
const off=fresh();off.foodReserveDays=0;tick(off,.1);assert.equal(off.trip,null);
const invalid=JSON.parse(save(s));invalid.foodReserveDays=Infinity;assert.equal(restore(JSON.stringify(invalid)),null);
console.log('PASS preventive food reserve, daily purchase cap, zero target and save validation');

const stocked=fresh();stocked.deliveryOnly=true;stocked.foodReserveDays=7;
stocked.foodPurchaseBudget=200;
advance(stocked,{seconds:1800});
assert(stocked.suppliers.food.units>=24,'high demand permits a second delivery within the configured daily budget');
assert(stocked.foodPurchases.spent<=200,'deliveries include freight in the daily cap');
assert.deepEqual(restore(save(stocked)).foodPurchases,stocked.foodPurchases);
