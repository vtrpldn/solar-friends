import assert from 'node:assert/strict';
import {tick,save,restore,PROJECTS} from '../web/v02/weekend/simulation.js';
import {village} from './fixtures.mjs';
import {simulationFrame} from '../web/v02/weekend/session-ui.js';
import {weatherAt} from '../web/v02/weekend/weather.js';
let reference;
for(const speed of [1,4,8,16]){
 const {s}=village();let accumulator=0;
 for(let i=0;i<1000;i++)accumulator=simulationFrame(accumulator,.1/speed,speed,dt=>tick(s,dt),()=>0);
 const snapshot=save(s);if(reference)assert.equal(snapshot,reference,`same ticks at ${speed}x`);else reference=snapshot;
}
const s=JSON.parse(reference),copy=restore(reference);assert(copy);assert.deepEqual(copy.weather,s.weather);assert.deepEqual(copy.hydrology,s.hydrology);assert.deepEqual(weatherAt(copy,999999),weatherAt(s,999999));
for(const mutate of [x=>x.weather.cloudCover=NaN,x=>x.hydrology.groundwater=-1,x=>x.people[0].needs.hydration=-1,x=>x.people[0].drinkingWater=-1]){const bad=JSON.parse(reference);mutate(bad);assert.equal(restore(JSON.stringify(bad)),null);}
const legacy=JSON.parse(reference);delete legacy.weather;delete legacy.hydrology;for(const r of legacy.people)delete r.needs.hydration;const loaded=restore(JSON.stringify(legacy));assert(loaded);assert(loaded.people.every(r=>r.needs.hydration===100));assert.deepEqual(loaded.materials,legacy.materials);
console.log('PASS supported-speed determinism, durable environment, legacy initialization and malformed-state rejection');
