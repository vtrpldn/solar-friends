import {calendar, DAY, HOUR} from './weather.js';
import {transact} from './finances.js';
import {foodChange} from './food-storage.js';
import {concern, rememberShared} from './resident-mind.js';
import {profileFor} from './resident-personality.js';
import {brl} from './money.js';

// Life with the neighbours: mutirões, courses, festas and the weekly roda.
// Everything here is an event on a day at a place. Neighbours' goodwill is the
// one shared quantity: it sets how many people come, a festa or a returned
// day of work raises it, and letting people down lowers it.
// Fees, turnout and work rates are authored estimates; see docs/village-life.md.
export const EVENT_KINDS = {
  mutirao: {name: 'Mutirão', from: 8, to: 16, lunch: 12, weekend: true},
  course: {name: 'Weekend course', from: 9, to: 15, lunch: 12, weekend: true},
  festa: {name: 'Festa', from: 17, to: 21, lunch: 18, weekend: false},
  roda: {name: 'Roda', from: 18, to: 19, weekend: true},
};
export const COURSES = {
  iara: 'Agroecological gardening',
  bento: 'Timber joinery and repairs',
  luz: 'Cooking from the garden',
  caua: 'Small solar systems',
  nina: 'Reading the land',
};
export const COURSE_FEE = 120, COURSE_FEE_NO_LUNCH = 95, COURSE_SEATS = 12, COURSE_GAP_DAYS = 14;
export const FESTA_WOOD = 2, FESTA_GAP_DAYS = 14, FESTA_CORN = 4;
// One neighbour adds this share of a resident's building pace: they do not know the site.
export const HELPER_PACE = .7;
const GATHERING_PLACES = ['square', 'fire-circle', 'community-hall'];
const COURSE_PLACES = ['outdoor-classroom', 'community-hall'];
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
// Day and hour from one division, so the hour can never lag the day at midnight.
export function clock(time) {
  const t = time + DAY * 9 / 24, absoluteDay = Math.floor(t / DAY);
  return {absoluteDay, hour: (t - absoluteDay * DAY) / HOUR, month: calendar(time).month};
}

export function ensureCommunity(s) {
  return s.community ??= {version: 1, goodwill: 40, owed: 0, roda: true, nextId: 1, events: [], history: []};
}
export const maxHelpers = s => clamp(2 + Math.floor(ensureCommunity(s).goodwill / 12), 2, 10);
export const maxGuests = s => clamp(4 + Math.floor(ensureCommunity(s).goodwill / 10), 4, 14);
export function goodwillText(goodwill) {
  return goodwill >= 80 ? 'The neighbours think of you as their own.' : goodwill >= 60 ? 'The neighbours are glad you came.'
    : goodwill >= 35 ? 'The neighbours know you and are friendly.' : goodwill >= 15 ? 'The neighbours are wary; you have let them down.'
    : 'The neighbours keep their distance.';
}
const weekend = day => day % 7 >= 5;
export const dayName = day => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][((day % 7) + 7) % 7];
const built = (p, defs) => !!defs[p.key] && !p.removal && !p.natural && !defs[p.key].natural && p.work >= defs[p.key].work;
const kindOf = (p, defs) => defs[p.key]?.kind;
const centre = (p, defs) => {
  const turned = (p.rotation || 0) % 2, [w, d] = p.fieldSize || defs[p.key].size, size = turned ? [d, w] : [w, d];
  return {x: p.x + (size[0] - 1) / 2, z: p.z + (size[1] - 1) / 2, radius: Math.max(...size) / 2 + .9};
};
function random(seed, index, salt) {
  let x = (seed | 0) ^ Math.imul(index | 0, 0x45d9f3b) ^ salt;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b); x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

