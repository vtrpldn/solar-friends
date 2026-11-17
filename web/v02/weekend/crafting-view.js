// Derived display state only. Queue eligibility belongs to the simulation.
import { PROJECTS, PROCESSES, MATERIALS, productionBlocker, buildingOperatingStatus } from './simulation.js';
import { ITEMS } from './items.js';
import { equipmentSummary } from './equipment.js';

export function craftItem(recipe) {
  return recipe.equipmentRepair || Object.keys(recipe.output)[0];
}
export function craftName(recipe) {
  const id = craftItem(recipe);
  return ITEMS[id]?.name || MATERIALS[id]?.name || recipe.name;
}
export function workspaceName(site) {
  return site ? `${PROJECTS[site.key].name} #${site.id}` : 'Workspace unavailable';
}
export function craftWorkspaces(s, recipe) {
  return s.projects.filter(p => !p.felled && !p.removal && PROJECTS[p.key]?.kind === recipe.kind && p.work >= PROJECTS[p.key].work);
}
export function chosenWorkspace(s, recipe, chosen) {
  const sites = craftWorkspaces(s, recipe);
  const explicit = sites.find(p => p.id === chosen);
  const rank = p => (s.infrastructure.nodes[p.id]?.enabled === false ? 2 : 0)
    + (s.operations?.some(o => !o.done && !o.water && o.site === p.id) ? 1 : 0);
  return explicit || sites.sort((a, b) => rank(a) - rank(b) || a.id - b.id)[0];
}
export function readableBlocker(reason) {
  // Keep the engine's decision and quantities; translate identifiers for people.
  return reason.replace(/^Missing ([\d.]+) ([a-z_-]+)\.$/, (_, amount, id) => `Missing ${amount} ${MATERIALS[id]?.name || id}.`);
}
export function recipeStatus(s, id, site) {
  if (!site) return `Build a ${PROCESSES[id].kind === 'supply-5' ? 'timber workbench' : 'workshop'} first.`;
  return readableBlocker(productionBlocker(s, site.id, id));
}
export function craftEntries(s, section) {
  if (section === 'jobs') return (s.operations || []).filter(o => !o.done && PROCESSES[o.recipe]?.craft)
    .map(job => ({id: String(job.id), recipe: PROCESSES[job.recipe], recipeId: job.recipe, job}));
  return Object.entries(PROCESSES).filter(([, r]) => r.craft && (section === 'repair'
    ? r.equipmentRepair && equipmentSummary(s, r.equipmentRepair).owned > 0 : !r.equipmentRepair))
    .map(([id, recipe]) => ({id, recipeId: id, recipe}))
    .sort((a, b) => section === 'repair'
      ? equipmentSummary(s, b.recipe.equipmentRepair).wear - equipmentSummary(s, a.recipe.equipmentRepair).wear
      : 0);
}
export function craftJobStatus(s, job) {
  if (job.phase === 'return') return {state: 'Delivering', reason: 'Finished work is on its way to storage.'};
  const site = s.projects.find(p => p.id === job.site);
  return site ? buildingOperatingStatus(s, site) : {state: 'Workspace unavailable', reason: 'Move this job to a completed compatible workspace.'};
}
