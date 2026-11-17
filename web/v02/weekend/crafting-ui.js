import { disabledReason } from './disabled-info.js';
import { CRAFT_SKILLS, skillLevel, craftingBlocker, craftStage } from './crafting.js';
import { PROJECTS, PROCESSES, MATERIALS, materialCount, queueProduction, moveCraftJob } from './simulation.js';
import { equipmentSummary } from './equipment.js';
import { ITEMS } from './items.js';
const chosenSites=new Map();
export function renderCrafting(s,root,notify,refresh) {
 root.replaceChildren();
 const add=(parent,tag,text)=>{const el=document.createElement(tag);el.textContent=text;parent.append(el);return el;};
 add(root,'h3','Resident skills');
 const crew=add(root,'div','');crew.className='crafting-crew';
 for(const r of s.people) {
  const card=add(crew,'article','');add(card,'strong',r.name);
  add(card,'p',Object.entries(CRAFT_SKILLS).map(([id,name])=>`${name} ${skillLevel(r,id)}`).join(' · '));
 }
 add(root,'p','Levels: 0 beginner · 1 practiced · 2 skilled · 3 experienced. Practice thresholds are 18, 108 and 360 game hours. Active craft work builds skill; walking, waiting and resting do not. Shared tools are borrowed while working.');
 add(root,'h3','Craft and repair');
 const list=add(root,'div','');list.className='crafting-recipes';
 for(const [id,recipe] of Object.entries(PROCESSES).filter(([,d])=>d.craft)) {
  const rule=recipe.craft, card=add(list,'article','');card.className='crafting-recipe';
  add(card,'h4',recipe.name);
  const building=rule.kind==='supply-5'?'Timber workbench':'Workshop';
  add(card,'p',`${building} · ${CRAFT_SKILLS[rule.skill]} ${rule.level}+${rule.tool?` · ${ITEMS[rule.tool].name}`:''} · Hand work, no electricity required`);
  add(card,'p',Object.entries(recipe.input).map(([key,n])=>`${n} ${MATERIALS[key].name} (${materialCount(s,key)} available)`).join(' + '));
  add(card,'p',`${rule.stages.join(' → ')}. About ${Math.ceil(recipe.work*.45/(.75+rule.level*.15))} game minutes of active work at the required skill; collecting and delivering take additional time.`);
  const sites=s.projects.filter(p=>PROJECTS[p.key]?.kind===rule.kind&&p.work>=PROJECTS[p.key].work);
  const select=add(card,'select','');select.setAttribute('aria-label',`Workspace for ${recipe.name}`);
  for(const p of sites)select.add(new Option(`${PROJECTS[p.key].name} #${p.id}`,p.id));
  if(sites.some(p=>p.id===chosenSites.get(id)))select.value=chosenSites.get(id);
  select.onchange=()=>{chosenSites.set(id,Number(select.value));refresh();};
  const site=sites.find(p=>p.id===Number(select.value));select.disabled=!sites.length;disabledReason(select,`Build a completed ${building.toLowerCase()} to choose a workspace.`);
  const jobs=(s.operations||[]).filter(o=>!o.done&&o.recipe===id);
  for(const job of jobs) {
   const worker=s.people.find(r=>r.operation===job.id), progress=Math.min(100,Math.floor(job.work/recipe.work*100));
   if(site && job.site!==site.id && job.phase!=='return') {const move=add(card,'button','Move job to selected workspace');move.onclick=()=>{notify(moveCraftJob(s,job.id,site.id)||'Crafting workspace updated; materials will be collected again.');refresh();};}
   add(card,'p',`${worker?.name||'Awaiting resident'} · ${job.phase==='return'?'Delivering finished work':job.status||craftStage(recipe,job.work)} · ${progress}%`);
  }
  const missing=Object.entries(recipe.input).filter(([key,n])=>materialCount(s,key)<n);
  let blocker=!site?`Build a completed ${building.toLowerCase()} first.`:!s.infrastructure.nodes[site.id]?.enabled?'Workspace is switched off.':craftingBlocker(s,recipe);
  if(!blocker&&recipe.equipmentRepair&&equipmentSummary(s,recipe.equipmentRepair).borrowers.length)blocker='Return borrowed equipment before repairing it.';
  if(!blocker&&recipe.equipmentRepair&&equipmentSummary(s,recipe.equipmentRepair).wear<=0)blocker='No repair needed.';
  if(!blocker&&missing.length)blocker=`Missing ${missing.map(([key,n])=>`${n-materialCount(s,key)} ${MATERIALS[key].name}`).join(', ')}.`;
  if(!blocker&&s.operations?.some(o=>!o.done&&o.site===site.id&&!o.water))blocker='Workspace already has a job.';
  const button=add(card,'button',recipe.equipmentRepair?'Queue repair':'Queue craft');button.disabled=!!blocker;disabledReason(button,blocker);
  button.onclick=()=>{notify(queueProduction(s,site.id,id)||'Craft queued. A qualified resident will collect the materials and begin work.');refresh();};
  add(card,'p',blocker||`Ready. Qualified residents: ${s.people.filter(r=>skillLevel(r,rule.skill)>=rule.level).map(r=>r.name).join(', ')}.`);
 }
}
