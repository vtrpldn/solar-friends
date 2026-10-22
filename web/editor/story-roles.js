const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderStoryRoles(d,report,{catalog,field,select,open=false}){
 const roles=d.journal.roles??[],people=d.start.residents??catalog.resident_presets;
 const friends=people.map(p=>[p.id,p.name]);
 return `<details data-story-roles ${open?'open':''}><summary>Story roles · ${roles.length}</summary><p>Assign responsibilities to these founding friends. Roles do not force work or grant skills. One friend can hold several roles. Removing a friend named in a role leaves that role for you to repair.</p>${roles.map((role,i)=>{
  const path=`roles.${i}`,binding=role.binding,resolved=report?.ok?report.roles?.find(r=>r.id===role.id)?.resolved:null,name=people.find(p=>p.id===resolved?.source_resident)?.name;
  let form=field(path+'.title','Role title',role.title,{max:catalog.journal.roles.maximum_title})+select(path+'.binding.kind','Choose this role by',binding.kind,[['resident','A particular friend'],['capability','Starting skill']]);
  if(binding.kind==='resident'){const options=[['','Choose a friend'],...friends];if(binding.resident&&!people.some(p=>p.id===binding.resident))options.push([binding.resident,'Missing friend · choose another']);form+=select(path+'.binding.resident','Assigned friend',binding.resident,options);}
  else form+=select(path+'.binding.skill','Starting skill',binding.skill,catalog.journal.roles.skills.map(s=>[s.key,s.name]))+field(path+'.binding.minimum_level','Minimum starting level',binding.minimum_level,{type:'number',min:1,max:5,step:1})+'<p>Requires resident learning. Chooses the highest declared starting level, with a consistent choice when levels tie. This assignment stays fixed during play; future learning does not qualify a missing role.</p>';
  return `<fieldset data-story-role="${escape(role.id)}"><legend>${escape(role.title)}</legend>${form}<p data-role-resolution>${name?`Assigned to ${escape(name)}`:'Resolve the draft issues to see the assigned friend.'}</p><button data-role-action="remove" data-role="${escape(role.id)}">Remove role</button></fieldset>`;
 }).join('')}<button data-role-action="add" ${roles.length>=catalog.journal.roles.maximum?'disabled':''}>Add story role</button></details>`;
}
export function speakerOptions(d,catalog,speaker){
 const people=d.start.residents??catalog.resident_presets,options=[['','Village narration'],...people.map(p=>['resident:'+p.id,p.name]),...(d.journal.roles??[]).map(r=>['role:'+r.id,'Role · '+r.title])],value=speaker?`${speaker.kind}:${speaker[speaker.kind]}`:'';
 if(value&&!options.some(([id])=>id===value))options.push([value,'Missing speaker · choose a friend or role']);
 return {options,value};
}
