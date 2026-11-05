import {allBuildingArt} from './building-art.js?v=night-1';
export const escapeJournal=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const journalDate=minute=>`Day ${Math.floor(minute/1440)+1} · ${String(Math.floor(minute%1440/60)).padStart(2,'0')}:${String(Math.floor(minute%60)).padStart(2,'0')}`;
export const journalQuantity=(n,unit)=>unit==='cents'?`R$ ${(n/100).toFixed(2)}`:unit==='minutes'?journalDate(n):unit==='duration_minutes'?`${Number(n).toLocaleString(undefined,{maximumFractionDigits:1})} min`:Number(n).toLocaleString(undefined,{maximumFractionDigits:1});
const escape=escapeJournal,date=journalDate,quantity=journalQuantity;
export function renderJournalCondition(c,credited=false,{actionButton=()=>''}={}){
  if(!c)return '<li>This goal begins with its chapter.</li>';
  if(c.conditions)return `<li class="scenario-condition-group"><b>${c.kind==='all'?'All of these':'Any of these'}</b><ul>${c.conditions.map(child=>renderJournalCondition(child,credited,{actionButton})).join('')}</ul></li>`;
  let description=c.description;if(c.action?.building&&!['crops','orchards','livestock'].includes(c.kind))description=description.replace(c.action.building,allBuildingArt[c.action.building]?.name??c.action.building);
  // Maintained outcomes remain live after the goal is earned. Describe the
  // later streak without presenting it as unfinished or overflowing credit.
  const progress=typeof c.value!=='number'?'':credited&&c.kind==='maintain'
    ?`Goal completed earlier · ${quantity(c.target,c.unit)} required · current streak: ${quantity(c.value,c.unit)}`
    :`${quantity(c.value,c.unit)} / ${quantity(c.target,c.unit)}`;
  return `<li class="${credited||c.complete?'done':''}"><span>${escape(description)}</span>${progress?`<small>${escape(progress)}</small>`:''}${c.service?`<small>${c.service.frozen?'Final':'Latest'} service observation${c.service.observed_at!==null?` · ${escape(date(c.service.observed_at))}`:''}: ${c.service.value===null?'Waiting for an access check':`${escape(quantity(c.service.value,c.service.unit))} / ${escape(quantity(c.service.minimum,c.service.unit))} · ${c.service.qualifies?'required service available':'required service not yet available'}`}</small><small>${c.service.observation_minutes===0?'Checked every native simulation step.':`Access checks every ${escape(c.service.observation_minutes)} game minutes; known supply losses and layout changes prompt earlier checks.`} Pauses add no time; a failed or late observation restarts the period.</small>`:''}${c.people?`<small>${c.people.observed?`${c.people.frozen?'Final observation':'Latest observation'} · meeting these needs: ${escape(c.people.matching)} / ${escape(c.people.total)}.`:'Waiting for the first simulation observation.'}</small>`:''}${c.note?`<small>${escape(c.note)}</small>`:''}${actionButton(c.action,credited)}</li>`;
 }
export function renderJournalChapter(report,index,{actionButton=()=>''}={}){
 const selected=report.chapters[index],complete=report.finished_at!==null&&report.challenge?.status!=='unrestricted',condition=(c,credited)=>renderJournalCondition(c,credited,{actionButton});
 if(!selected)return '';
 return `<article class="quest-card ${selected.completed_at!==null?'complete':''}"><span class="eyebrow">CHAPTER ${index+1} OF ${report.chapters.length}</span><h3>${escape(selected.title)}</h3><p>${escape(selected.description)}</p>${selected.goals.map(goal=>`<section class="scenario-journal-goal ${goal.status}" data-scenario-goal="${escape(goal.id)}"><h4>${goal.status==='complete'?'✓ ':''}${escape(goal.title)}${goal.optional?' <small>Optional</small>':''}</h4><p>${escape(goal.description)}</p><small>${goal.status==='complete'?'Completed':goal.status==='active'?'In progress':'Upcoming'}</small><ul>${condition(goal.condition,goal.status==='complete')}</ul></section>`).join('')}${complete?`<p class="scenario-completion">${escape(report.completion)}</p>`:''}</article>`;
}
export function journalEventStatus(event){
 return event.status==='applied'?'Happened · '+journalDate(event.applied_at):event.status==='waiting_for_delivery'?'Delivery queued':event.status==='waiting_for_fund_space'?'Queued · waiting for room in the shared fund':'Watching for its moment';
}
export function renderStoryMessage(event){return event.effect?.kind==='message'?`<p>${escape(event.effect.text)}</p>`:'';}
