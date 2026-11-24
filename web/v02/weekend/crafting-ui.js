import { CRAFT_SKILLS, skillLevel, craftStage } from './crafting.js';
import { MATERIALS, materialCount, queueProduction, moveCraftJob } from './simulation.js';
import { equipmentSummary, EQUIPMENT_LIFE } from './equipment.js';
import { ITEMS } from './items.js';
import { quantityText } from './material-measures.js';
import { illustrate } from './ui-art.js';
import { craftItem, craftName, craftEntries, craftWorkspaces, chosenWorkspace, workspaceName, recipeStatus, craftJobStatus } from './crafting-view.js';

// A restored/new village has a new state object. UI choices never enter saves.
const views = new WeakMap();
const roots = new WeakMap();
const add = (parent, tag, text, className) => {
  const el = document.createElement(tag);
  if (text) el.textContent = text;
  if (className) el.className = className;
  parent.append(el);
  return el;
};
function art(parent, recipe) {
  const id = craftItem(recipe), img = add(parent, 'img', '', 'craft-art');
  illustrate(img, ITEMS[id]?.art || id);
}
function button(parent, text, key, action) {
  const el = add(parent, 'button', text);
  el.type = 'button';
  el.dataset.craftFocus = key;
  el.onclick = action;
  return el;
}

