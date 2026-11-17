import assert from 'node:assert/strict';
import {createWeekend,chooseCamp,tick,save,restore,enableFastNavigation} from '../web/v02/weekend/simulation.js';
import {DAY} from '../web/v02/weekend/weather.js';
import {skipDays} from '../web/v02/weekend/time-skip.js';
const fresh=()=>{const s=createWeekend(42);chooseCamp(s,'entrance');enableFastNavigation(s);return s;};
for (const days of [1,2]) {
  const natural=fresh(), skipped=fresh(), start=skipped.time;
  for(let i=0;i<days*DAY/.1;i++)tick(natural,.1);
  let yields=0;
  await skipDays(skipped,days,{yieldControl:async()=>{yields++;}});
  assert.deepEqual(save(skipped),save(natural),'all persisted consequences match natural fixed-step play');
  assert(Math.abs(skipped.time-start-days*DAY)<1e-6);
  assert(yields>1,'long skips yield for UI updates');
  assert(restore(save(skipped)),'advanced village can be loaded');
}
const s=fresh();let stop=false;
const result=await skipDays(s,1,{now:(()=>{let n=0;return()=>n+=13;})(),progress:f=>{if(f>0)stop=true;},cancelled:()=>stop,yieldControl:async()=>{}});
assert.equal(result.steps,1);assert.equal(result.completed,false);
for(const days of [0,-1,1.5,366,NaN,Infinity])await assert.rejects(skipDays(s,days),RangeError);
await assert.rejects(skipDays(createWeekend(42),1),/arriving/);
console.log('PASS: one- and two-day full-state parity, save reload, yielding, cancellation, and input/arrival guards.');
