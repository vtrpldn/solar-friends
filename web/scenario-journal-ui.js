import {renderJournalChapter,journalEventStatus,renderStoryMessage} from './scenario-journal-copy.js';
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
export function renderScenarioJournal(report,{title,page,open,onAction,onRestart,onContinue,replace,residents=[],avatar=()=>''}){
 if(!original)original=['#journal-title','#quest-dialog .eyebrow','#quest-dialog .journal-intro','#quest-dialog .hint'].map(selector=>[selector,$(selector).textContent]);
 if(!installed){$('#quest-list').addEventListener('click',async event=>{const button=event.target.closest('[data-scenario-action]'),action=button&&actions[Number(button.dataset.scenarioAction)];if(!action||button.disabled)return;button.disabled=true;try{await dispatch?.(action);}finally{button.disabled=false;}});installed=true;}
 dispatch=payload=>{if(payload.challenge==='restart')return onRestart?.();if(payload.challenge==='continue')return onContinue?.();return onAction(payload);};actions=[];
 const challenge=report.challenge,failed=challenge?.status==='failed',unrestricted=challenge?.status==='unrestricted',complete=report.finished_at!==null&&!unrestricted,activeIndex=report.chapters.findIndex(c=>c.completed_at===null),active=report.chapters[activeIndex<0?report.chapters.length-1:activeIndex];
 const selected=report.chapters[page]??active,index=report.chapters.indexOf(selected),required=active.goals.filter(g=>!g.optional),done=required.filter(g=>g.status==='complete').length,next=required.find(g=>g.status==='active');
 $('#quest-dialog').dataset.authoredJournal='true';$('#journal-title').textContent=title;$('#quest-dialog .eyebrow').textContent='OUR VILLAGE STORY';$('#quest-dialog .journal-intro').textContent=report.introduction;
 $('#quest-dialog .hint').textContent='The village pauses while you read. Goals and events observe village activity while time runs. Completed goals stay credited; village life continues after the final chapter.';
 $('#quest-total').textContent=`${report.chapters.filter(c=>c.completed_at!==null).length} of ${report.chapters.length} chapters complete`;
 $('#goal-label').textContent=failed?'Challenge deadline missed':unrestricted?'Free continuation':complete?'Our story fulfilled':active.title;$('#goal-next').textContent=failed?challenge.failure_message:unrestricted?'Original challenge failed · keep shaping this village':complete?report.completion:next?.title??'Let village life unfold';$('#goal-shortcut').title=complete?report.completion:active.description;$('#goal-shortcut').onclick=open;
 $('#goal-meter').max=Math.max(1,required.length);$('#goal-meter').value=done;$('#goal-meter').setAttribute('aria-label',`${active.title}: ${done} of ${required.length} required goals complete`);$('#goal-action').hidden=true;
 replace($('#journal-chapters'),report.chapters.map((c,i)=>`<button data-chapter="${i}" aria-pressed="${i===index}"><span class="chapter-number">${c.completed_at!==null?'✓':i+1}</span><span><b>${escape(c.title)}</b><small>${c.completed_at!==null?'Complete':c.goals.some(g=>g.status==='active')?'In progress':'Upcoming'}</small></span></button>`).join(''));
 const actionButton=(action,credited)=>{
  if(!action)return '';
  const slot=actions.push({action,credited})-1,name=action.kind==='build'?(credited?'Review buildings':`Build ${allBuildingArt[action.building]?.name??action.building}`):action.kind==='housing'?'Review homes':action.kind==='water'?'Review water & sanitation':action.kind==='power'?'Review Power':action.kind==='supplies'?'Review food reserves':action.kind==='people'?(Number.isInteger(action.resident)?'Check on this friend':'Meet our friends'):action.kind==='operation'?'Review this building':action.kind==='cultivation'?'Visit this plot':action.kind==='land'?'Review land & materials':action.kind==='trade'?'Open Trade':action.kind==='production'?'Review production':action.kind==='delivery'?'Review local deliveries':'View goal';
  return `<button type="button" data-scenario-action="${slot}">${escape(name)}</button>`;
 };
 const speakerHeader=event=>{
  if(event.effect.kind!=='message'||event.status!=='applied'||!event.speaker)return '';
  const person=residents.find(p=>p.id===event.speaker.resident);if(!person)return '<p>Story speaker unavailable.</p>';
  const role=report.roles?.find(r=>r.id===event.speaker.role),slot=actions.push({action:{kind:'people',resident:person.id},credited:false})-1;
  return `<button class="scenario-speaker" data-scenario-action="${slot}" aria-label="Meet ${escape(person.name)}">${avatar(person.id)}<span><b>${escape(person.name)}</b>${role?`<small>${escape(role.title)}</small>`:''}</span></button>`;
 };
 const storyEvents=(report.events??[]).length?`<section class="scenario-story-events"><h3>Moments in our story</h3>${report.events.map(event=>`<article>${speakerHeader(event)}<h4>${escape(event.title)}</h4><small>${escape(journalEventStatus(event))}</small>${event.status==='applied'&&event.effect.kind==='message'?renderStoryMessage(event):event.effect.kind==='grant_funds'&&event.status!=='watching'?`<p>${event.status==='applied'?'Shared funding received':'Shared funding queued'} · ${escape(quantity(event.effect.cents,'cents'))}</p>`:event.effect.kind==='deliver_supplies'&&event.status!=='watching'?`<p>${event.status==='applied'?'Supplies received':'Supplies queued'} · ${escape(event.effect.count)} ${escape(event.effect.material.replaceAll('_',' '))} · ${escape(event.effect.building?`${allBuildingArt[event.destination?.kind]?.name??'Starting building'} · (${event.destination?.x}, ${event.destination?.y})${event.destination?.missing?' · removed':''}`:'Arrival store')}</p>${event.delivery_blocker?`<p>${escape(event.delivery_blocker)}</p>`:''}`:event.effect.kind==='unlock_building'&&event.status==='applied'?`<p>Construction unlocked · ${escape(allBuildingArt[event.effect.building]?.name??event.effect.building)}</p>`:''}</article>`).join('')}</section>`:'';
 const challengePanel=challenge?`<section class="quest-card scenario-challenge" data-challenge-status="${challenge.status}"><h3>${failed?'Challenge deadline missed':unrestricted?'Free continuation':complete?'Challenge completed':'Timed challenge'}</h3><p>Deadline: ${escape(date(challenge.deadline))}. ${failed?escape(challenge.failure_message):unrestricted?'The original challenge remains failed. All building locks are released and Sandbox rules can be changed. Completing goals here does not complete the original challenge.':complete?'You met the challenge. Village life can continue.':'Complete the required chapters by this time. Pauses add no time.'}</p>${failed?(()=>{const restart=actions.push({challenge:'restart'})-1,freely=actions.push({challenge:'continue'})-1;return `<div class="dialog-actions"><button data-scenario-action="${restart}">Restart challenge</button><button data-scenario-action="${freely}">Continue freely</button></div>`;})():''}</section>`:'';
 replace($('#quest-list'),`${challengePanel}${renderJournalChapter(report,index,{actionButton})}${storyEvents}`);
 return index;
}
