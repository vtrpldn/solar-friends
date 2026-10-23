import {openingFields,ensureStart,clearStart} from './arrival.js';
import {CharacterCreator} from './character-creator.js';
import {appearanceFields,changeAppearanceField} from '../resident-appearance-fields.js';
import {addResident,removeResident} from './roster.js';
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hobbies=[['nature_walk','Nature walks'],['birdwatch','Birdwatching'],['stretch','Stretching'],['daydream','Daydreaming']];
const time=minutes=>`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
export class ResidentsEditor{
  constructor(host,{presets,occupations,personality,experience,appearances,maximum,change,savePreset,openPresets,source,art,undo,redo,history,catalog,placeStart,locateStart}){
    this.forms=new Map();this.maximum=maximum;this.host=host;this.presets=presets;this.occupations=occupations;this.personality=personality;this.experience=experience;this.appearances=appearances;this.catalog=catalog;
    const startAction=event=>{const button=event.target.closest('[data-start-action],[data-remove-start]');if(!button)return;const id=button.dataset.removeStart??button.closest('[data-resident]')?.dataset.resident??button.closest('[data-editing-resident]')?.dataset.editingResident,action=button.dataset.startAction;
      if(button.hasAttribute('data-remove-start')){change('Remove unavailable resident setup',d=>{d.start.resident_setup=(d.start.resident_setup??[]).filter(s=>s.resident!==id);});return;}
      if(action==='place'){if(this.creator.dialog.open)this.creator.dialog.close();placeStart(id);return;}
      if(action==='locate'){const position=source().start.resident_setup?.find(s=>s.resident===id)?.position;if(position){if(this.creator.dialog.open)this.creator.dialog.close();locateStart(id,position);}return;}
      change('Reset starting resident circumstances',d=>{if(action==='all')d.start.resident_setup=(d.start.resident_setup??[]).filter(s=>s.resident!==id);else clearStart(d,id,action==='needs'?'needs':'position');});
    };
    host.addEventListener('click',startAction);
    host.addEventListener('click',event=>{
      const button=event.target.closest('[data-add-resident],[data-duplicate-resident],[data-remove-resident],[data-save-resident-preset],[data-open-resident-presets],[data-open-character]');if(!button)return;
      const identity=button.closest('[data-resident]')?.dataset.resident;
      if(button.hasAttribute('data-open-character')){this.creator.open(identity);return;}
      if(button.hasAttribute('data-open-resident-presets')){void openPresets();return;}
      if(button.hasAttribute('data-save-resident-preset')){const person=(source().start.residents??this.presets).find(p=>p.id===identity);if(person)void savePreset(person);return;}
      const remove=button.hasAttribute('data-remove-resident');
      change(remove?'Remove resident and their starting friendships':identity?'Duplicate resident':'Create resident',d=>{
        if(remove)removeResident(d,this.presets,identity);
        else addResident(d,this.presets,this.maximum,{source:identity??null});
      });
    });
    const changeField=event=>{
      const start=event.target.dataset.residentStart;if(start){const id=event.target.closest('[data-resident]')?.dataset.resident??event.target.closest('[data-editing-resident]')?.dataset.editingResident,value=Number(event.target.value);change('Set resident opening circumstances',d=>{const person=(d.start.residents??this.presets).find(p=>p.id===id);if(!person)return;const s=ensureStart(d,id);if(['x','y'].includes(start)){s.position??=[...d.map.camp];s.position[start==='x'?0:1]=value;}else{s.needs??=structuredClone(catalog.resident_start_defaults[person.preset]);s.needs[start]=value;}});return;}
      if(event.target.matches('[data-resident-policy]')){change('Change starting skill budget',d=>{d.start.resident_balance=event.target.value;});return;}
      const field=event.target.dataset.residentField,identity=event.target.closest('[data-resident],[data-editing-resident]')?.dataset.resident??event.target.closest('[data-editing-resident]')?.dataset.editingResident;
      if(!field||!identity)return;
      let value=field==='outside_shifts'?event.target.checked:event.target.value;
      if(field==='preferred_bedtime'){const [h,m]=value.split(':').map(Number);value=h*60+m;}
      change('Change a founding resident',definition=>{
        definition.start.residents??=structuredClone(this.presets);
        const person=definition.start.residents.find(p=>p.id===identity);if(!person)return;
        if(field==='appearance'||field.startsWith('appearance:')){person.appearance=changeAppearanceField(person.appearance,field,value);}
        else if(field==='background'){const background=this.experience.backgrounds.find(b=>b.key===value);person.experience={background:value,levels:structuredClone(background.levels)};}
        else if(field.startsWith('skill:')){person.experience??={background:'newcomer',levels:{}};person.experience.levels[field.slice(6)]=Number(value);}
        else if(field.startsWith('work:')){person.work_preferences??={};person.work_preferences[field.slice(5)]=value;}
        else if(['preferred_bedtime','favourite_hobby','alternate_hobby'].includes(field))person.routine_preferences[field]=value;
        else if(['social_style','work_interest'].includes(field)){person.personality??=structuredClone(this.personality.founders.find(p=>p.preset===person.preset)?.profile??this.personality.founders[0].profile);person.personality[field]=value;}
        else {person[field]=value;if(field==='occupation'&&value==='none')person.outside_shifts=false;}
      });
    };
    host.addEventListener('change',changeField);
    this.creator=new CharacterCreator({art,startAction,source:()=>source().start.residents??this.presets,groups:()=>this.forms,changeField,undo,redo,history,catalog,editPerson:(label,edit)=>{const id=this.creator.id;return change(label,d=>{d.start.residents??=structuredClone(this.presets);const person=d.start.residents.find(p=>p.id===id);if(person){const next=edit(person);for(const key of Object.keys(person))if(!Object.hasOwn(next,key))delete person[key];Object.assign(person,next);}});}});
  }
  openArrival(id){this.creator.open(id);this.creator.select('Arrival');}
  render(definition,report){
    const people=definition.start.residents??this.presets;
    const signature=JSON.stringify([people,definition.start.resident_balance,definition.rules.learning,definition.start.resident_setup,report?.issues.filter(i=>i.path.startsWith('start.resident_setup'))]);if(signature===this.signature){this.creator.update();return;}this.signature=signature;
    const experienceOpen=new Set([...this.host.querySelectorAll('details[data-resident]')].filter(el=>el.querySelector('.creator-experience')?.open).map(el=>el.dataset.resident));
    const open=new Set([...this.host.querySelectorAll('details[open]')].map(el=>el.dataset.resident));
    const unrestricted=definition.start.resident_balance==='unrestricted';
    const policy=`<label class="creator-field">Starting skill setup<select data-resident-policy><option value="balanced" ${unrestricted?'':'selected'}>Balanced</option><option value="unrestricted" ${unrestricted?'selected':''}>Unrestricted</option></select></label><p>${unrestricted?'Up to five levels in every skill. This choice is shown in the scenario library and while playing.':'Six starting levels per resident, with no skill above level three.'}</p>`;
    const controls=`<p>${people.length} / ${this.maximum} residents · ${definition.rules.mode==='story'?'Official Story needs all five founding roles.':'Choose at least one resident to play.'}</p><button type="button" data-add-resident ${people.length>=this.maximum?'disabled':''}>＋ New resident</button><button type="button" data-open-resident-presets>Resident presets</button><p>Removing someone also removes their starting friendships and scenario circumstances. Undo restores them. Empty casts can be saved as drafts.</p>`;
    this.forms.clear();
    const unknown=(definition.start.resident_setup??[]).filter(s=>!people.some(p=>p.id===s.resident));
    this.host.innerHTML=controls+policy+unknown.map(s=>`<p>Unavailable resident has a starting setup. <button data-remove-start="${escape(s.resident)}">Clear unavailable setup</button></p>`).join('')+people.map(person=>{
      const p=person.routine_preferences;
      const levels=person.experience?.levels??{},background=person.experience?.background??'newcomer';
      const total=Object.values(levels).reduce((sum,value)=>sum+value,0);
      const skillControl=skill=>{
        const current=levels[skill.key]??0,unsupported=!Number.isInteger(current)||current<0||current>this.experience.maximum_level;
        const extra=unsupported?`<option value="${escape(current)}" selected>Unsupported level ${escape(current)}</option>`:'';
        return `<label class="creator-field">${escape(skill.name)}<select data-resident-field="skill:${skill.key}">${extra}${Array.from({length:6},(_,level)=>`<option value="${level}" ${current===level?'selected':''}>Level ${level} · ${level*this.experience.bonus_per_level}%</option>`).join('')}</select></label>`;
      };
      const experienceControls=`<details class="creator-experience" ${experienceOpen.has(person.id)?'open':''}><summary>Experience and work preferences</summary><label class="creator-field">Practical background<select data-resident-field="background">${this.experience.backgrounds.map(b=>`<option value="${b.key}" ${background===b.key?'selected':''}>${escape(b.name)}</option>`).join('')}</select></label><p>A background suggests starting skills. Choosing one replaces these levels; adjust them below or use Undo.</p><p>${unrestricted?`${total} starting levels · unrestricted`:`${total} / ${this.experience.balanced_total} starting levels`}. Each level gives ${this.experience.bonus_per_level}% faster work in that skill.</p>${!definition.rules.learning?'<p>Learning and skill benefits are off in village rules. These levels are saved for when that rule is enabled.</p>':''}${this.experience.skills.map(skillControl).join('')}<p>Guide shared chores. Needs, rest and outside commitments still come first.</p>${this.experience.work_groups.map(group=>`<label class="creator-field">${escape(group.name)}<select data-resident-field="work:${group.key}">${[['less','Less often'],['share','Share equally'],['prefer','Prefer']].map(([key,name])=>`<option value="${key}" ${(person.work_preferences?.[group.key]??'share')===key?'selected':''}>${name}</option>`).join('')}</select></label>`).join('')}</details>`;

      const profile=person.personality??this.personality.founders.find(p=>p.preset===person.preset)?.profile??this.personality.founders[0].profile;
      const personalityField=(field,title,catalog)=>`<label class="creator-field">${title}<select data-resident-field="${field}">${catalog.map(item=>`<option value="${item.key}" ${profile[field]===item.key?'selected':''}>${escape(item.name)}</option>`).join('')}</select></label><p>${escape(catalog.find(item=>item.key===profile[field])?.description??'')}</p>`;
      const personalityControls=personalityField('social_style','Social style',this.personality.social_styles)+personalityField('work_interest','Favourite community work',this.personality.interests);

      const occupation=person.occupation??this.presets.find(p=>p.preset===person.preset)?.occupation??'none';
      const job=this.occupations.find(j=>j.key===occupation);
      const occupationControls=`<label class="creator-field">Outside occupation<select data-resident-field="occupation">${this.occupations.map(j=>`<option value="${j.key}" ${j.key===occupation?'selected':''}>${escape(j.title)}</option>`).join('')}</select></label><p>${escape(job?.description??'')}${job?.income?` R$ ${job.income/100} per completed shift.`:''}</p><label class="creator-field"><span><input type="checkbox" data-resident-field="outside_shifts" ${person.outside_shifts?'checked':''} ${occupation==='none'?'disabled':''}> Take outside shifts · 09:00–17:00</span></label>`;
      const text=(field,label,max,multiline=false)=>`<label class="creator-field">${label}${multiline?`<textarea rows="3" maxlength="${max}" data-resident-field="${field}">${escape(person[field])}</textarea>`:`<input type="text" maxlength="${max}" data-resident-field="${field}" value="${escape(person[field])}">`}</label>`;
      const hobby=(field,label)=>`<label class="creator-field">${label}<select data-resident-field="${field}">${hobbies.map(([key,name])=>`<option value="${key}" ${p[field]===key?'selected':''}>${name}</option>`).join('')}</select></label>`;
      const identityControls=text('name','Name',80)+text('pronouns','Pronouns · optional',40)+text('biography','Their story · optional',600,true);
      const appearanceControls=appearanceFields(person.appearance??{preset:person.preset,version:person.preset_version},this.appearances);
      const routineControls=`<label class="creator-field">Usual bedtime<input type="time" min="20:00" max="23:30" step="900" data-resident-field="preferred_bedtime" value="${time(p.preferred_bedtime)}"></label>${personalityControls}${hobby('favourite_hobby','Favourite pastime')}${hobby('alternate_hobby','Another pastime')}${occupationControls}`;
      const opening=openingFields(person,definition,this.catalog,report);
      this.forms.set(person.id,{Arrival:opening,Identity:identityControls,Appearance:appearanceControls,Personality:routineControls,Experience:experienceControls});
      return `<details data-resident="${escape(person.id)}" ${open.has(person.id)?'open':''}><summary>${escape(person.name||'Unnamed neighbour')}</summary><button type="button" data-open-character>Open character creator</button>${identityControls}${appearanceControls}${routineControls}${experienceControls}${opening}<button type="button" data-save-resident-preset>Save resident preset</button><div class="creator-roster-actions"><button type="button" data-duplicate-resident ${people.length>=this.maximum?'disabled':''}>Duplicate</button><button type="button" data-remove-resident>Remove resident</button></div></details>`;
    }).join('');
    this.creator.update();
  }
}
