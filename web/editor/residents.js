const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hobbies=[['nature_walk','Nature walks'],['birdwatch','Birdwatching'],['stretch','Stretching'],['daydream','Daydreaming']];
const time=minutes=>`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
export class ResidentsEditor{
  constructor(host,{presets,change}){
    this.host=host;this.presets=presets;
    host.addEventListener('change',event=>{
      const field=event.target.dataset.residentField,identity=event.target.closest('[data-resident]')?.dataset.resident;
      if(!field||!identity)return;
      let value=event.target.value;
      if(field==='preferred_bedtime'){const [h,m]=value.split(':').map(Number);value=h*60+m;}
      change('Change a founding resident',definition=>{
        definition.start.residents??=structuredClone(this.presets);
        const person=definition.start.residents.find(p=>p.id===identity);if(!person)return;
        if(['preferred_bedtime','favourite_hobby','alternate_hobby'].includes(field))person.routine_preferences[field]=value;
        else person[field]=value;
      });
    });
  }
  render(definition){
    const people=definition.start.residents??this.presets;
    const signature=JSON.stringify(people);if(signature===this.signature)return;this.signature=signature;
    const open=new Set([...this.host.querySelectorAll('details[open]')].map(el=>el.dataset.resident));
    this.host.innerHTML=people.map(person=>{
      const p=person.routine_preferences;
      const text=(field,label,max,multiline=false)=>`<label class="creator-field">${label}${multiline?`<textarea rows="3" maxlength="${max}" data-resident-field="${field}">${escape(person[field])}</textarea>`:`<input type="text" maxlength="${max}" data-resident-field="${field}" value="${escape(person[field])}">`}</label>`;
      const hobby=(field,label)=>`<label class="creator-field">${label}<select data-resident-field="${field}">${hobbies.map(([key,name])=>`<option value="${key}" ${p[field]===key?'selected':''}>${name}</option>`).join('')}</select></label>`;
      return `<details data-resident="${escape(person.id)}" ${open.has(person.id)?'open':''}><summary>${escape(person.name||'Unnamed neighbour')}</summary>${text('name','Name',80)}${text('pronouns','Pronouns · optional',40)}${text('biography','Their story · optional',600,true)}<label class="creator-field">Usual bedtime<input type="time" min="20:00" max="23:30" step="900" data-resident-field="preferred_bedtime" value="${time(p.preferred_bedtime)}"></label>${hobby('favourite_hobby','Favourite pastime')}${hobby('alternate_hobby','Another pastime')}</details>`;
    }).join('');
  }
}