// Places an event of this kind can be held now.
export function eventSites(s, kind, defs) {
  if (kind === 'mutirao') return s.projects.filter(p => defs[p.key] && !p.natural && !defs[p.key].natural && !p.removal &&
    !['road', 'bridge'].includes(p.key) && !p.cultivation && p.work < defs[p.key].work);
  const kinds = kind === 'course' ? COURSE_PLACES : GATHERING_PLACES;
  return s.projects.filter(p => built(p, defs) && (kinds.includes(kindOf(p, defs)) || kinds.includes(p.key)));
}
// The next few days an event of this kind can fall on; today only before it would start.
export function eventDays(s, kind, count = 4) {
  const now = clock(s.time), rule = EVENT_KINDS[kind], days = [];
  for (let day = now.absoluteDay + (now.hour < rule.from - 1 ? 0 : 1); days.length < count; day++)
    if (!rule.weekend || weekend(day)) days.push(day);
  return days;
}
export function planError(s, kind, {site, day, guests = 0, teacher} = {}, defs) {
  const c = ensureCommunity(s), rule = EVENT_KINDS[kind];
  if (!rule || kind === 'roda') return 'Choose a kind of event.';
  if (s.stage !== 'playing') return 'Set up camp first.';
  const place = eventSites(s, kind, defs).find(p => p.id === site);
  if (!place) return kind === 'mutirao' ? 'Choose a building that is still being built.' : kind === 'course' ? 'A course needs a finished outdoor classroom or community hall.' : 'A festa needs a finished gathering place, fire circle or community hall.';
  if (!Number.isInteger(day) || !eventDays(s, kind, 12).includes(day)) return rule.weekend ? 'Choose a Saturday or Sunday that has not started.' : 'Choose a day that has not started.';
  if (c.events.some(e => e.phase !== 'done' && e.day === day && e.kind !== 'roda')) return 'Something is already planned for that day.';
  if (kind === 'mutirao') {
    if (c.owed >= 2) return 'You owe the neighbours two days of work. Return one before asking again.';
    if (!Number.isInteger(guests) || guests < 2 || guests > maxHelpers(s)) return `Ask between 2 and ${maxHelpers(s)} neighbours.`;
  }
  if (kind === 'course') {
    if (!s.people.some(r => r.id === teacher)) return 'Choose who teaches.';
    if (c.lastCourseDay !== undefined && day - c.lastCourseDay < COURSE_GAP_DAYS) return `The region fills one course a fortnight. The next can be on or after day ${c.lastCourseDay + COURSE_GAP_DAYS + 1}.`;
    if (c.events.some(e => e.kind === 'course' && e.phase !== 'done' && Math.abs(e.day - day) < COURSE_GAP_DAYS)) return 'Another course is already announced within a fortnight.';
  }
  if (kind === 'festa' && (!Number.isInteger(guests) || guests < 0 || guests > maxGuests(s))) return `Invite up to ${maxGuests(s)} neighbours.`;
  return '';
}
export function planEvent(s, kind, options, defs) {
  const error = planError(s, kind, options, defs);
  if (error) return error;
  const c = ensureCommunity(s), {site, day, guests = 0, teacher} = options;
  c.events.push({id: c.nextId++, kind, site, day, guests: kind === 'course' ? 0 : guests, phase: 'planned', ...(kind === 'course' ? {teacher} : {})});
  return '';
}
export function cancelEvent(s, id, say) {
  const c = ensureCommunity(s), event = c.events.find(e => e.id === id);
  if (!event || event.phase !== 'planned') return false;
  // Calling it off with a day's notice costs nothing; on the day people have already set out.
  const late = event.guests > 0 && clock(s.time).absoluteDay >= event.day;
  if (late) c.goodwill = clamp(c.goodwill - 5, 0, 100);
  c.events = c.events.filter(e => e !== event);
  say?.(s, `${EVENT_KINDS[event.kind].name} called off${late ? '. The neighbours had already set out' : ''}.`);
  return true;
}
// A resident goes to work on a neighbour's land for a day. Booked like a day shift.
export function favourError(s, r) {
  const c = ensureCommunity(s);
  if (!s.people.includes(r)) return 'Choose a resident.';
  if (c.owed < 1) return 'You owe the neighbours no work.';
  if (s.people.filter(p => p.favourBooked || p.outsideWork?.favour).length >= c.owed) return 'Enough friends are already going.';
  if (r.favourBooked || r.outsideWork || r.dayShiftBooked) return `${r.name} is already booked.`;
  return '';
}
export function bookFavour(s, r) {
  if (favourError(s, r)) return false;
  r.favourBooked = true; return true;
}
export function settleFavour(s, r, say) {
  const c = ensureCommunity(s);
  c.owed = Math.max(0, c.owed - 1); c.goodwill = clamp(c.goodwill + 5, 0, 100);
  rememberShared(s, r, 'Spent a day working on a neighbour’s land. They fed us well and sent their thanks.');
  say(s, `${r.name} is back from a day’s work on a neighbour’s land. ${c.owed ? `The village still owes ${c.owed} day${c.owed === 1 ? '' : 's'}.` : 'The village owes nothing now.'}`);
}

