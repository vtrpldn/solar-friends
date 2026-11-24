import {brl} from './money.js';
import {DAY, HOUR, weatherAt} from './weather.js';
import {foodPortions} from './food-storage.js';
import {eventTime} from './event-history.js';
import {environmentInfo} from './environment-info.js';
import {quantityText} from './material-measures.js';
import {harvestExpired} from './cultivation.js';

// What changed while days were advanced: a snapshot before, a comparison after.
// Read-only on both sides, so it never alters the village it describes.
const MONEY_ROWS = [
  ['outsideWork', 'Paid shifts outside the village'],
  ['sales', 'Surplus sold in town'],
  ['household', 'Food bought'],
  ['purchases', 'Supplies bought'],
  ['construction', 'Building materials'],
  ['transport', 'Trips to town and deliveries'],
  ['commuting', 'Travel to outside work'],
  ['electricity', 'Grid electricity'],
];
const potableWater = s => Object.values(s.infrastructure?.nodes || {}).reduce((sum, node) => sum + (node.water?.[0] || 0), 0);
const cents = n => Math.round(n * 100);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const amountText = n => String(Number(n.toFixed(1)));

export function snapshotVillage(s) {
  return {
    time: s.time,
    money: s.money,
    tracked: s.mode !== 'sandbox',
    categories: {...(s.finances?.categories || {})},
    portions: foodPortions(s),
    water: potableWater(s),
    residents: s.people?.length || 0,
    stock: {...(s.materials || {}), wood: s.wood || 0},
    spoiled: {...(s.foodStorage?.spoiled || {})},
    batches: {...(s.productionAccounting?.batches || {})},
    projects: Object.fromEntries((s.projects || []).map(p => [p.id, {key: p.key, work: p.work || 0, removing: !!p.removal}])),
    beds: Object.fromEntries((s.projects || []).flatMap(p => (p.cultivation?.beds || []).map(b =>
      [`${p.id}:${b.id}`, {crop: b.crop, stage: b.stage, harvestedKg: b.exportedKg || 0, expired: harvestExpired(b, s.time)}]))),
    animals: Object.fromEntries((s.projects || []).filter(p => p.animalCare).map(p =>
      [p.id, {produced: p.animalCare.produced || 0, collected: p.animalCare.collected || 0, spoiled: p.animalCare.spoiled || 0}])),
  };
}

function rainyDays(s, from, to) {
  const days = new Set();
  for (let time = from + HOUR / 2; time < to; time += HOUR)
    if (weatherAt(s, time).rainMmPerHour > .05) days.add(Math.floor((time - from) / DAY));
  return days.size;
}

// Routine log lines become counts; the figures they describe are already in other sections.
const DIGEST = [
  [/bought emergency ingredients/, 'Emergency food runs', 'trip', 'The food reserve ran low, so residents drove to town for ingredients. You can change this rule in Resources.', 'resources'],
  [/returned from work and deposited/, 'Paid shifts worked', 'shift', 'Residents worked outside the village and brought their pay home.', 'finances'],
  [/returned from selling the village surplus/, 'Selling trips', 'trip', 'Residents took surplus to town and sold it.', 'finances'],
  [/the purchased food spoiled during the trip/, 'Shopping spoiled on the way home', 'trip', 'The food bought in town went off before it reached the stores.', 'food'],
];
const ROUTINE = [/purified .* for drinking/, /is heading to the car for town/, /unloaded .* from the car/, /to the existing town trip/];

