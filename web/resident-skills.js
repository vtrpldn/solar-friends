const ranks=['Starting out','Practising','Steady','Confident','Experienced','Seasoned'];
export function renderResidentSkills(root,state,id,escape){
  const report=state.environment.skills,person=report?.people.find(p=>p.id===id);
  if(!person)return;
  const key=JSON.stringify([person,report.enabled,state.village.mode]);
  if(root.dataset.skills===key)return;root.dataset.skills=key;
  root.innerHTML=`<p>Useful completed work builds experience. Rest and hobbies never reduce it. Daily practice is limited; everyone can still help.</p><div class="skill-pages">${person.skills.map((s,i)=>`<div class="skill-entry"><span><b>${escape(s.name)}</b><small>${ranks[s.level]} · ${s.bonus_percent?`${s.bonus_percent}% faster ${i===1?'loaded walking':'work'}`:'Usual pace'}</small></span><span class="skill-pips" aria-label="${escape(s.name)} level ${s.level} of 5">${Array.from({length:5},(_,n)=>`<i class="${n<s.level?'earned':''}"></i>`).join('')}</span><progress max="${s.next||160}" value="${s.experience}" aria-label="${escape(s.name)} experience"></progress><small>${s.next?(s.enough_today?'Enough practice for today':`${s.experience} / ${s.next} practice towards the next step`):'Fully practised · experience stays bounded'}</small></div>`).join('')}</div><small>${report.enabled?`Learning is active. Maximum benefit: ${report.maximum_bonus}%.`:'Learning and its benefits are paused; earned experience is kept.'}</small>`;
}
