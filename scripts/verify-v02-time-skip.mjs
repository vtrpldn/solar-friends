import assert from 'node:assert/strict';
import {createWeekend,chooseCamp,tick,save,restore,plan,placementError,finished,enableFastNavigation} from '../web/v02/weekend/simulation.js';
import {DAY} from '../web/v02/weekend/weather.js';
import {skipDays} from '../web/v02/weekend/time-skip.js';
const fresh=()=>{const s=createWeekend(42);chooseCamp(s,'entrance');enableFastNavigation(s);return s;};
for (const days of [1,2]) {
  const natural=fresh(), skipped=fresh(), start=skipped.time;
  if (days === 1) {
    for (const state of [natural, skipped]) {
      let placed = false;
      for (let z = state.stock.z - 8; !placed && z <= state.stock.z + 8; z++) {
        for (let x = state.stock.x - 8; x <= state.stock.x + 8; x++) {
          if (placementError(state, 'gathering', x, z)) continue;
          assert.equal(plan(state, 'gathering', x, z), '');
          placed = true;
          break;
        }
      }
      assert(placed);
    }
  }
  for(let i=0;i<days*DAY/.1;i++)tick(natural,.1);
  let yields=0;
  await skipDays(skipped,days,{yieldControl:async()=>{yields++;}});
  if (days === 1) {
    assert(finished(skipped, 'gathering'), 'residents finish the queued gathering site during the skip');
    assert(skipped.people.some(r => r.work > 0));
  }
  assert.deepEqual(save(skipped),save(natural),'all persisted consequences match natural fixed-step play');
  assert(Math.abs(skipped.time-start-days*DAY)<1e-6);
  assert(yields>1,'long skips yield for UI updates');
  assert(restore(save(skipped)),'advanced village can be loaded');
}
const fastVillage = fresh();
assert.equal(plan(fastVillage, 'gathering', 29, 35), '');
const fastStart = fastVillage.time;
const fastResult = await skipDays(fastVillage, 2, {fast:true, yieldControl:async()=>{}});
assert.deepEqual(fastResult, {steps:2*DAY, completed:true});
assert.equal(fastVillage.time, fastStart + 2*DAY);
assert(finished(fastVillage, 'gathering'));
assert(restore(save(fastVillage)), 'fast simulation produces a loadable save');

const s=fresh();let stop=false;
const result=await skipDays(s,1,{now:(()=>{let n=0;return()=>n+=13;})(),progress:f=>{if(f>0)stop=true;},cancelled:()=>stop,yieldControl:async()=>{}});
assert.equal(result.steps,1);assert.equal(result.completed,false);
for(const days of [0,-1,1.5,366,NaN,Infinity])await assert.rejects(skipDays(s,days),RangeError);
await assert.rejects(skipDays(createWeekend(42),1),/arriving/);
console.log('PASS: one- and two-day full-state parity, save reload, yielding, cancellation, and input/arrival guards.');

const {catchUpFrame,simulationFrame}=await import('../web/v02/weekend/session-ui.js');
// Start mid-step and switch speeds while processing the absence.
let visibleSteps=0, visibleAccumulator=.04;
for(let frame=0;frame<400;frame++){
  visibleAccumulator=simulationFrame(visibleAccumulator,.016,()=>visibleSteps<200?64:4,()=>visibleSteps++,()=>0);
}
let backgroundSteps=0, clock=0, background={seconds:400*.016,accumulator:.04};
while(background.seconds>0)background=catchUpFrame(background.seconds,background.accumulator,()=>backgroundSteps<200?64:4,()=>backgroundSteps++,()=>clock++);
assert.equal(backgroundSteps,visibleSteps);
assert(Math.abs(background.accumulator-visibleAccumulator)<1e-9);
