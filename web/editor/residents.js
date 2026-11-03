import {revealWorkspaceSection} from './workspaces.js';
import {openingFields,ensureStart,clearStart} from './arrival.js';
import {removeResident} from './roster.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Scenarios choose existing authored friends; they do not create new people.
export class ResidentsEditor{
 constructor(host,{presets,occupations,change,source,catalog,placeStart,locateStart}){
  Object.assign(this,{host,presets,occupations,change,source,catalog});
  host.addEventListener('click',event=>{
   const button=event.target.closest('[data-bring-friend],[data-remove-resident],[data-start-action],[data-remove-start]');if(!button)return;
   const id=button.dataset.bringFriend??button.dataset.removeStart??button.closest('[data-resident]')?.dataset.resident;
   if(button.hasAttribute('data-bring-friend')){const friend=presets.find(p=>p.id===id);if(!friend)return;change('Bring '+friend.name,d=>{d.start.residents??=structuredClone(presets);if(!d.start.residents.some(p=>p.id===id))d.start.residents.push(structuredClone(friend));});return;}
   if(button.hasAttribute('data-remove-resident')){change('Remove friend from arrival',d=>removeResident(d,presets,id));return;}
   if(button.hasAttribute('data-remove-start')){change('Remove unavailable resident setup',d=>{d.start.resident_setup=(d.start.resident_setup??[]).filter(s=>s.resident!==id);});return;}
   const action=button.dataset.startAction;
   if(action==='place'){placeStart(id);return;}
   if(action==='locate'){const position=source().start.resident_setup?.find(s=>s.resident===id)?.position;if(position)locateStart(id,position);return;}
   change('Reset arrival circumstances',d=>clearStart(d,id,action==='needs'?'needs':'position'));
  });
  host.addEventListener('change',event=>{
   const id=event.target.closest('[data-resident]')?.dataset.resident;if(!id)return;
   const field=event.target.dataset.residentStart;
   if(field){const value=Number(event.target.value);change('Set arrival circumstances',d=>{const person=(d.start.residents??presets).find(p=>p.id===id);if(!person)return;const setup=ensureStart(d,id);if(['x','y'].includes(field)){setup.position??=[...d.map.camp];setup.position[field==='x'?0:1]=value;}else{setup.needs??=structuredClone(catalog.resident_start_defaults[person.preset]);setup.needs[field]=value;}});}
   else if(event.target.hasAttribute('data-outside-shifts'))change('Set outside-job participation',d=>{d.start.residents??=structuredClone(presets);const person=d.start.residents.find(p=>p.id===id);if(person)person.outside_shifts=event.target.checked;});
  });
 }
 openArrival(id){revealWorkspaceSection(this.host);const section=[...this.host.querySelectorAll('details[data-resident]')].find(el=>el.dataset.resident===id);if(section){this.host.closest('details').open=true;section.open=true;section.scrollIntoView({block:'nearest'});}}
 render(definition,report){
  const people=definition.start.residents??this.presets,signature=JSON.stringify([people,definition.start.resident_setup,report?.issues.filter(i=>i.path.startsWith('start.resident_setup'))]);if(signature===this.signature)return;this.signature=signature;
  const open=new Set([...this.host.querySelectorAll('details[open]')].map(el=>el.dataset.resident));
  const available=this.presets.filter(p=>!people.some(person=>person.id===p.id));
  const unknown=(definition.start.resident_setup??[]).filter(s=>!people.some(p=>p.id===s.resident));
  this.host.innerHTML='<p>Choose which friends arrive. Each has their own established appearance, personality, skills and routine.</p>'+(available.length?`<div class="creator-roster-actions">${available.map(p=>`<button type="button" data-bring-friend="${escape(p.id)}">Bring ${escape(p.name)}</button>`).join('')}</div>`:'')+`<p>${people.length} friends arriving${definition.rules.mode==='story'?' · Official Story needs all five founding roles.':'.'}</p>`+unknown.map(s=>`<p>An unavailable friend has a starting setup. <button data-remove-start="${escape(s.resident)}">Clear setup</button></p>`).join('')+people.map(person=>{
   const job=this.occupations.find(j=>j.key===person.occupation);
   return `<details data-resident="${escape(person.id)}" ${open.has(person.id)?'open':''}><summary>${escape(person.name)}</summary>${person.biography?`<p>${escape(person.biography)}</p>`:''}${job&&job.key!=='none'?`<p>${escape(job.title)} · ${escape(job.description)}</p><label class="creator-rule"><input type="checkbox" data-outside-shifts ${person.outside_shifts?'checked':''}> Take outside shifts · 09:00–17:00</label>`:''}${openingFields(person,definition,this.catalog,report)}<button type="button" data-remove-resident>Remove from arrival</button></details>`;
  }).join('');
 }
}
