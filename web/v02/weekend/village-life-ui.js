import {brl} from './money.js';
import {projectLabel} from './project-names.js';
import {foodPortions} from './food-storage.js';
import {
  ensureCommunity, planEvent, planError, cancelEvent, eventSites, eventDays, bookFavour, favourError, maxHelpers, maxGuests,
  goodwillText, dayName, clock, EVENT_KINDS, COURSES, COURSE_FEE, COURSE_FEE_NO_LUNCH, COURSE_SEATS, FESTA_WOOD,
} from './village-life.js';

// The Neighbours screen: what is coming up, what the village owes, and the
// three things the friends can call. Every figure comes from village-life.js.
const el = (tag, text, parent, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  parent?.append(node);
  return node;
};
const dayText = (s, day) => {
  const ahead = day - clock(s.time).absoluteDay;
  return `${dayName(day)}${ahead === 0 ? ', today' : ahead === 1 ? ', tomorrow' : `, in ${ahead} days`}`;
};
const hours = kind => `${String(EVENT_KINDS[kind].from).padStart(2, '0')}:00–${Math.floor(EVENT_KINDS[kind].to)}:${EVENT_KINDS[kind].to % 1 ? '30' : '00'}`;
const choices = new Map();

export function neighbourStats(s) {
  const c = ensureCommunity(s);
  return [['Neighbours’ goodwill', `${Math.round(c.goodwill)} / 100`], ['Days of work owed', c.owed], ['Planned', c.events.filter(e => e.kind !== 'roda').length]];
}
export function renderNeighbours(s, screen, defs, {notify, refresh, say, ready = () => true}) {
  const c = ensureCommunity(s), focused = document.activeElement?.dataset?.neighbour;
  screen.replaceChildren();
  const again = () => { refresh(); renderNeighbours(s, screen, defs, {notify, refresh, say, ready}); };
  const card = (title) => { const section = el('section', undefined, screen, 'day-shift neighbour-card'); el('h3', title, section); return section; };
  const picker = (parent, label, key, options) => {
    const wrap = el('label', label, parent), select = el('select', undefined, wrap);
    select.dataset.neighbour = key;
    for (const [value, text] of options) select.add(new Option(text, value));
    if (options.some(([value]) => String(value) === String(choices.get(key)))) select.value = choices.get(key);
    else if (options.length) choices.set(key, options[0][0]);
    select.onchange = () => { choices.set(key, select.value); again(); };
    return select;
  };
  const call = (parent, key, label, kind, options) => {
    const error = planError(s, kind, options, defs), button = el('button', label, parent);
    button.type = 'button'; button.dataset.neighbour = key; button.disabled = !!error;
    if (error) el('p', error, parent, 'neighbour-blocked');
    button.onclick = () => {
      const failed = planEvent(s, kind, options, defs);
      notify(failed || `${EVENT_KINDS[kind].name} set for ${dayText(s, options.day)}.`);
      again();
    };
  };
  const siteOptions = kind => eventSites(s, kind, defs).map(p => [p.id, kind === 'mutirao' ? `${projectLabel(p, defs)} · ${Math.round(p.work / defs[p.key].work * 100)}% built · ${ready(p) ? 'materials on site' : 'waiting for materials'}` : projectLabel(p, defs)]);
  const dayOptions = kind => eventDays(s, kind).map(day => [day, dayText(s, day)]);
  const meals = foodPortions(s), unlimited = s.mode === 'sandbox';

  el('p', `${goodwillText(c.goodwill)} Goodwill decides how many people come. A festa or a returned day of work raises it; calling people out for nothing, or sending them home hungry, lowers it.`, screen);

  const coming = card('Coming up');
  const planned = c.events.filter(e => e.kind !== 'roda' || e.phase === 'running');
  if (!planned.length) el('p', 'Nothing is planned.', coming);
  for (const e of planned) {
    const place = s.projects.find(p => p.id === e.site), row = el('p', undefined, coming);
    const who = e.kind === 'course' ? `${s.people.find(r => r.id === e.teacher)?.name} teaches ${COURSES[e.teacher].toLowerCase()}` : e.guests ? `${e.guests} neighbours` : 'friends only';
    el('strong', `${EVENT_KINDS[e.kind].name} · ${e.phase === 'running' ? 'happening now' : `${dayText(s, e.day)}, ${hours(e.kind)}`}`, row);
    row.append(` · ${place ? projectLabel(place, defs) : 'place removed'} · ${who}`);
    if (e.phase === 'planned') {
      const cancel = el('button', 'Call it off', coming); cancel.type = 'button'; cancel.dataset.neighbour = `cancel-${e.id}`;
      cancel.onclick = () => { cancelEvent(s, e.id, say); again(); };
    }
  }
  if (c.owed > 0) {
    el('p', `The village owes the neighbours ${c.owed} day${c.owed === 1 ? '' : 's'} of work for their help. A friend who goes is away from 08:00 for a working day, unpaid.`, coming);
    const going = s.people.filter(r => r.favourBooked || r.outsideWork?.favour);
    if (going.length) el('p', `${going.map(r => r.name).join(' and ')} ${going.length === 1 ? 'is' : 'are'} booked to go.`, coming);
    const who = picker(coming, 'Who goes', 'favour', s.people.map(r => [r.id, r.name]));
    const resident = s.people.find(r => r.id === who.value), error = favourError(s, resident);
    const send = el('button', `Send ${resident.name} for a day`, coming); send.type = 'button'; send.dataset.neighbour = 'send'; send.disabled = !!error;
    if (error) el('p', error, coming, 'neighbour-blocked');
    send.onclick = () => { if (bookFavour(s, resident)) notify(`${resident.name} will go the next morning they are rested and free.`); again(); };
  }

  const mutirao = card('Call a mutirão');
  el('p', `Neighbours come on a Saturday or Sunday, ${hours('mutirao')}, and work on one building whose materials are already on site. They expect lunch at 12:00 from the village stores, and one day of work from the village in return.`, mutirao);
  if (!siteOptions('mutirao').length) el('p', 'There is no building under construction to work on.', mutirao, 'neighbour-blocked');
  else {
    const site = picker(mutirao, 'Building', 'mutirao-site', siteOptions('mutirao')), day = picker(mutirao, 'Day', 'mutirao-day', dayOptions('mutirao'));
    const most = maxHelpers(s), count = picker(mutirao, 'Neighbours', 'mutirao-guests', Array.from({length: most - 1}, (_, i) => [i + 2, String(i + 2)]));
    el('p', unlimited ? 'Sandbox stores always have lunch for them.' : `Lunch for ${count.value}: ${meals} portions of food in stores now. Up to ${most} neighbours will come at this goodwill.`, mutirao);
    if (!ready(s.projects.find(p => p.id === Number(site.value)))) el('p', 'Its materials are not all on site yet. Neighbours can only work once they are; if they are still missing on the day, the neighbours will have nothing to do.', mutirao, 'neighbour-blocked');
    call(mutirao, 'mutirao-call', 'Call the mutirão', 'mutirao', {site: Number(site.value), day: Number(day.value), guests: Number(count.value)});
  }

  const course = card('Offer a weekend course');
  el('p', `A friend teaches their trade to paying visitors on a Saturday or Sunday, ${hours('course')}, and is away from other work that day. Each participant pays ${brl(COURSE_FEE)} with lunch from the village stores, or ${brl(COURSE_FEE_NO_LUNCH)} if there is not lunch for everyone. Up to ${COURSE_SEATS} come, more as goodwill grows; the region fills one course a fortnight.`, course);
  if (!siteOptions('course').length) el('p', 'A course needs a finished outdoor classroom or community hall.', course, 'neighbour-blocked');
  else {
    const site = picker(course, 'Place', 'course-site', siteOptions('course')), day = picker(course, 'Day', 'course-day', dayOptions('course'));
    const teacher = picker(course, 'Teacher', 'course-teacher', s.people.map(r => [r.id, `${r.name} · ${COURSES[r.id]}`]));
    call(course, 'course-call', 'Announce the course', 'course', {site: Number(site.value), day: Number(day.value), teacher: teacher.value});
  }

  const festa = card('Hold a festa');
  el('p', `An evening together, ${hours('festa')}, at a gathering place. Everyone who comes eats a portion from the stores; ${FESTA_WOOD} pieces of timber make the fire. In June it is a festa junina, and 4 kg of sweet corn makes it one to remember. Neighbours who are fed well think better of the village.`, festa);
  if (!siteOptions('festa').length) el('p', 'A festa needs a finished gathering place, fire circle or community hall.', festa, 'neighbour-blocked');
  else {
    const site = picker(festa, 'Place', 'festa-site', siteOptions('festa')), day = picker(festa, 'Day', 'festa-day', dayOptions('festa'));
    const count = picker(festa, 'Neighbours invited', 'festa-guests', Array.from({length: maxGuests(s) + 1}, (_, i) => [i, i ? String(i) : 'Friends only']));
    el('p', unlimited ? 'Sandbox stores always have food for everyone.' : `Food for ${s.people.length + Number(count.value)}: ${meals} portions in stores now.`, festa);
    call(festa, 'festa-call', 'Set the festa', 'festa', {site: Number(site.value), day: Number(day.value), guests: Number(count.value)});
  }

  const roda = card('The weekly roda');
  el('p', 'On Sunday from 18:00 the friends who are free sit together for a while at a gathering place and say what is on their minds.', roda);
  const toggle = el('button', `Weekly roda: ${c.roda ? 'on' : 'off'}`, roda); toggle.type = 'button'; toggle.dataset.neighbour = 'roda'; toggle.setAttribute('aria-pressed', String(c.roda));
  toggle.onclick = () => { c.roda = !c.roda; again(); };
  if (c.minutes) {
    el('strong', `Last roda · ${c.minutes.present.length} present`, roda);
    if (!c.minutes.said.length) el('p', 'Nobody had a worry to raise.', roda);
    for (const line of c.minutes.said) el('p', `${s.people.find(r => r.id === line.id)?.name}: “${line.text}”`, roda);
  }

  if (c.history.length) {
    el('h3', 'Lately', screen);
    for (const entry of c.history.slice(0, 6)) el('p', `${dayName(entry.day)} · ${entry.text}`, screen);
  }
  if (focused) (screen.querySelector(`[data-neighbour="${focused}"]`) || screen.querySelector('[data-neighbour]'))?.focus({preventScroll: true});
}
