const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hobbies=[['nature_walk','Nature walks'],['birdwatch','Birdwatching'],['stretch','Stretching'],['daydream','Daydreaming']];
const time=minutes=>`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
export class ResidentsEditor{
  constructor(host,{presets,occupations,personality,change}){
    this.host=host;this.presets=presets;this.occupations=occupations;this.personality=personality;
    host.addEventListener('change',event=>{
      const field=event.target.dataset.residentField,identity=event.target.closest('[data-resident]')?.dataset.resident;
      if(!field||!identity)return;
      let value=field==='outside_shifts'?event.target.checked:event.target.value;
      if(field==='preferred_bedtime'){const [h,m]=value.split(':').map(Number);value=h*60+m;}
      change('Change a founding resident',definition=>{
        definition.start.residents??=structuredClone(this.presets);
        const person=definition.start.residents.find(p=>p.id===identity);if(!person)return;
        if(['preferred_bedtime','favourite_hobby','alternate_hobby'].includes(field))person.routine_preferences[field]=value;
        else if(['social_style','work_interest'].includes(field)){person.personality??=structuredClone(this.personality.founders.find(p=>p.preset===person.preset)?.profile??this.personality.founders[0].profile);person.personality[field]=value;}
        else {person[field]=value;if(field==='occupation'&&value==='none')person.outside_shifts=false;}
      });
    });
  }
  render(definition){
    const people=definition.start.residents??this.presets;
    const signature=JSON.stringify(people);if(signature===this.signature)return;this.signature=signature;
    const open=new Set([...this.host.querySelectorAll('details[open]')].map(el=>el.dataset.resident));
    this.host.innerHTML=people.map(person=>{
      const p=person.routine_preferences;
      const profile=person.personality??this.personality.founders.find(p=>p.preset===person.preset)?.profile??this.personality.founders[0].profile;
      const personalityField=(field,title,catalog)=>`<label class="creator-field">${title}<select data-resident-field="${field}">${catalog.map(item=>`<option value="${item.key}" ${profile[field]===item.key?'selected':''}>${escape(item.name)}</option>`).join('')}</select></label><p>${escape(catalog.find(item=>item.key===profile[field])?.description??'')}</p>`;
      const personalityControls=personalityField('social_style','Social style',this.personality.social_styles)+personalityField('work_interest','Favourite community work',this.personality.interests);

      const occupation=person.occupation??this.presets.find(p=>p.preset===person.preset)?.occupation??'none';
      const job=this.occupations.find(j=>j.key===occupation);
      const occupationControls=`<label class="creator-field">Outside occupation<select data-resident-field="occupation">${this.occupations.map(j=>`<option value="${j.key}" ${j.key===occupation?'selected':''}>${escape(j.title)}</option>`).join('')}</select></label><p>${escape(job?.description??'')}${job?.income?` R$ ${job.income/100} per completed shift.`:''}</p><label class="creator-field"><span><input type="checkbox" data-resident-field="outside_shifts" ${person.outside_shifts?'checked':''} ${occupation==='none'?'disabled':''}> Take outside shifts · 09:00–17:00</span></label>`;
      const text=(field,label,max,multiline=false)=>`<label class="creator-field">${label}${multiline?`<textarea rows="3" maxlength="${max}" data-resident-field="${field}">${escape(person[field])}</textarea>`:`<input type="text" maxlength="${max}" data-resident-field="${field}" value="${escape(person[field])}">`}</label>`;
      const hobby=(field,label)=>`<label class="creator-field">${label}<select data-resident-field="${field}">${hobbies.map(([key,name])=>`<option value="${key}" ${p[field]===key?'selected':''}>${name}</option>`).join('')}</select></label>`;
      return `<details data-resident="${escape(person.id)}" ${open.has(person.id)?'open':''}><summary>${escape(person.name||'Unnamed neighbour')}</summary>${text('name','Name',80)}${text('pronouns','Pronouns · optional',40)}${text('biography','Their story · optional',600,true)}<label class="creator-field">Usual bedtime<input type="time" min="20:00" max="23:30" step="900" data-resident-field="preferred_bedtime" value="${time(p.preferred_bedtime)}"></label>${personalityControls}${hobby('favourite_hobby','Favourite pastime')}${hobby('alternate_hobby','Another pastime')}${occupationControls}</details>`;
    }).join('');
  }
}
