import assert from 'node:assert/strict';
import {createWeekend,chooseCamp,tick,save,restore,enableFastNavigation,requiredLoads} from '../web/v02/weekend/simulation.js';
import {village,advance} from './fixtures.mjs';
import {setOutsideWork,requestDayShift,cancelDayShift,dayShiftOffer,OUTSIDE_JOBS,COMMUTE_FARE} from '../web/v02/weekend/outside-work.js';
import {applySettings,DEFAULT_SETTINGS} from '../web/v02/weekend/world-settings.js';
import {tripEstimate} from '../web/v02/weekend/economy-reference.js';
const {s}=village();
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
advance(loaded,{seconds:1500,until:()=>!loaded.people[0].outsideWork});
assert.equal(loaded.finances.categories.outsideWork,80,'mid-shift reload settles once');
advance(loaded,{seconds:10});assert.equal(loaded.finances.categories.outsideWork,80);
const malformed=JSON.parse(savedAway);malformed.people[0].outsideWork.until=Infinity;assert.equal(restore(JSON.stringify(malformed)),null);
console.log('PASS optional contract, walking commute, offsite work, deferred pay, energy, disable-after-shift and save settlement');
const {s:broke}=village({money:0});setOutsideWork(broke,broke.people[0],true);
advance(broke,{seconds:1500,until:()=>broke.finances?.categories.outsideWork});
assert.equal(broke.finances.categories.outsideWork,72,'zero cash can recover through work with employer-deducted fare');
console.log('PASS outside work recovers from zero savings without free money or an upfront fare deadlock');

function advanceUntil(village, condition, limit, message) {
  for (let elapsed = 0; elapsed < limit && !condition(); elapsed++) tick(village, 1);
  assert(condition(), message);
}

function reload(village) {
  const resumed = restore(save(village));
  assert(resumed, 'outside shift state survives save and restore');
  enableFastNavigation(resumed);
  return resumed;
}

// A worker may book a single full day even when household cash cannot cover the bus.
// An open, fully supplied project gives everyone in camp actual work to choose.
const remote = createWeekend(42);
applySettings(remote, {...DEFAULT_SETTINGS, town: 'remote'});
assert.equal(requestDayShift(remote, remote.people[0]), false, 'choose a campsite before booking work');
chooseCamp(remote, 'entrance');
enableFastNavigation(remote);
remote.money = 0;
remote.projects.push({
  id: remote.nextId++, key: 'home-cottage', x: 50, z: 50,
  work: 0, delivered: requiredLoads('home-cottage'),
});
const worker = remote.people[0];
const offer = dayShiftOffer(remote, worker);
assert.equal(offer.hours, 8);
for (const resident of remote.people) {
  const contract = OUTSIDE_JOBS[resident.id];
  assert.equal(dayShiftOffer(remote, resident).pay, 8 * contract.pay / contract.hours);
}
assert.equal(offer.fare, COMMUTE_FARE);
assert.equal(offer.available, true);
assert(requestDayShift(remote, worker));
assert.equal(requestDayShift(remote, worker), false, 'repeat clicks only book one shift');
assert.equal(dayShiftOffer(remote, worker).status, 'queued');
assert(cancelDayShift(remote, worker));
assert.equal(dayShiftOffer(remote, worker).status, 'available');
assert(requestDayShift(remote, worker));
setOutsideWork(remote, worker, true);
advanceUntil(remote, () => worker.outsideWork?.phase === 'away', 250, 'full-day booking takes precedence over the recurring shift');
assert.equal(worker.outsideWork.fullDay, true);
assert.equal(cancelDayShift(remote, worker), false, 'an in-progress shift finishes normally');
assert.equal(requestDayShift(remote, worker), false);
assert(Math.abs((worker.outsideWork.until - remote.time) * .45 - (offer.hours * 60 + tripEstimate('remote').minutes)) < .001, 'worker spends the advertised full day and commute off-site');
assert.equal(remote.finances.categories.outsideWork, undefined);
assert.equal(remote.finances.categories.commuting, undefined, 'fare waits for payday when broke');
const returned = reload(remote);
const earner = returned.people[0];
const workBefore = earner.work;
advanceUntil(returned, () => {
  assert.equal(earner.work, workBefore, 'off-site worker cannot progress village work');
  assert.equal(earner.job, null);
  assert.equal(earner.operation, null);
  return !earner.outsideWork;
}, 1650, 'restored remote shift pays on return to camp');
assert.equal(earner.outsideJobEnabled, true, 'finishing a day shift preserves the recurring contract');
const netPay = offer.pay - offer.fare;
assert(returned.projects[0].work > 0, 'residents who stay in camp can keep working on the house');
assert.equal(returned.finances.categories.outsideWork, netPay);
assert.equal(returned.finances.entries.filter(e => e.category === 'outsideWork').length, 1);
const paid = reload(returned);
advance(paid, {seconds: 30, dt: 1});
assert.equal(paid.finances.categories.outsideWork, netPay, 'reloading after payday cannot earn the shift twice');
assert(!paid.people[0].outsideWork, 'recurring contract cannot dispatch a second time that day');
console.log('PASS one-off full day, cancellation before departure, recurring contract coexistence, village work exclusion and remote zero-cash settlement');

// Book after Friday's departure window, then check Saturday's window in isolation.
const {s: friday} = village();
const at = (day, hour) => (day * 1440 + (hour - 9) * 60) / .45;
friday.time = at(4, 11);
const fridayWorker = friday.people[1];
const weekendPay = dayShiftOffer(friday, fridayWorker).pay;
assert(requestDayShift(friday, fridayWorker));
tick(friday, 1);
assert(!fridayWorker.outsideWork, 'no departure at or after 11:00');
assert.equal(dayShiftOffer(friday, fridayWorker).day, 5, 'late bookings show the next morning');
const saturday = reload(friday);
assert.equal(dayShiftOffer(saturday, saturday.people[1]).status, 'queued');
saturday.time = at(5, 9);
advanceUntil(saturday, () => !!saturday.people[1].outsideWork, 30, 'one-off shifts can depart on a weekend');
assert.equal(saturday.people[1].outsideWork.day, 5);
advanceUntil(saturday, () => !saturday.people[1].outsideWork, 1700, 'weekend shift completes');
const weekendIncome = saturday.finances.categories.outsideWork;
assert.equal(weekendIncome, weekendPay, 'prepaid commute deposits the advertised gross wage');
assert.equal(saturday.finances.categories.commuting, -COMMUTE_FARE);
saturday.time = at(6, 9);
advance(saturday, {seconds: 30, dt: 1});
assert(!saturday.people[1].outsideWork, 'one-off booking does not repeat the following morning');
assert.equal(saturday.finances.categories.outsideWork, weekendIncome);
console.log('PASS late booking, saved queue, weekend work, prepaid fare and no repeat on the following day');