const running = s => (s.community?.events || []).filter(e => e.phase === 'running');
// The gathering a resident should walk to now, if any.
export function gatheringFor(s, r) {
  for (const e of running(s)) {
    if (e.kind === 'mutirao' || !e.centre) continue;
    if (e.kind === 'course' && e.teacher !== r.id) continue;
    return {id: e.id, centre: e.centre,
      label: e.kind === 'course' ? `Teaching ${COURSES[r.id].toLowerCase()}` : e.kind === 'festa' ? `At the ${e.title || 'festa'}` : 'Sitting in the roda',
      animation: e.kind === 'course' ? 'chat' : e.kind === 'roda' ? 'fire-sit' : 'chat'};
  }
  return null;
}
// Called while a resident is present at a gathering.
export function attend(s, r, id, dt) {
  const e = running(s).find(e => e.id === id);
  if (!e) return false;
  if (e.kind === 'course') e.taught = (e.taught || 0) + dt;
  else (e.present ??= {})[r.id] = (e.present[r.id] || 0) + dt;
  return true;
}
// Neighbours and course participants standing at a running event, for drawing.
export function communityVisitors(s) {
  const visitors = [];
  for (const e of running(s)) {
    if (!e.centre || !e.here) continue;
    for (let k = 0; k < e.here; k++) {
      const a = (k + .5) * Math.PI * 2 / e.here + e.id, ring = e.centre.radius + (e.kind === 'course' ? -.2 : (k % 2) * .5);
      visitors.push({key: `${e.id}:${k}`, look: (e.id * 7 + k) % 6, x: e.centre.x + Math.sin(a) * ring, z: e.centre.z + Math.cos(a) * ring,
        facing: {x: e.centre.x, z: e.centre.z}, pose: e.kind === 'mutirao' ? (k % 3 ? 'work' : 'carry') : e.kind === 'course' ? 'listen' : 'chat'});
    }
  }
  return visitors;
}

