import assert from 'node:assert/strict';
import {createWeekend,chooseCamp,supplyRun,tick,save,restore,enableFastNavigation,PROJECTS,route} from '../web/v02/weekend/simulation.js';
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

const obstructed=createWeekend(42);chooseCamp(obstructed,'entrance');enableFastNavigation(obstructed);
const {carDoor}=await import('../web/v02/weekend/town-trip.js');const door=carDoor(0);
obstructed.projects.push({id:obstructed.nextId++,key:'warehouse',x:door.x-1,z:door.z-1,work:PROJECTS.warehouse.work,delivered:0});
assert(!route(obstructed,obstructed.people[0],carDoor(0)));assert(route(obstructed,obstructed.people[0],carDoor(1)));
assert(supplyRun(obstructed,'food'),'food shopping tries the other car when the preferred door is blocked');assert.equal(obstructed.trip.vehicle,1);
console.log('PASS food shopping falls back to a reachable car');
