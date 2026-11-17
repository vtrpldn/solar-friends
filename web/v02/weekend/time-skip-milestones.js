import {DAY, calendar} from './weather.js';
import {BIOLOGY, CROP_CARE, growthRate} from './biological-production.js';
import {CROPS} from './cultivation.js';
import {activeTrips} from './trip-state.js';

// Read-only projections: never advance the village or initialize missing state.
export function upcomingMilestones(s, days, {projects = {}, materials = {}} = {}) {
  const events = [];
  const add = (at, title, detail, estimated = false) => {
    if (!Number.isFinite(at)) return;
    const remaining = Math.max(0, at - s.time);
    events.push({remaining, title, detail, estimated, withinSkip: remaining <= days * DAY});
  };
  const siteName = p => `${projects[p.key]?.name || p.key} #${p.id}`;
  if (s.mode !== 'sandbox') {
    for (const p of s.projects || []) for (const b of p.cultivation?.beds || []) {
      const crop = CROPS[b.crop];
      if (!crop) continue;
      const label = `${crop.name} · ${siteName(p)}, bed ${b.id + 1}`;
      if (b.stage === 'growing') {
        const rate = Math.min(1, b.moisture / .4) * (.3 + .7 * b.fertility) /
          (1 + Math.max(0, b.density - 1)) * (p.key === 'greenhouse' ? 1 : growthRate(s, 'vegetables'));
        if (rate > 0) add(s.time + (1 - b.growth) * crop.days * DAY / rate, `${label}: ready to harvest`, 'At current soil and seasonal conditions; resident harvesting still required.', true);
      }
      if (b.stage === 'harvestable') add(b.ripeAt + crop.window * DAY, `${label}: harvest losses begin`, 'Harvest before this point to avoid gradual field losses.');
    }
    for (const op of s.operations || []) {
      const biology = BIOLOGY[op.recipe];
      if (op.done || !biology || op.farm) continue;
      const p = s.projects?.find(p => p.id === op.site);
      const label = `${op.recipe.replaceAll('_', ' ')}${p ? ` · ${siteName(p)}` : ''}`;
      if (op.phase === 'growing') {
        const moisture = CROP_CARE[op.recipe] && p ? (p.soilMoisture ?? .75) : 1;
        const fertility = CROP_CARE[op.recipe] && p ? .5 + .5 * (p.soilFertility ?? 1) : 1;
        const rate = growthRate(s, op.recipe) * (moisture < .1 ? 0 : Math.min(1, moisture / .4)) * fertility;
        if (rate > 0) add(s.time + op.growthRemaining / rate, `${label}: ready for collection`, 'At current conditions; resident collection work still required.', true);
      }
      if (op.phase === 'process' && op.ripeAt !== undefined && Number.isFinite(biology.window)) add(op.ripeAt + biology.window * DAY, `${label}: collection losses begin`, 'Uncollected output gradually loses yield.');
    }
    for (const [id, lots] of Object.entries(s.foodStorage?.lots || {})) {
      const earliest = Math.min(...lots.filter(l => l.n > 0).map(l => l.expires));
      add(earliest, `${materials[id]?.name || id}: oldest stored food expires`, 'If still in storage; consumption or preservation may change this.');
    }
    for (const r of s.people || []) if (r.outsideWork?.phase === 'away') {
      add(r.outsideWork.until, `${r.name}: shift ends`, 'Starts returning to the village; wages arrive after the walk back.');
    }
    const day = calendar(s.time).absoluteDay;
    if (Object.values(s.suppliers || {}).some(entry => entry.day === day && entry.units > 0)) {
      add((day + 1) * DAY - DAY * 9 / 24, 'Town suppliers restock', 'Daily purchasing allocations renew.');
    }
  }
  for (const trip of activeTrips(s)) if (['outbound', 'away', 'inbound'].includes(trip.phase)) {
    const resident = s.people?.find(r => r.id === trip.person);
    add(s.time + trip.left, `${resident?.name || 'Town pickup'}: arrives from town`, 'Unloading and carrying supplies still remain.');
  }
  return events.sort((a, b) => a.remaining - b.remaining || a.title.localeCompare(b.title));
}

export function milestoneTime(event) {
  if (event.remaining === 0) return 'Now';
  const hours = event.remaining / DAY * 24;
  return `${event.estimated ? 'About ' : 'In '}${hours < 24 ? `${Math.max(1, Math.ceil(hours))}h` : `${(hours / 24).toFixed(1)} days`}`;
}
