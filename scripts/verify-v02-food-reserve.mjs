import assert from 'node:assert/strict';
import {createWeekend,chooseCamp,tick,enableFastNavigation,save,restore} from '../web/v02/weekend/simulation.js';
const fresh=()=>{const s=createWeekend(42);chooseCamp(s,'entrance');enableFastNavigation(s);s.materials.food=10;s.materials.meals=0;return s;};
const s=fresh();tick(s,.1);assert(s.trip,'replenish before anyone is starving');assert(s.people.every(r=>r.needs.hunger>25));assert(s.money<2000);assert(restore(save(s)));
const capped=fresh();capped.foodPurchaseBudget=10;tick(capped,.1);assert.equal(capped.trip,null);assert.equal(capped.money,2000);
const off=fresh();off.foodReserveDays=0;tick(off,.1);assert.equal(off.trip,null);
const invalid=JSON.parse(save(s));invalid.foodReserveDays=Infinity;assert.equal(restore(JSON.stringify(invalid)),null);
console.log('PASS preventive food reserve, daily purchase cap, zero target and save validation');
