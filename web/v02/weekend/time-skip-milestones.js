import {projectLabel} from './project-names.js';
import {DAY} from './weather.js';
import {BIOLOGY, CROP_CARE, growthRate} from './biological-production.js';
import {CROPS, harvestExpired} from './cultivation.js';
import {ANIMAL_RATIONS, animalAvailable} from './animal-care.js';

// Read-only projections: never advance the village or initialize missing state.
export function upcomingMilestones(s, days, {projects = {}} = {}) {
  const events = [];
  const add = (at, title, detail, estimated = false) => {
    if (!Number.isFinite(at)) return;
    const remaining = Math.max(0, at - s.time);
    events.push({remaining, title, detail, estimated, withinSkip: remaining <= days * DAY});
  };
  const siteName = p => projectLabel(p, projects);
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
      if (b.stage === 'harvestable' && !harvestExpired(b,s.time)) add(s.time, `${label}: ready to harvest`, 'Ready now; queue harvesting before advancing time.');
    }
    for (const op of s.operations || []) {
      const biology = BIOLOGY[op.recipe];
      if (op.done || !biology || op.farm || ['eggs', 'milk'].includes(op.recipe)) continue;
      const p = s.projects?.find(p => p.id === op.site);
      const label = `${op.recipe.replaceAll('_', ' ')}${p ? ` · ${siteName(p)}` : ''}`;
      if (op.phase === 'growing') {
        const moisture = CROP_CARE[op.recipe] && p ? (p.soilMoisture ?? .75) : 1;
        const fertility = CROP_CARE[op.recipe] && p ? .5 + .5 * (p.soilFertility ?? 1) : 1;
        const rate = growthRate(s, op.recipe) * (moisture < .1 ? 0 : Math.min(1, moisture / .4)) * fertility;
        if (rate > 0) add(s.time + op.growthRemaining / rate, `${label}: ready for collection`, 'At current conditions; resident collection work still required.', true);
      }
      if (op.phase === 'process' && op.ripeAt !== undefined && !op.failed) add(s.time, `${label}: ready for collection`, 'Ready now; resident collection work still required.');
    }
    for (const p of s.projects || []) {
      const kind = projects[p.key]?.kind || p.key;
      const ration = ANIMAL_RATIONS[kind], care = p.animalCare;
      if (!ration || !care || (projects[p.key] && p.work < projects[p.key].work)) continue;
      const available = animalAvailable(p);
      const product = ration.product === 'eggs' ? 'eggs' : 'L of milk';
      if (available > 0) add(s.time, `${siteName(p)}: ${available} ${product} ready to collect`, 'Ready now; residents still need to collect the produce.');
      if (available >= ration.batch * 2) continue;
      const daysToNext = animalProductionDays(p, ration);
      const suppliedDays = Math.min(care.feed / (ration.fodder / ration.days), care.water / (ration.water / ration.days));
      const title = `${siteName(p)}: ${ration.product === 'eggs' ? 'next egg laid' : 'next litre of milk ready'}`;
      if (daysToNext <= suppliedDays) add(s.time + daysToNext * DAY, title, 'Based on current health, feed, and drinking water; collection is separate.', true);
      else events.push({remaining: Infinity, title, detail: 'Waiting for animal care: replenish feed and drinking water before production can reach the next unit.', estimated: true, withinSkip: false, blocked: true});
    }
  }
  return events.sort((a, b) => a.remaining - b.remaining || a.title.localeCompare(b.title));
}

export function milestoneTime(event) {
  if (event.blocked) return 'Needs care';
  if (event.remaining === 0) return 'Now';
  const hours = event.remaining / DAY * 24;
  return `${event.estimated ? 'About ' : 'In '}${hours < 24 ? `${Math.max(1, Math.ceil(hours))}h` : `${(hours / 24).toFixed(1)} days`}`;
}

// animalStep restores five health points per fed day and produces continuously.
// Integrate that same recovery curve until the next whole unit is available.
export function animalProductionDays(p, ration) {
  const health = Math.max(0, Math.min(100, p.animalHealth ?? 100));
  const needed = Math.max(0, 1 - p.animalCare.pending) / ration.dailyOutput;
  const recoveryDays = (100 - health) / 5;
  const duringRecovery = (health * recoveryDays + 2.5 * recoveryDays ** 2) / 100;
  return needed <= duringRecovery
    ? (200 * needed) / (Math.sqrt(health ** 2 + 1000 * needed) + health)
    : recoveryDays + needed - duringRecovery;
}
