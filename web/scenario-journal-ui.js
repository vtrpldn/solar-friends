import {allBuildingArt} from './building-art.js?v=night-1';
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=selector=>document.querySelector(selector);
const date=minute=>`Day ${Math.floor(minute/1440)+1} · ${String(Math.floor(minute%1440/60)).padStart(2,'0')}:${String(Math.floor(minute%60)).padStart(2,'0')}`;
const quantity=(n,unit)=>unit==='cents'?`R$ ${(n/100).toFixed(2)}`:unit==='minutes'?date(n):unit==='duration_minutes'?`${Number(n).toLocaleString(undefined,{maximumFractionDigits:1})} min`:Number(n).toLocaleString(undefined,{maximumFractionDigits:1});
let original=null,actions=[],dispatch=null,installed=false;
export function resetScenarioJournalUI(){
 if(!original)return;
 for(const [selector,text]of original)$(selector).textContent=text;
 $('#quest-dialog').removeAttribute('data-authored-journal');actions=[];dispatch=null;
}
export function renderScenarioJournal(report,{title,page,open,onAction,replace}){
 if(!original)original=['#journal-title','#quest-dialog .eyebrow','#quest-dialog .journal-intro','#quest-dialog .hint'].map(selector=>[selector,$(selector).textContent]);
 if(!installed){$('#quest-list').addEventListener('click',event=>{const button=event.target.closest('[data-scenario-action]');if(button&&actions[Number(button.dataset.scenarioAction)])dispatch?.(actions[Number(button.dataset.scenarioAction)]);});installed=true;}
 dispatch=onAction;actions=[];
 const complete=report.finished_at!==null,activeIndex=report.chapters.findIndex(c=>c.completed_at===null),active=report.chapters[activeIndex<0?report.chapters.length-1:activeIndex];
 const selected=report.chapters[page]??active,index=report.chapters.indexOf(selected),required=active.goals.filter(g=>!g.optional),done=required.filter(g=>g.status==='complete').length,next=required.find(g=>g.status==='active');
 $('#quest-dialog').dataset.authoredJournal='true';$('#journal-title').textContent=title;$('#quest-dialog .eyebrow').textContent='OUR VILLAGE STORY';$('#quest-dialog .journal-intro').textContent=report.introduction;
 $('#quest-dialog .hint').textContent='The village pauses while you read. Goals observe village activity while time runs. Completed goals stay credited; village life continues after the final chapter.';
 $('#quest-total').textContent=`${report.chapters.filter(c=>c.completed_at!==null).length} of ${report.chapters.length} chapters complete`;
 $('#goal-label').textContent=complete?'Our story fulfilled':active.title;$('#goal-next').textContent=complete?report.completion:next?.title??'Let village life unfold';$('#goal-shortcut').title=complete?report.completion:active.description;$('#goal-shortcut').onclick=open;
 $('#goal-meter').max=Math.max(1,required.length);$('#goal-meter').value=done;$('#goal-meter').setAttribute('aria-label',`${active.title}: ${done} of ${required.length} required goals complete`);$('#goal-action').hidden=true;
 replace($('#journal-chapters'),report.chapters.map((c,i)=>`<button data-chapter="${i}" aria-pressed="${i===index}"><span class="chapter-number">${c.completed_at!==null?'✓':i+1}</span><span><b>${escape(c.title)}</b><small>${c.completed_at!==null?'Complete':c.goals.some(g=>g.status==='active')?'In progress':'Upcoming'}</small></span></button>`).join(''));
 const actionButton=(action,credited)=>{
  if(!action)return '';
  const slot=actions.push({action,credited})-1,name=action.kind==='build'?(credited?'Review buildings':`Build ${allBuildingArt[action.building]?.name??action.building}`):action.kind==='trade'?'Open Trade':action.kind==='production'?'Review production':'View goal';
  return `<button type="button" data-scenario-action="${slot}">${escape(name)}</button>`;
 };
 const condition=(c,credited)=>{
  if(!c)return '<li>This goal begins with its chapter.</li>';
  if(c.conditions)return `<li class="scenario-condition-group"><b>${c.kind==='all'?'All of these':'Any of these'}</b><ul>${c.conditions.map(child=>condition(child,credited)).join('')}</ul></li>`;
  let description=c.description;if(c.action?.building)description=description.replaceAll(c.action.building,allBuildingArt[c.action.building]?.name??c.action.building);
  return `<li class="${credited||c.complete?'done':''}"><span>${escape(description)}</span>${typeof c.value==='number'?`<small>${escape(quantity(c.value,c.unit))} / ${escape(quantity(c.target,c.unit))}</small>`:''}${c.note?`<small>${escape(c.note)}</small>`:''}${actionButton(c.action,credited)}</li>`;
 };
 replace($('#quest-list'),`<article class="quest-card ${selected.completed_at!==null?'complete':''}"><span class="eyebrow">CHAPTER ${index+1} OF ${report.chapters.length}</span><h3>${escape(selected.title)}</h3><p>${escape(selected.description)}</p>${selected.goals.map(goal=>`<section class="scenario-journal-goal ${goal.status}" data-scenario-goal="${escape(goal.id)}"><h4>${goal.status==='complete'?'✓ ':''}${escape(goal.title)}${goal.optional?' <small>Optional</small>':''}</h4><p>${escape(goal.description)}</p><small>${goal.status==='complete'?'Completed':goal.status==='active'?'In progress':'Upcoming'}</small><ul>${condition(goal.condition,goal.status==='complete')}</ul></section>`).join('')}${complete?`<p class="scenario-completion">${escape(report.completion)}</p>`:''}</article>`);
 return index;
}