export function summarizeSkip(before, s, {
  projects = {}, materials = {}, recipes = {},
  money = brl,
  requestedDays = null, completed = true,
} = {}) {
  const elapsed = Math.max(0, s.time - before.time), days = elapsed / DAY;
  const signed = n => `${n > 0 ? '+' : n < 0 ? '−' : ''}${money(Math.abs(n))}`;
  const siteName = (key, id) => projects[key]?.name || key.replaceAll('_', ' ');
  const materialName = id => materials[id]?.name || id.replaceAll('_', ' ');
  const sections = [];
  const section = (id, title, rows, extra = {}) => { if (rows.length) sections.push({id, title, rows, ...extra}); };

  // Savings: the Finances ledger records every movement by category.
  const moneyRows = [];
  const net = (cents(s.money) - cents(before.money)) / 100;
  if (before.tracked) {
    const delta = key => (cents(s.finances?.categories?.[key] || 0) - cents(before.categories[key] || 0)) / 100;
    const known = new Set(MONEY_ROWS.map(([key]) => key));
    let explained = 0;
    const push = (label, change) => {
      if (!cents(change)) return;
      explained += cents(change);
      moneyRows.push({label, value: signed(change), tone: change > 0 ? 'gain' : 'loss'});
    };
    for (const [key, label] of MONEY_ROWS) push(label, delta(key));
    for (const key of Object.keys(s.finances?.categories || {})) if (!known.has(key)) push(key.replaceAll('_', ' '), delta(key));
    const other = (cents(net) - explained) / 100;
    if (cents(other)) moneyRows.push({label: 'Other changes', value: signed(other), tone: other > 0 ? 'gain' : 'loss'});
  }
  section('money', 'Savings', moneyRows, {
    screen: 'finances', link: 'Open Finances',
    total: `${money(before.money)} → ${money(s.money)}`,
    note: cents(net) ? `${signed(net)} overall` : 'No change overall',
  });

  // Stores: what the village can eat and drink now.
  const storeRows = [];
  const portions = foodPortions(s), water = potableWater(s);
  const change = (label, was, now, unit, digits = 0) => {
    const a = Number(was.toFixed(digits)), b = Number(now.toFixed(digits));
    if (a === b) return;
    storeRows.push({label, value: `${a} → ${b}${unit}`, tone: b > a ? 'gain' : 'loss',
      detail: b === 0 ? 'None left.' : undefined});
  };
  change('Food portions', before.portions, portions, '');
  change('Drinking water', before.water, water, ' L');
  const spoiledParts = Object.entries(s.foodStorage?.spoiled || {})
    .map(([id, n]) => [id, n - (before.spoiled[id] || 0)]).filter(([, n]) => n > 1e-6)
    .map(([id, n]) => `${quantityText(id, n)} ${materialName(id).toLowerCase()}`);
  if (spoiledParts.length) storeRows.push({label: 'Food spoiled in storage', value: spoiledParts.join(', '), tone: 'loss',
    detail: 'It went past its shelf life before anyone ate or cooked it.'});
  section('stores', 'Food and water', storeRows, {screen: 'food', link: 'Open Food'});

  // Building sites.
  const buildRows = [];
  const percent = (p, key) => Math.min(100, Math.floor((p.work || 0) / (projects[key]?.work || 1) * 100));
  for (const p of s.projects || []) {
    const was = before.projects[p.id], def = projects[p.key];
    if (!def || !was || !def.work) continue;
    const then = percent(was, p.key), now = percent(p, p.key);
    if (was.work < def.work && p.work >= def.work) buildRows.push({label: siteName(p.key), value: 'Finished', tone: 'gain', detail: `Was ${then}% built.`, site: p.id});
    else if (now > then) buildRows.push({label: siteName(p.key), value: `${then}% → ${now}%`, site: p.id});
  }
  const current = new Set((s.projects || []).map(p => String(p.id)));
  for (const [id, was] of Object.entries(before.projects)) if (!current.has(id)) buildRows.push({label: siteName(was.key), value: was.removing ? 'Removed' : 'No longer on the land'});
  section('building', 'Building', buildRows);

  // Crops, animals and things residents made.
  const farmRows = [];
  const harvested = {}, ripened = {}, lost = {};
  for (const p of s.projects || []) for (const b of p.cultivation?.beds || []) {
    const was = before.beds[`${p.id}:${b.id}`];
    if (!was) continue;
    const kg = (b.exportedKg || 0) - was.harvestedKg;
    if (kg > 1e-6) harvested[was.crop] = (harvested[was.crop] || 0) + kg;
    const expired = harvestExpired(b, s.time);
    if ((b.stage === 'failed' && was.stage !== 'failed') || (expired && !was.expired)) lost[b.crop] = (lost[b.crop] || 0) + 1;
    else if (b.stage === 'harvestable' && was.stage === 'growing') ripened[b.crop] = (ripened[b.crop] || 0) + 1;
  }
  for (const [crop, kg] of Object.entries(harvested)) farmRows.push({label: `${materialName(crop)} harvested`, value: `${amountText(kg)} kg`, tone: 'gain'});
  for (const [crop, n] of Object.entries(ripened)) farmRows.push({label: `${materialName(crop)} ready to harvest`, value: plural(n, 'bed'), detail: 'Waiting for a resident to pick it.'});
  for (const [crop, n] of Object.entries(lost)) farmRows.push({label: `${materialName(crop)} lost in the field`, value: plural(n, 'bed'), tone: 'loss', detail: 'The crop failed or was not picked in time.'});
  for (const p of s.projects || []) {
    const care = p.animalCare, was = before.animals[p.id];
    if (!care || !was) continue;
    const collected = Math.floor(care.collected - was.collected + 1e-6), spoiled = Math.floor(care.spoiled - was.spoiled + 1e-6);
    if (collected > 0) farmRows.push({label: `${siteName(p.key)}: collected`, value: String(collected), tone: 'gain', site: p.id});
    if (spoiled > 0) farmRows.push({label: `${siteName(p.key)}: spoiled before collection`, value: String(spoiled), tone: 'loss', site: p.id});
  }
  for (const [id, n] of Object.entries(s.productionAccounting?.batches || {})) {
    const made = n - (before.batches[id] || 0);
    if (made > 0) farmRows.push({label: recipes[id]?.name || id.replaceAll('_', ' '), value: plural(made, 'batch', 'batches'), tone: 'gain'});
  }
  section('farm', 'Harvests and production', farmRows);

  // Supplies other than ready food, largest movements first.
  const stock = {...(s.materials || {}), wood: s.wood || 0};
  const stockChanges = Object.keys({...before.stock, ...stock})
    .map(id => [id, (stock[id] || 0) - (before.stock[id] || 0)])
    .filter(([id, n]) => Math.abs(n) > 1e-6 && !['meals', 'food', 'eggs', 'milk'].includes(id) && (before.tracked || s.mode !== 'sandbox'))
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const stockRows = stockChanges.slice(0, 6).map(([id, n]) => {
    let text;
    try { text = quantityText(id, Math.abs(n)); } catch { text = amountText(Math.abs(n)); }
    return {label: materialName(id), value: `${n > 0 ? '+' : '−'}${text}`, tone: n > 0 ? 'gain' : 'loss'};
  });
  section('supplies', 'Supplies in store', stockRows, {
    screen: 'resources', link: 'Open Resources',
    note: stockChanges.length > 6 ? `and ${plural(stockChanges.length - 6, 'smaller change')}` : undefined,
  });

  // The village log already speaks to the player; keep its words for anything unusual.
  const log = s.events || [];
  const notes = log.filter(e => Number.isFinite(e.time) && e.time > before.time).reverse();
  const partial = log.length >= 48 && notes.length === log.length;
  const noteRows = [];
  for (const [pattern, label, unit, detail, screen] of DIGEST) {
    const n = notes.filter(e => pattern.test(e.text)).reduce((sum, e) => sum + (e.count || 1), 0);
    if (n) noteRows.push({label, value: `${partial ? 'At least ' : ''}${plural(n, unit)}`, detail, screen});
  }
  const unusual = new Map();
  for (const e of notes) {
    if ([...DIGEST.map(([pattern]) => pattern), ...ROUTINE].some(pattern => pattern.test(e.text))) continue;
    const row = unusual.get(e.text) || {text: e.text, time: e.time, count: 0};
    row.count += e.count || 1;
    unusual.delete(e.text);
    unusual.set(e.text, row);
  }
  const said = [...unusual.values()];
  for (const e of said.slice(-6)) noteRows.push({label: eventTime(e.time).split(' · ')[0], value: e.count > 1 ? `${e.text} (${e.count} times)` : e.text, quote: true});
  section('notes', 'Around the village', noteRows, {
    note: said.length > 6 ? `Showing the latest 6 of ${said.length} notes.` : undefined,
  });
  if (s.people && s.people.length !== before.residents) {
    const diff = s.people.length - before.residents;
    sections.push({id: 'residents', title: 'Residents', rows: [{label: diff > 0 ? 'Arrived' : 'Left', value: plural(Math.abs(diff), 'resident'), tone: diff > 0 ? 'gain' : 'loss'}]});
  }

  const whole = Math.round(days);
  const dayText = Math.abs(days - whole) < .005 ? plural(whole, 'day') : `${days.toFixed(1)} days`;
  const rain = rainyDays(s, before.time, s.time), spanned = Math.max(1, Math.ceil(days - 1e-9));
  return {
    days, completed, requestedDays,
    title: elapsed <= 0 ? 'No time passed' : `${dayText} later`,
    stopped: !completed && requestedDays ? `Stopped early: ${dayText} of the ${plural(requestedDays, 'day')} you asked for.` : '',
    from: eventTime(before.time), to: eventTime(s.time),
    date: environmentInfo(s).date,
    weather: elapsed <= 0 ? '' : rain ? (spanned === 1 ? 'Some rain' : rain === spanned ? 'Rain every day' : `Rain on ${rain} of ${spanned} days`) : 'No rain',
    sections,
    quiet: sections.length === 0,
  };
}