export function renderCrafting(s, root, notify, refresh) {
  if (!views.has(s)) views.set(s, {section: 'make', selected: {}, sites: new Map(), scroll: {}, expanded: new Set(), message: ''});
  const ui = views.get(s), sameVillage = roots.get(root) === s;
  const oldSection = root.dataset.section;
  const focus = sameVillage && root.contains(document.activeElement) ? document.activeElement.dataset.craftFocus : null;
  if (sameVillage && oldSection) ui.scroll[oldSection] = [root.querySelector('.craft-list')?.scrollTop || 0, root.querySelector('.craft-detail-body')?.scrollTop || 0];
  roots.set(root, s);
  root.replaceChildren();
  root.dataset.section = ui.section;
  const redraw = () => renderCrafting(s, root, notify, refresh);
  const announce = message => {ui.message = message; notify(message);};
  const nav = add(root, 'nav', '', 'craft-tabs');
  nav.setAttribute('aria-label', 'Crafting activities');
  const jobs = craftEntries(s, 'jobs');
  for (const [id, label] of [['make', 'Make'], ['repair', 'Repair'], ['jobs', `Jobs · ${jobs.length}`]]) {
    const tab = button(nav, label, `section-${id}`, () => {ui.section = id; ui.message = ''; redraw();});
    tab.setAttribute('aria-pressed', String(ui.section === id));
  }
  const layout = add(root, 'div', '', 'craft-layout');
  const list = add(layout, 'div', '', 'craft-list');
  list.setAttribute('aria-label', `${ui.section === 'jobs' ? 'Crafting jobs' : ui.section === 'repair' ? 'Owned equipment' : 'Craftable items'}`);
  const entries = craftEntries(s, ui.section);
  if (!entries.some(e => e.id === ui.selected[ui.section])) {
    const ready = ui.section === 'make' && entries.find(e => !recipeStatus(s, e.recipeId, chosenWorkspace(s, e.recipe, ui.sites.get(e.id))));
    ui.selected[ui.section] = (ready || entries[0])?.id;
  }
  const selected = entries.find(e => e.id === ui.selected[ui.section]);
  for (const entry of entries) {
    const {recipe, id, job} = entry;
    const row = button(list, '', `entry-${id}`, () => {
      ui.selected[ui.section] = id;
      redraw();
      root.querySelector('.craft-detail-body').scrollTop = 0;
    });
    row.className = 'craft-entry';
    row.setAttribute('aria-pressed', String(entry === selected));
    art(row, recipe);
    const text = add(row, 'span');
    add(text, 'strong', craftName(recipe));
    let status;
    if (job) status = `${recipe.equipmentRepair ? 'Repair · ' : ''}${craftJobStatus(s, job).state}`;
    else if (ui.section === 'repair') {
      const equipment = equipmentSummary(s, recipe.equipmentRepair);
      status = equipment.repairing ? 'Repair in progress' : equipment.wear > 0 ? `${equipment.broken ? 'Broken · ' : ''}Needs repair` : 'Good condition';
    } else status = recipeStatus(s, entry.recipeId, chosenWorkspace(s, recipe, ui.sites.get(id))) ? 'Requirements needed' : 'Ready to make';
    add(text, 'small', status);
  }
  const detail = add(layout, 'section', '', 'craft-detail');
  detail.setAttribute('aria-label', 'Selected crafting details');
  const body = add(detail, 'div', '', 'craft-detail-body');
  if (!selected) {
    add(body, 'h3', ui.section === 'jobs' ? 'Nothing underway' : 'No equipment to repair');
    add(body, 'p', ui.section === 'jobs' ? 'Choose an item in Make or Repair to plan the next job.' : 'Owned repairable equipment will appear here. Find shared tools in Items & equipment.');
    button(body, 'Browse things to make', 'browse-make', () => {ui.section = 'make'; redraw();});
  } else {
    const {recipe, recipeId, id, job} = selected, rule = recipe.craft;
    const heading = add(body, 'div', '', 'craft-detail-heading');
    art(heading, recipe);
    const title = add(heading, 'div');
    add(title, 'small', job ? recipe.equipmentRepair ? 'REPAIR JOB' : 'MAKING NOW' : recipe.equipmentRepair ? 'CARE FOR SHARED TOOLS' : 'MADE IN THE VILLAGE', 'craft-eyebrow');
    add(title, 'h3', craftName(recipe));
    add(title, 'p', recipe.equipmentRepair ? 'Restore one tool’s worth of condition.' : `Makes ${Object.values(recipe.output)[0]} · ${materialCount(s, craftItem(recipe))} in stores`);
    const footer = add(detail, 'div', '', 'craft-action');
    if (job) {
      const status = craftJobStatus(s, job), worker = s.people.find(r => r.operation === job.id);
      add(body, 'h4', status.state);
      add(body, 'p', status.reason);
      const progress = add(body, 'progress');
      progress.max = recipe.work;
      progress.value = Math.min(recipe.work, job.work);
      progress.setAttribute('aria-label', 'Craft work completed');
      add(body, 'p', `${Math.min(100, Math.floor(job.work / recipe.work * 100))}% · ${job.phase === 'return' ? 'Delivering finished work' : craftStage(recipe, job.work)}`);
      add(body, 'p', `Resident: ${worker?.name || 'Waiting for a qualified resident'}`);
      add(body, 'p', `Workspace: ${workspaceName(s.projects.find(p => p.id === job.site))}`);
      if (job.phase === 'return') add(footer, 'p', 'Finished work is being delivered and cannot move to another workspace.');
      else {
        const sites = craftWorkspaces(s, recipe).filter(p => p.id !== job.site && s.infrastructure.nodes[p.id]?.enabled !== false
          && !s.operations.some(o => o !== job && !o.done && !o.water && o.site === p.id));
        if (sites.length) {
          const select = workspaceSelect(body, sites, ui.sites.get(`job-${id}`), `move-${id}`, 'Move to workspace');
          select.onchange = () => {ui.sites.set(`job-${id}`, Number(select.value));};
          button(footer, 'Move unfinished job', 'move-job', () => {
            const error = moveCraftJob(s, job.id, Number(select.value));
            announce(error || 'Job moved. Residents will collect the materials again when the village resumes.');
            refresh(); redraw();
          });
        } else add(footer, 'p', 'No other free, enabled workspace is available for this job.');
      }
    } else {
      if (recipe.equipmentRepair) {
        const equipment = equipmentSummary(s, recipe.equipmentRepair);
        add(body, 'p', `${equipment.owned} owned · ${equipment.broken} broken · ${Math.round(Math.max(0, 1 - equipment.wear / (equipment.owned * EQUIPMENT_LIFE)) * 100)}% overall condition`);
        if (equipment.borrowers.length) add(body, 'p', `In use by ${equipment.borrowers.join(', ')}. Return borrowed tools before repairing.`);
        if (!equipment.wear) add(body, 'p', 'In good condition. No repair needed.');
      }
      add(body, 'h4', 'Materials');
      const materials = add(body, 'dl', '', 'craft-materials');
      for (const [key, n] of Object.entries(recipe.input)) {
        add(materials, 'dt', MATERIALS[key].name.charAt(0).toUpperCase() + MATERIALS[key].name.slice(1));
        const have = materialCount(s, key);
        add(materials, 'dd', `${quantityText(key, n)} needed · ${quantityText(key, have)} available`, have < n ? 'craft-shortage' : '');
      }
      const sites = craftWorkspaces(s, recipe), site = chosenWorkspace(s, recipe, ui.sites.get(id));
      const select = workspaceSelect(body, sites, site?.id, `workspace-${id}`, 'Workspace');
      select.onchange = () => {ui.sites.set(id, Number(select.value)); redraw();};
      const qualified = s.people.filter(r => skillLevel(r, rule.skill) >= rule.level);
      add(body, 'p', `Qualified residents: ${qualified.map(r => r.name).join(', ') || 'No one yet'}`, 'craft-note');
      add(body, 'p', `About ${Math.ceil(recipe.work * .45 / (.75 + rule.level * .15))} game minutes of active work; collecting and delivery take extra time.`, 'craft-note');
      const more = add(body, 'details', '', 'craft-method');
      more.open = ui.expanded.has(recipeId);
      const summary = add(more, 'summary', 'Skills & how it’s made');
      summary.dataset.craftFocus = 'method';
      more.ontoggle = () => {if (more.open) ui.expanded.add(recipeId); else ui.expanded.delete(recipeId);};
      if (!recipe.equipmentRepair) add(more, 'p', ITEMS[craftItem(recipe)]?.description || '');
      add(more, 'p', `${CRAFT_SKILLS[rule.skill]} level ${rule.level}+${rule.tool ? ` · ${ITEMS[rule.tool].name} required` : ''}. Hand work; no electricity needed.`);
      const stages = add(more, 'ol');
      for (const stage of rule.stages) add(stages, 'li', stage);
      add(more, 'p', s.people.map(r => `${r.name}: level ${skillLevel(r, rule.skill)}`).join(' · '));
      add(more, 'p', 'Residents gain skill through active work, not walking or waiting. Levels: beginner, practiced, skilled, experienced.');
      const blocker = recipeStatus(s, recipeId, site);
      const reason = add(footer, 'p', blocker || 'Materials will be reserved when you start this job.', 'craft-readiness');
      reason.id = 'craft-readiness';
      const start = button(footer, recipe.equipmentRepair ? 'Start repair' : 'Make this item', 'start-job', () => {
        const error = queueProduction(s, site?.id, recipeId);
        if (error) {announce(error); redraw(); return;}
        ui.section = 'jobs'; ui.selected.jobs = String(s.operations.at(-1).id);
        announce('Job planned. Materials reserved; a qualified resident can begin after you close this dialog and resume the village.');
        refresh(); redraw();
        root.querySelector(`[data-craft-focus="entry-${ui.selected.jobs}"]`)?.focus({preventScroll: true});
      });
      start.disabled = !!blocker;
      start.dataset.disabledReason = blocker;
      start.setAttribute('aria-describedby', reason.id);
    }
  }
  const message = add(root, 'p', ui.message, 'craft-message');
  message.setAttribute('role', 'status');
  const scroll = ui.scroll[ui.section] || [0, 0];
  list.scrollTop = scroll[0]; body.scrollTop = scroll[1];
  if (focus) [...root.querySelectorAll('[data-craft-focus]')].find(el => el.dataset.craftFocus === focus)?.focus({preventScroll: true});
}

function workspaceSelect(parent, sites, chosen, key, title) {
  const label = add(parent, 'label', title, 'craft-workspace');
  const select = add(label, 'select');
  select.setAttribute('aria-label', title);
  select.dataset.craftFocus = key;
  if (!sites.length) select.add(new Option('No completed workspace', ''));
  for (const site of sites) select.add(new Option(workspaceName(site), String(site.id)));
  if (sites.some(p => p.id === chosen)) select.value = String(chosen);
  select.disabled = !sites.length;
  select.dataset.disabledReason = 'Complete a suitable workspace before assigning this job.';
  return select;
}