function feed(s, people) {
  const served = Math.min(people, Math.floor(s.mode === 'sandbox' ? people : s.materials.meals || 0));
  if (served > 0 && s.mode !== 'sandbox') foodChange(s, 'meals', -served, undefined, 'meals for guests');
  return served;
}
function start(s, e, defs, say) {
  const c = ensureCommunity(s), place = s.projects.find(p => p.id === e.site), rule = EVENT_KINDS[e.kind];
  const fail = (text, cost) => {
    c.goodwill = clamp(c.goodwill - cost, 0, 100); e.phase = 'done';
    c.history.unshift({kind: e.kind, day: e.day, text}); say(s, text);
  };
  if (!place || (e.kind === 'mutirao' ? place.work >= defs[place.key].work : !built(place, defs)))
    return fail(`${rule.name} called off: ${e.kind === 'mutirao' ? 'the building is already finished' : 'the place is not ready'}.${e.guests ? ' The neighbours had set out for nothing.' : ''}`, e.guests ? 5 : 0);
  e.phase = 'running'; e.until = s.time + (rule.to - Math.max(rule.from, clock(s.time).hour)) * HOUR;
  e.centre = centre(place, defs);
  if (e.kind === 'mutirao') { e.here = e.guests; e.worked = 0; say(s, `Mutirão: ${e.guests} neighbours have come to work on the ${defs[place.key].name.toLowerCase()}.`); }
  if (e.kind === 'course') {
    c.lastCourseDay = e.day;
    const teacher = s.people.find(r => r.id === e.teacher);
    e.here = clamp(Math.round(2 + c.goodwill / 100 * 7 + random(s.landSeed, e.day, 0x2f1) * 3), 2, COURSE_SEATS);
    say(s, `${e.here} people have arrived for ${teacher.name}’s course, ${COURSES[e.teacher].toLowerCase()}.`);
  }
  if (e.kind === 'festa') {
    const june = clock(s.time).month === 5;
    e.title = june ? 'festa junina' : 'festa'; e.here = e.guests;
    if (s.mode !== 'sandbox') {
      if ((s.wood || 0) >= FESTA_WOOD) { foodChange(s, 'wood', -FESTA_WOOD, undefined, 'festa bonfire'); e.fire = true; }
      if (june && (s.materials.corn || 0) >= FESTA_CORN) { foodChange(s, 'corn', -FESTA_CORN, undefined, 'festa junina'); e.corn = true; }
    } else { e.fire = true; e.corn = june; }
    e.fed = feed(s, s.people.length + e.guests);
    say(s, `The ${e.title} has begun${e.guests ? ` with ${e.guests} neighbours` : ''}${e.fire ? ', around a fire' : ''}.`);
  }
  if (e.kind === 'roda') say(s, 'The friends are sitting down for the weekly roda.');
}
function finish(s, e, defs, say) {
  const c = ensureCommunity(s), place = s.projects.find(p => p.id === e.site);
  let text;
  if (e.kind === 'mutirao') {
    c.owed += 1;
    const hours = e.worked / HOUR, share = place && defs[place.key] ? e.worked / defs[place.key].work : 0;
    text = `Mutirão over: ${e.guests} neighbours gave ${hours.toFixed(1)} hours of work${share >= .01 ? `, ${Math.round(share * 100)}% of the building` : ''}${e.unfed ? `; ${e.unfed} went home hungry` : ''}. The village owes a day of work in return.`;
    if (e.unfed) c.goodwill = clamp(c.goodwill - 2 * e.unfed, 0, 100);
    for (const r of s.people) rememberShared(s, r, `Neighbours came for a mutirão. ${profileFor(r).traits.includes('Reserved') ? 'So many hands; it was good, and a lot.' : 'Many hands made the day feel light.'}`);
  }
  if (e.kind === 'course') {
    const teacher = s.people.find(r => r.id === e.teacher), length = (EVENT_KINDS.course.to - EVENT_KINDS.course.from) * HOUR;
    const taught = (e.taught || 0) / length;
    if (taught < .4) {
      c.goodwill = clamp(c.goodwill - 5, 0, 100);
      text = `The course fell apart: ${teacher?.name || 'the teacher'} was there for only ${Math.round(taught * 100)}% of it. Fees were returned.`;
    } else {
      const fee = e.fed >= e.here ? COURSE_FEE : COURSE_FEE_NO_LUNCH, paid = transact(s, e.here * fee, 'courses', `${COURSES[e.teacher]}: ${e.here} participants`);
      c.goodwill = clamp(c.goodwill + 1, 0, 100);
      text = `Course finished: ${e.here} participants at ${brl(fee)}${e.fed >= e.here ? ' with lunch' : ' (no lunch to offer)'} brought ${brl(paid || e.here * fee)} into village savings.`;
      if (teacher) rememberShared(s, teacher, `Taught ${COURSES[e.teacher].toLowerCase()} to ${e.here} people. They asked good questions.`);
    }
  }
  if (e.kind === 'festa') {
    const hungry = s.people.length + e.guests - (e.fed || 0);
    const fresh = c.lastFestaDay === undefined || e.day - c.lastFestaDay >= FESTA_GAP_DAYS;
    const gain = e.guests ? clamp((fresh ? 6 : 2) + (e.fire ? 1 : 0) + (e.corn ? 2 : 0) - hungry, -6, 9) : 0;
    c.goodwill = clamp(c.goodwill + gain, 0, 100); c.lastFestaDay = e.day;
    text = `The ${e.title} is over${e.guests ? `: ${e.guests} neighbours came` : ''}${hungry > 0 ? `, and there was food for only ${e.fed}` : ''}.${gain > 0 ? ' People will talk about it warmly.' : gain < 0 ? ' People went home hungry.' : ''}`;
    for (const r of s.people) if (e.present?.[r.id] > HOUR / 2) rememberShared(s, r, `The ${e.title}${e.fire ? ' by the fire' : ''}. ${profileFor(r).temperament.socialAt >= 45 ? 'I did not want it to end.' : 'I stayed longer than I meant to.'}`);
  }
  if (e.kind === 'roda') {
    const present = s.people.filter(r => e.present?.[r.id] > HOUR / 4);
    const said = present.map(r => ({id: r.id, text: concern(s, r)})).filter(v => v.text);
    c.minutes = {day: e.day, present: present.map(r => r.id), said};
    text = present.length < 2 ? 'Too few friends were free for the roda this week.'
      : `Roda: ${present.length} friends sat together. ${said.length ? said.map(v => `${s.people.find(r => r.id === v.id).name}: “${v.text}”`).join(' ') : 'Nobody had a worry to raise.'}`;
  }
  e.phase = 'done'; delete e.centre; delete e.here; delete e.present;
  c.history.unshift({kind: e.kind, day: e.day, text}); c.history.length = Math.min(c.history.length, 12);
  say(s, text);
}

