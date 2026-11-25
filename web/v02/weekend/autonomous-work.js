import {FOOD_SERVINGS} from './food-storage.js';
import {ITEMS} from './items.js';
import {equipmentSummary} from './equipment.js';
import {protectedStock} from './economy-policies.js';
import {ANIMAL_CARE} from './asset-upkeep.js';

// Residents start building work themselves. They keep a working stock of what
// each completed building can make, and stop before shared storage fills.
export const WORKING_BATCHES = 2;
// With hands to spare and nothing else to make, residents build a deeper reserve, one job at a time.
export const SPARE_BATCHES = 4;
export const STORAGE_SHARE = .8;
// Farther sites cost more walking than work between meals; the player can still order them.
export const MAX_WALK = 60;
// Food plots, animals and kitchens follow the food and farm schedulers.
const SCHEDULED_ELSEWHERE = ['kitchen','wild-tree','orchard','grove','apiary','coop','goat_pasture','cultivation'];

const pendingOutput = (s,recipes,id) => (s.operations||[]).reduce((n,o) => n + (o.done || o.water || o.farm ? 0 :
  (o.haulRemaining||o.returnItems||o.harvestOutput||recipes[o.recipe]?.output||{})[id] || 0), 0);

function fodderDemand(s,defs) {
  return s.projects.reduce((n,p) => {
    const kind = defs[p.key]?.kind, care = ANIMAL_CARE[kind];
    return n + (care && p.work >= defs[p.key].work && (p.key !== 'goat-pasture-empty' || p.stocked) ? care.fodder : 0);
  }, 0);
}

// Lower is more urgent; null means residents have no reason to start it now.
export function workNeed(s,recipe,recipes,defs,count,batches=WORKING_BATCHES) {
  if (recipe.installation || recipe.bedAction) return null;
  if (recipe.equipmentRepair) return equipmentSummary(s,recipe.equipmentRepair).broken > 0 ? -1 : null;
  const outputs = Object.keys(recipe.output);
  // Perishable food is harvested, cooked and bought against the food reserve instead.
  if (!outputs.length || outputs.some(id => FOOD_SERVINGS[id])) return null;
  for (const [id,n] of Object.entries(recipe.input))
    if (FOOD_SERVINGS[id] && (count(s,id)||0) - n < protectedStock(s,id,recipes)) return null;
  const id = outputs[0];
  let target = ITEMS[id]?.durable ? 1 : recipe.output[id] * batches;
  if (id === 'fodder') {
    const demand = fodderDemand(s,defs);
    if (!demand) return null;
    target = Math.max(target, demand * batches);
  }
  const have = (count(s,id)||0) + pendingOutput(s,recipes,id);
  return have < target ? have / target : null;
}

export function autonomousWorkPlan(s,p,recipes,defs,api,batches=WORKING_BATCHES) {
  const def = defs[p.key];
  if (s.mode === 'sandbox') return {reason:'Residents wait for work orders in sandbox.'};
  // Carrying the camp over from the cars comes first, and the camp can still move until a load lands.
  if (s.unpack) return {reason:'Residents unpack the camp first.'};
  if (!def || p.removal || p.felled || p.cultivation || p.work < def.work || SCHEDULED_ELSEWHERE.includes(def.kind)) return {};
  if (s.infrastructure?.nodes[p.id]?.enabled === false) return {reason:'Switched off.'};
  if (s.operations?.some(o => !o.done && o.site === p.id && !o.water)) return {reason:'A job is in progress.'};
  const candidates = Object.entries(recipes).filter(([,r]) => r.kind === def.kind)
    .map(([id,r]) => ({id,r,need:workNeed(s,r,recipes,defs,api.count,batches)})).filter(c => c.need !== null)
    .sort((a,b) => a.need - b.need || a.id.localeCompare(b.id));
  if (!Object.values(recipes).some(r => r.kind === def.kind && !r.installation)) return {};
  let reason = 'The village has a working stock of everything made here.';
  if (candidates.length && api.walk && api.walk(s,p) > MAX_WALK) return {reason:'Too far from the village stores for residents to start on their own. Order work here yourself.'};
  const queued = (s.operations||[]).reduce((n,o) => n + (o.done || o.water ? 0 :
    Object.values(o.haulRemaining||o.returnItems||o.harvestOutput||(o.farm?{}:recipes[o.recipe]?.output)||{}).reduce((a,b) => a+b, 0)), 0);
  for (const {id,r} of candidates) {
    const blocked = api.blocker(s,p.id,id);
    if (blocked) { reason = `${r.name}: ${blocked}`; continue; }
    const batch = Object.values(r.output).reduce((a,b) => a+b, 0) - Object.values(r.input).reduce((a,b) => a+b, 0);
    if (batch > 0 && api.stored(s) + queued + batch > api.capacity(s) * STORAGE_SHARE) { reason = `${r.name}: keeping storage room for food and deliveries.`; continue; }
    return {recipe:id,reason:`Next: ${r.name}`};
  }
  return {reason};
}

export function startAutonomousWork(s,recipes,defs,api) {
  if (s.stage !== 'playing' || s.mode === 'sandbox') return;
  for (const p of s.projects) {
    const plan = autonomousWorkPlan(s,p,recipes,defs,api);
    if (plan.recipe) api.queue(s,p.id,plan.recipe);
  }
  // Nothing left to make and at least two residents at leisure: stock up further.
  if (s.operations?.some(o => !o.done && o.auto)) return;
  if (s.people.filter(r => r.action === 'relax' && !r.operation && r.energy >= 50).length < 2) return;
  for (const p of s.projects) {
    const plan = autonomousWorkPlan(s,p,recipes,defs,api,SPARE_BATCHES);
    if (plan.recipe && !api.queue(s,p.id,plan.recipe)) return;
  }
}
