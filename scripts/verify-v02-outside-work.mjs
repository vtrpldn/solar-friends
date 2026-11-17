import assert from 'node:assert/strict';
import {createWeekend,chooseCamp,tick,save,restore,enableFastNavigation} from '../web/v02/weekend/simulation.js';
import {setOutsideWork,OUTSIDE_JOBS,COMMUTE_FARE} from '../web/v02/weekend/outside-work.js';
const s=createWeekend(42);chooseCamp(s,'entrance');enableFastNavigation(s);
const r=s.people[0];setOutsideWork(s,r,true);
const seen=new Set();let savedAway;
for(let i=0;i<15000&&!(s.finances?.categories.outsideWork);i++){
 tick(s,.1);if(r.outsideWork){seen.add(r.outsideWork.phase);assert(!r.job,'outside worker does not construct');}
 if(r.outsideWork?.phase==='away'&&!savedAway){savedAway=save(s);assert.equal(s.finances.categories.outsideWork,undefined,'no pay before return');setOutsideWork(s,r,false);}
}
assert.deepEqual([...seen].sort(),['away','inbound','outbound']);
assert.equal(s.finances.categories.outsideWork,OUTSIDE_JOBS.iara.pay);assert.equal(s.finances.categories.commuting,-COMMUTE_FARE);
assert.equal(r.outsideWork,null);assert(r.energy<85,'work consumes energy');
const loaded=restore(savedAway);assert(loaded,'offsite save loads');enableFastNavigation(loaded);setOutsideWork(loaded,loaded.people[0],false);
for(let i=0;i<15000&&loaded.people[0].outsideWork;i++)tick(loaded,.1);
assert.equal(loaded.finances.categories.outsideWork,80,'mid-shift reload settles once');
for(let i=0;i<100;i++)tick(loaded,.1);assert.equal(loaded.finances.categories.outsideWork,80);
const malformed=JSON.parse(savedAway);malformed.people[0].outsideWork.until=Infinity;assert.equal(restore(JSON.stringify(malformed)),null);
console.log('PASS optional contract, walking commute, offsite work, deferred pay, energy, disable-after-shift and save settlement');
const broke=createWeekend(42);chooseCamp(broke,'entrance');enableFastNavigation(broke);broke.money=0;setOutsideWork(broke,broke.people[0],true);
for(let i=0;i<15000&&!broke.finances?.categories.outsideWork;i++)tick(broke,.1);
assert.equal(broke.finances.categories.outsideWork,72,'zero cash can recover through work with employer-deducted fare');
console.log('PASS outside work recovers from zero savings without free money or an upfront fare deadlock');
