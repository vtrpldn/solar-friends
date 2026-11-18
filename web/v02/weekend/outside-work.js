import {activeTrips} from './trip-state.js';
import {transact} from './finances.js';
import {spendableMoney} from './procurement-budget.js';
import {tripEstimate} from './economy-reference.js';
import {clearDowntime} from './resident-downtime.js';
import {calendar, HOUR} from './weather.js';
import {CELL_MIN} from './map-size.js';

// Scenario contracts for the residents' trades. Day shifts use the same hourly rates.
export const OUTSIDE_JOBS = {
  iara: {name: 'Plant nursery assistant', hours: 4, pay: 80},
  bento: {name: 'Carpentry repairs', hours: 4, pay: 100},
  luz: {name: 'Community café cook', hours: 4, pay: 80},
  caua: {name: 'Solar installation assistant', hours: 4, pay: 100},
  nina: {name: 'Environmental education tutor', hours: 4, pay: 90},
};
export const COMMUTE_FARE = 8;
const DAY_SHIFT_HOURS = 8;
const BUS_STOP = {x: 29, z: CELL_MIN + 1};

function shiftHours(job, fullDay) {
  return fullDay ? DAY_SHIFT_HOURS : job.hours;
}

function shiftPay(job, fullDay) {
  return job.pay * shiftHours(job, fullDay) / job.hours;
}

function shiftDuration(s, job, fullDay) {
  const commuteMinutes = tripEstimate(s.worldSettings?.town).minutes;
  return (shiftHours(job, fullDay) + commuteMinutes / 60) * HOUR;
}

export function setOutsideWork(s, r, enabled) {
  r.outsideJobEnabled = !!enabled;
  return true;
}

export function outsideWorkText(r) {
  const job = OUTSIDE_JOBS[r.id];
  const schedule = r.outsideJobEnabled ? 'Scheduled on weekday mornings when rested and free.' : 'Weekday shifts are off.';
  const current = r.outsideWork ? ' The current shift finishes on return.' : '';
  return `${job.name} · ${job.hours} hours · R$${job.pay} gross per weekday shift. The R$${COMMUTE_FARE} return fare can come out of wages. Meals, drinking water and toilet breaks are provided at work. ${schedule}${current}`;
}

function departureBlocker(s, r) {
  if (r.action === 'town') return 'Finishing a town trip.';
  // A completed batch can enter the return phase one tick before its worker
  // takes the first load. Keep that physical handoff with the worker.
  const operation = r.operation && s.operations?.find(op => op.id === r.operation && !op.done);
  if (r.cargo || (operation?.phase === 'return' && !operation.returningToSite) ||
      (operation?.phase === 'deliver' && !operation.water?.stagedAt) ||
      (r.action === 'service' && r.walk.length)) return 'Finishing a delivery.';
  if (r.tentPhase || r.sleepUntil || r.energy < 65) return 'Needs to rest before leaving.';
  if (r.needTask || ['bladder', 'bowels', 'hydration'].some(key => r.needs[key] < 20)) {
    return 'Taking care of personal needs before leaving.';
  }
  return '';
}

function departureMorning(r, {absoluteDay, hour}) {
  return hour >= 8 && hour < 11 && r.lastOutsideDay !== absoluteDay;
}

export function atTownJob(r) {
  return r.outsideWork?.phase === 'away';
}

export function dayShiftDue(s, r) {
  return !!r.dayShiftBooked && departureMorning(r, calendar(s.time));
}

export function dayShiftOffer(s, r) {
  const {absoluteDay, hour} = calendar(s.time);
  const work = r.outsideWork;
  const job = OUTSIDE_JOBS[r.id];
  const fullDay = !work || work.fullDay;
  const day = work?.day ?? (hour >= 11 || r.lastOutsideDay === absoluteDay ? absoluteDay + 1 : absoluteDay);
  const offer = {job: job.name, hours: shiftHours(job, fullDay), pay: shiftPay(job, fullDay), fare: COMMUTE_FARE, day};

  if (work) {
    const reason = {
      outbound: 'Walking to the bus for work.',
      away: 'Working in town. Wages are paid on return.',
      inbound: 'Returning to camp to collect wages.',
    }[work.phase];
    return {...offer, status: work.phase, available: false, reason};
  }
  if (s.mode === 'sandbox' || s.stage !== 'playing') {
    return {...offer, status: 'unavailable', available: false, reason: 'Day shifts are available after setting up camp in Story.'};
  }
  const when = day === absoluteDay ? 'today' : 'tomorrow';
  if (r.dayShiftBooked) {
    const blocker = dayShiftDue(s, r) && (departureBlocker(s, r) || r.outsideWorkBlocked);
    return {...offer, status: 'queued', available: false,
      reason: `Booked for ${when}, 08:00–11:00. ${blocker || 'Leaves when rested and free.'}`};
  }
  return {...offer, status: 'available', available: true, reason: `Departs ${when} between 08:00 and 11:00 when rested and free.`};
}

