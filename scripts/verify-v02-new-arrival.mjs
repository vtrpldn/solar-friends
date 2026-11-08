import assert from 'node:assert/strict';
import {beginArrival,createWeekend,createSandbox,tick,save,restore} from '../web/v02/weekend/simulation.js';
import {ARRIVAL_DURATION,vehiclePose,arrivalPose} from '../web/v02/weekend/arrival.js';
for(const create of [createWeekend,createSandbox]){
 const s=beginArrival(create(123));assert.equal(s.arrivalElapsed,0);
 tick(s,1);assert.equal(s.time,0);assert.equal(s.arrivalElapsed,1);
 const loaded=restore(save(s));assert(loaded);assert.equal(loaded.arrivalElapsed,1);assert(loaded.arrivalAnimating);
 for(let i=0;i<ARRIVAL_DURATION*10;i++)tick(loaded,.1);
 assert.equal(loaded.arrivalAnimating,false);assert.equal(loaded.arrivalElapsed,ARRIVAL_DURATION);
 const resumed=restore(save(loaded));assert(resumed);assert.equal(resumed.arrivalAnimating,false);
}
for(let i=0;i<2;i++)assert(vehiclePose(0,i).z<vehiclePose(8,i).z);
for(let i=0;i<5;i++){assert.equal(arrivalPose(0,i).visible,false);assert.equal(arrivalPose(17,i).visible,true);assert.equal(arrivalPose(17,i).walking,false);}
console.log('PASS: new story/sandbox arrival, frozen simulation, in-progress save resume, completed saves do not replay, both cars and five exits');