// `api.ready(project)` says whether a site's materials have all been carried to it.
export function communityStep(s, dt, defs, api) {
  if (s.stage !== 'playing') return;
  const c = ensureCommunity(s), now = clock(s.time);
  if (c.roda && weekend(now.absoluteDay) && now.absoluteDay % 7 === 6 && c.lastRodaDay !== now.absoluteDay && now.hour >= EVENT_KINDS.roda.from && now.hour < EVENT_KINDS.roda.to &&
      !c.events.some(e => e.phase === 'running')) {
    const place = eventSites(s, 'festa', defs)[0];
    c.lastRodaDay = now.absoluteDay;
    if (place) c.events.push({id: c.nextId++, kind: 'roda', site: place.id, day: now.absoluteDay, guests: 0, phase: 'planned'});
  }
  for (const e of c.events) {
    const rule = EVENT_KINDS[e.kind];
    if (e.phase === 'planned') {
      if (now.absoluteDay > e.day || (now.absoluteDay === e.day && now.hour >= rule.to)) { e.phase = 'done'; c.history.unshift({kind: e.kind, day: e.day, text: `${rule.name} missed.`}); }
      else if (now.absoluteDay === e.day && now.hour >= rule.from) start(s, e, defs, api.say);
    }
    if (e.phase !== 'running') continue;
    if (e.kind === 'mutirao') {
      const place = s.projects.find(p => p.id === e.site), total = place && defs[place.key]?.work;
      // Neighbours stop short of the last touches: the friends finish their own building.
      if (place && api.ready(place) && place.work < total * .97) {
        const add = Math.min(total * .97 - place.work, dt * e.here * HELPER_PACE);
        place.work += add; e.worked += add;
      }
    }
    if (rule.lunch !== undefined && e.kind !== 'festa' && e.fed === undefined && now.hour >= rule.lunch) {
      e.fed = feed(s, e.here);
      if (e.kind === 'mutirao' && e.fed < e.here) { e.unfed = e.here - e.fed; e.here = e.fed; api.say(s, `There was lunch for only ${e.fed} of the neighbours. ${e.unfed} went home.`); }
    }
    if (s.time >= e.until) finish(s, e, defs, api.say);
  }
  if (c.events.some(e => e.phase === 'done')) c.events = c.events.filter(e => e.phase !== 'done');
}
export function validCommunity(s, defs) {
  const c = s.community;
  if (c === undefined) return true;
  if (!c || c.version !== 1 || !Number.isFinite(c.goodwill) || c.goodwill < 0 || c.goodwill > 100 || !Number.isInteger(c.owed) || c.owed < 0 || c.owed > 50 ||
      typeof c.roda !== 'boolean' || !Number.isInteger(c.nextId) || c.nextId < 1 || !Array.isArray(c.events) || c.events.length > 40 || !Array.isArray(c.history) || c.history.length > 12) return false;
  if (['lastCourseDay', 'lastFestaDay', 'lastRodaDay'].some(k => c[k] !== undefined && !Number.isInteger(c[k]))) return false;
  if (!c.history.every(h => h && EVENT_KINDS[h.kind] && Number.isInteger(h.day) && typeof h.text === 'string' && h.text.length <= 900)) return false;
  if (c.minutes !== undefined && !(c.minutes && Number.isInteger(c.minutes.day) && Array.isArray(c.minutes.present) && Array.isArray(c.minutes.said) &&
      c.minutes.said.every(v => v && s.people.some(r => r.id === v.id) && typeof v.text === 'string' && v.text.length <= 300))) return false;
  if (!s.people.every(r => r.favourBooked === undefined || typeof r.favourBooked === 'boolean')) return false;
  return c.events.every(e => e && EVENT_KINDS[e.kind] && Number.isInteger(e.id) && e.id > 0 && e.id < c.nextId && Number.isInteger(e.day) && e.day >= 0 &&
    Number.isInteger(e.guests) && e.guests >= 0 && e.guests <= 14 && ['planned', 'running'].includes(e.phase) && s.projects.some(p => p.id === e.site && defs[p.key]) &&
    (e.kind !== 'course' || s.people.some(r => r.id === e.teacher)) &&
    (e.phase !== 'running' || (Number.isFinite(e.until) && e.until <= s.time + DAY && e.centre && ['x', 'z', 'radius'].every(k => Number.isFinite(e.centre[k])))) &&
    ['here', 'fed', 'unfed', 'worked', 'taught'].every(k => e[k] === undefined || (Number.isFinite(e[k]) && e[k] >= 0)));
}