export function requestDayShift(s, r) {
  if (!s.people.includes(r) || !dayShiftOffer(s, r).available) return false;
  r.dayShiftBooked = true;
  r.outsideWorkBlocked = null;
  return true;
}

export function cancelDayShift(s, r) {
  if (!s.people.includes(r) || !r.dayShiftBooked) return false;
  delete r.dayShiftBooked;
  r.outsideWorkBlocked = null;
  return true;
}

export function startOutsideWork(s, r, route) {
  if ((!r.dayShiftBooked && !r.outsideJobEnabled) || r.outsideWork || s.mode === 'sandbox' || s.stage !== 'playing') return;
  const clock = calendar(s.time);
  if (!departureMorning(r, clock) || (!r.dayShiftBooked && clock.absoluteDay % 7 >= 5) || departureBlocker(s, r)) return;
  const path = route(s, r, BUS_STOP);
  if (!path) {
    r.outsideWorkBlocked = 'No walking route to the entrance.';
    return;
  }
  const fareDue = spendableMoney(s) < COMMUTE_FARE;
  if (!fareDue) transact(s, -COMMUTE_FARE, 'commuting', `${r.name}: return bus fare`);
  r.outsideWork = {phase: 'outbound', day: clock.absoluteDay, exit: BUS_STOP, fareDue};
  if (r.dayShiftBooked) {
    r.outsideWork.fullDay = true;
    delete r.dayShiftBooked;
  }
  r.lastOutsideDay = clock.absoluteDay;
  r.outsideWorkBlocked = null;
  clearDowntime(r);
  r.job = null;
  r.operation = null;
  r.linkJob = null;
  delete r.removalJob;
  r.workSpot = null;
  r.supplyGoal = null;
  r.restSite = null;
  r.needBlocked = null;
  r.lookAt = null;
  for (const job of s.upkeep?.jobs || []) {
    if (job.person === r.id && !job.done) delete job.person;
  }
  r.walk = path;
  r.target = BUS_STOP;
  r.action = 'walk';
  return true;
}

export function outsideWorkStep(s, r, dt, go, say) {
  const work = r.outsideWork;
  const job = OUTSIDE_JOBS[r.id];
  if (work.phase === 'outbound') {
    r.action = 'walk';
    if (go(s, r, work.exit)) {
      work.phase = 'away';
      work.until = s.time + shiftDuration(s, job, work.fullDay);
      r.action = 'outside';
    }
  } else if (work.phase === 'away') {
    r.action = 'outside';
    r.energy = Math.max(25, r.energy - dt * .06);
    for (const key of ['hunger', 'bladder', 'bowels', 'hydration']) r.needs[key] = Math.max(55, r.needs[key]);
    if (s.time >= work.until) {
      work.phase = 'inbound';
      r.action = 'walk';
    }
  } else {
    r.action = 'walk';
    if (!go(s, r, s.stock)) return;
    const paid = shiftPay(job, work.fullDay) - (work.fareDue ? COMMUTE_FARE : 0);
    transact(s, paid, 'outsideWork', `${r.name}: ${job.name}${work.fareDue ? ' (bus fare deducted by employer)' : ''}`);
    r.outsideWork = null;
    r.action = 'idle';
    say(s, `${r.name} returned from work and deposited R$${paid} in village savings.`);
  }
}

export function validOutsideWork(s) {
  const {absoluteDay} = calendar(s.time);
  return s.people.every(r => {
    if (r.outsideJobEnabled !== undefined && typeof r.outsideJobEnabled !== 'boolean') return false;
    if (r.dayShiftBooked !== undefined && typeof r.dayShiftBooked !== 'boolean') return false;
    if (r.dayShiftBooked && (r.outsideWork || s.mode === 'sandbox')) return false;
    if (r.lastOutsideDay !== undefined && (!Number.isInteger(r.lastOutsideDay) || r.lastOutsideDay < 0 || r.lastOutsideDay > absoluteDay)) return false;
    const work = r.outsideWork;
    if (!work) return true;
    if (activeTrips(s).some(t => t.person === r.id)) return false;
    if (work.fullDay !== undefined && typeof work.fullDay !== 'boolean') return false;
    if (work.fareDue !== undefined && typeof work.fareDue !== 'boolean') return false;
    if (!Number.isInteger(work.day) || work.day !== r.lastOutsideDay || work.exit?.x !== BUS_STOP.x || work.exit?.z !== BUS_STOP.z) return false;
    if (work.phase === 'outbound') return true;
    return ['away', 'inbound'].includes(work.phase) && Number.isFinite(work.until) && work.until >= 0
      && work.until <= s.time + shiftDuration(s, OUTSIDE_JOBS[r.id], work.fullDay) + 1e-8;
  });
}
