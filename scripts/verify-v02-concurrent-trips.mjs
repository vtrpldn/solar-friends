import assert from 'node:assert/strict';
import {createWeekend,chooseCamp,supplyRun,tick,save,restore,enableFastNavigation} from '../web/v02/weekend/simulation.js';
import {activeTrips} from '../web/v02/weekend/trip-state.js';
import {transportCost} from '../web/v02/weekend/physical-trade.js';
const s=createWeekend(42);chooseCamp(s,'entrance');enableFastNavigation(s);s.emergencyFood=false;
const initial=s.wood,opening=s.money;
assert(supplyRun(s,'wood'));assert(supplyRun(s,'wood'));
assert.equal(activeTrips(s).length,2);assert.notEqual(s.trip.person,s.secondTrip.person);assert.notEqual(s.trip.vehicle,s.secondTrip.vehicle);
assert(!supplyRun(s,'wood'),'third trip cannot overbook cars');
const snapshot=save(s),loaded=restore(snapshot);assert(loaded,'two boarding trips restore');enableFastNavigation(loaded);
for(const state of [s,loaded]){
 for(let i=0;i<10000&&activeTrips(state).length;i++)tick(state,.1);
 assert.equal(activeTrips(state).length,0);assert.equal(state.wood,initial+24,'both cargos delivered once');
 assert.equal(state.finances.categories.purchases,-90);assert.equal(state.finances.categories.transport,-2*transportCost(state));
}
const bad=JSON.parse(snapshot);bad.secondTrip.vehicle=bad.trip.vehicle;assert.equal(restore(JSON.stringify(bad)),null);
const sameDriver=JSON.parse(snapshot);sameDriver.secondTrip.person=sameDriver.trip.person;assert.equal(restore(JSON.stringify(sameDriver)),null);
console.log('PASS concurrent cars, distinct drivers, capacity limit, dual save/load and exactly-once delivery');
