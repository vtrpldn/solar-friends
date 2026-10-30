import {routeNames} from './routes.js';
import {allBuildingArt} from '../building-art.js?v=night-1';
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const someCondition=(c,predicate)=>!!c&&(predicate(c)||(Array.isArray(c.conditions)&&c.conditions.some(n=>someCondition(n,predicate))));
export function removalImpact(definition,{buildings=[],region=null}={}){
 const ids=new Set(buildings),selected=definition.start.buildings.filter(b=>ids.has(b.id)),entries=[];
 const reference=c=>region?c.region===region:c.kind==='delivered'&&ids.has(c.building);
 const typeUse=c=>!region&&['buildings','operating','livestock'].includes(c.kind)&&selected.some(b=>b.kind===c.building);
 const explain=c=>someCondition(c,reference)?(region?'Its target region will need repair.':'Its delivery destination will need repair.'):someCondition(c,typeUse)?'Uses this building type; recheck its starting progress.':null;
 for(const chapter of definition.journal?.chapters??[])for(const goal of chapter.goals){const reason=explain(goal.condition);if(reason)entries.push({kind:'goal',label:`${chapter.title} / ${goal.title}`,reason});}
 for(const event of definition.journal?.events??[]){const delivery=!region&&event.effect.kind==='deliver_supplies'&&ids.has(event.effect.building),reason=delivery?'Its supply destination will need repair.':explain(event.condition)||explain(event.when?.condition);if(reason)entries.push({kind:'event',label:event.title,reason});}
 if(!region){
  const routes=definition.start.routes??[],affected=new Set(routes.filter(r=>[r.from,r.to].some(e=>e.kind==='building'&&ids.has(e.id))).map(r=>r.id));
  let prior=-1;while(prior!==affected.size){prior=affected.size;for(const r of routes)if([r.from,r.to].some(e=>e.kind==='pump'&&affected.has(e.id)))affected.add(r.id);}
  for(const [i,r]of routes.entries())if(affected.has(r.id))entries.push({kind:'connection',label:`${routeNames[r.kind]??'Utility connection'} ${i+1}`,reason:'Its endpoint or supplying pump will need repair.'});
  for(const allocation of definition.start.inventories??[])if(allocation.owner.kind==='building'&&ids.has(allocation.owner.building))entries.push({kind:'supplies',label:buildingLabel(selected,allocation.owner.building),reason:'Starting food and material allocations will need another location.'});
  for(const allocation of definition.start.liquids??[])if(allocation.owner.kind==='building'&&ids.has(allocation.owner.building))entries.push({kind:'liquids',label:buildingLabel(selected,allocation.owner.building),reason:'Starting liquid allocations will need compatible storage.'});
 }
 return entries;
}
function buildingLabel(buildings,id){const b=buildings.find(b=>b.id===id);return b?`${allBuildingArt[b.kind]?.name??b.kind} · ${b.x}, ${b.y}`:'Removed building';}
export function removalMarkup(definition,target){
 const entries=removalImpact(definition,target);if(!entries.length)return '';
 const names={goal:'Goal',event:'Event',connection:'Connection',supplies:'Supplies',liquids:'Liquids'};
 return `<section class="creator-removal-impact" data-removal-impact><h4>Before removing this ${target.region?'region':target.buildings.length>1?'group':'building'}</h4><p>These references stay in the draft for you to review. Undo restores the removed object; nothing is redirected automatically.</p><ul>${entries.map(e=>`<li><b>${names[e.kind]} · ${escape(e.label)}</b><br>${escape(e.reason)}</li>`).join('')}</ul></section>`;
}
