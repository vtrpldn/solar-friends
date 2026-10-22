import {ScenarioEventsEditor} from './events.js';
import {allBuildingArt} from '../building-art.js?v=night-1';
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const freshGoal=()=>({id:'goal-'+crypto.randomUUID(),title:'A place to stay',description:'Finish a home for our neighbours.',optional:false,condition:{kind:'buildings',building:'home',count:1,credit:'present'}});
const freshChapter=()=>({id:'chapter-'+crypto.randomUUID(),title:'Our beginning',description:'Make a place where we can live together.',goals:[freshGoal()]});
const pathValue=(journal,path)=>path.split('.').reduce((value,key)=>value[key],journal);
const field=(path,label,value,{type='text',min,max,step,multiline=false}={})=>`<label class="creator-field">${label}${multiline?`<textarea data-journal-path="${path}" maxlength="${max??1000}" rows="3">${escape(value)}</textarea>`:`<input data-journal-path="${path}" type="${type}" value="${escape(value)}" ${min!==undefined?`min="${min}"`:''} ${max!==undefined?`${type==='text'?'maxlength':'max'}="${max}"`:''} ${step!==undefined?`step="${step}"`:''}>`}</label>`;
const select=(path,label,value,options)=>`<label class="creator-field">${label}<select data-journal-path="${path}">${options.map(([key,name])=>`<option value="${escape(key)}" ${String(value)===String(key)?'selected':''}>${escape(name)}</option>`).join('')}</select></label>`;
export class JournalEditor{
 constructor(host,{catalog,change,undo,redo,history}){
  Object.assign(this,{host,catalog,change,history});this.chapter=null;
  this.dialog=document.createElement('dialog');this.dialog.id='creator-journal-dialog';this.dialog.setAttribute('aria-labelledby','creator-journal-title');
  this.dialog.innerHTML='<button class="dialog-close" aria-label="Close journal editor">×</button><h2 id="creator-journal-title">Shape our story</h2><p>Chapters unfold in order. Required goals open the next chapter; optional goals can continue later. Changes stay in this draft.</p><div class="creator-journal-layout"><nav aria-label="Scenario chapters"></nav><div data-journal-form></div></div><p data-journal-errors role="status"></p><div class="dialog-actions"><button data-journal-undo>Undo</button><button data-journal-redo>Redo</button><button data-journal-done>Done</button></div>';
  document.body.append(this.dialog);this.form=this.dialog.querySelector('[data-journal-form]');this.nav=this.dialog.querySelector('nav');
  this.dialog.querySelector('.dialog-close').onclick=this.dialog.querySelector('[data-journal-done]').onclick=()=>this.dialog.close();this.dialog.querySelector('[data-journal-undo]').onclick=undo;this.dialog.querySelector('[data-journal-redo]').onclick=redo;
  const edit=e=>{
   const startBuilding=e.target.dataset.startBuilding;if(startBuilding){const available=e.target.checked;change('Change starting building availability',d=>{const locks=new Set(d.journal.locked_buildings??[]);if(available)locks.delete(startBuilding);else locks.add(startBuilding);d.journal.locked_buildings=[...locks];});return;}
   if(e.target.matches('[data-challenge-enabled]')){const enabled=e.target.checked;change('Change challenge deadline',d=>{if(enabled)d.journal.challenge={deadline:d.start.minutes+1440,failure_message:'We missed our deadline. Restart the challenge or keep this village as a free continuation.'};else delete d.journal.challenge;});return;}
   const path=e.target.dataset.journalPath;if(!path)return;
   const input=e.target,value=input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value):input.value;
   change('Edit scenario journal',d=>{
    const keys=path.split('.'),key=keys.pop(),parent=keys.length?pathValue(d.journal,keys.join('.')):d.journal;
    if(key==='speaker_choice'){if(value){const split=value.indexOf(':'),kind=value.slice(0,split);parent.speaker={kind,[kind]:value.slice(split+1)};}else delete parent.speaker;
    }else if(key==='kind'&&/^roles\.\d+\.binding\.kind$/.test(path)){for(const field of Object.keys(parent))delete parent[field];Object.assign(parent,value==='resident'?{kind:'resident',resident:(d.start.residents??catalog.resident_presets)[0]?.id??''}:{kind:'capability',skill:'growing',minimum_level:1});
    }else if(key==='kind'&&/events\.\d+\.(when|effect)\.kind$/.test(path)){
     const list=path.endsWith('.when.kind')?catalog.journal.events.trigger_examples:catalog.journal.events.effect_examples,example=structuredClone(list.find(e=>e.kind===value));
     if(value==='goal')example.goal=d.journal.chapters.flatMap(c=>c.goals)[0]?.id??'';
     if(value==='unlock_building')example.building=d.journal.locked_buildings?.[0]??'';
     if(value==='chapter')example.chapter=d.journal.chapters[0]?.id??'';
     for(const field of Object.keys(parent))delete parent[field];Object.assign(parent,example);
     if(path.endsWith('.effect.kind')&&value!=='message')delete pathValue(d.journal,keys.slice(0,-1).join('.')).speaker;
    }else if(key==='kind'){

     const example=structuredClone(catalog.journal.conditions.find(c=>c.example.kind===value).example);
     if(value==='delivered'){const store=d.start.buildings.find(b=>b.kind==='warehouse'&&b.state==='completed');if(store)example.building=store.id;}
     if(value==='goal')example.goal=d.journal.chapters.flatMap(c=>c.goals).find(g=>g.id!==input.closest('[data-journal-goal]')?.dataset.journalGoal)?.id??'';
     for(const field of Object.keys(parent))delete parent[field];Object.assign(parent,example);
    }else if(key==='milestone'&&parent.kind==='milestone'){parent.milestone=value;parent.count=1;}else if(key==='service'&&parent.kind==='service'){parent.service=value;parent.minimum=catalog.journal.services.kinds.find(s=>s.id===value).example_minimum;}else if(key==='resident'&&parent.kind==='wellbeing'){if(value)parent.resident=value;else delete parent.resident;}else if(key==='hunger_max'&&parent.kind==='wellbeing'){parent.hunger_max=100-Number(value);}else if(key==='material'&&parent.kind==='material_sites'){parent.material=value;if(!['timber','bamboo'].includes(value))parent.stage='ready';}else if(key==='building'&&['delivered','deliver_supplies'].includes(parent.kind)){if(value)parent.building=value;else delete parent.building;}else if(key==='region'){if(value)parent.region=value;else delete parent.region;}else if(key==='cents')parent[key]=Math.round(Number(value)*100);
    else if(key==='day'||key==='time'){
     const property=keys.join('.')==='challenge'?'deadline':'minute',minute=parent[property],day=key==='day'?Number(value):Math.floor(minute/1440)+1,time=key==='time'?value:`${String(Math.floor(minute%1440/60)).padStart(2,'0')}:${String(Math.floor(minute%60)).padStart(2,'0')}`,[hours,minutes]=time.split(':').map(Number);
     parent[property]=(day-1)*1440+hours*60+minutes;
    }else parent[key]=value;
   });
  };
  this.events=new ScenarioEventsEditor({catalog,change,undo,redo,history,field,select,condition:(c,path)=>this.condition(c,path,{event:true}),closed:()=>host.querySelector('[data-journal-action=events]')?.focus()});
  this.dialog.onchange=this.events.dialog.onchange=edit;
  const click=e=>{
   const button=e.target.closest('[data-journal-action]');if(!button)return;const action=button.dataset.journalAction;
   if(action==='events'){this.events.open(this.definition,this.report);return;}
   if(action==='open'){this.dialog.showModal();this.render(this.definition,this.report);this.dialog.scrollTop=0;return;}
   if(action==='choose'){this.chapter=button.dataset.chapter;this.render(this.definition,this.report);return;}
   change('Change journal '+action,d=>{
    if(action==='enable'){const chapter=freshChapter();d.journal={schema:1,introduction:'Our shared beginning.',completion:'Our village story continues.',chapters:[chapter]};this.chapter=chapter.id;this.reveal=chapter.goals[0].id;return;}
    if(action==='disable'){delete d.journal;this.dialog.close();return;}
    const chapters=d.journal.chapters,index=chapters.findIndex(c=>c.id===this.chapter),chapter=chapters[index];
    if(action==='add-chapter'){if(chapters.length>=catalog.journal.limits.chapters)return;const next=freshChapter();chapters.push(next);this.chapter=next.id;this.reveal=next.goals[0].id;}
    if(action==='remove-chapter'){chapters.splice(index,1);this.chapter=chapters[Math.max(0,index-1)]?.id??null;}
    if(action==='up'&&index>0)[chapters[index-1],chapters[index]]=[chapter,chapters[index-1]];
    if(action==='down'&&index<chapters.length-1)[chapters[index+1],chapters[index]]=[chapter,chapters[index+1]];
    if(action==='add-goal'&&chapter.goals.length<catalog.journal.limits.goals_per_chapter&&chapters.reduce((n,c)=>n+c.goals.length,0)<catalog.journal.limits.goals){const goal=freshGoal();chapter.goals.push(goal);this.reveal=goal.id;}
    if(action==='remove-goal')chapter.goals=chapter.goals.filter(g=>g.id!==button.dataset.goal);
    if(action==='add-condition'){const condition=pathValue(d.journal,button.dataset.path);if(condition.conditions.length<catalog.journal.limits.group_size)condition.conditions.push({kind:'funds',cents:0});}
    if(action==='remove-condition')pathValue(d.journal,button.dataset.path).conditions.splice(Number(button.dataset.index),1);
   });
  };
  this.events.dialog.addEventListener('click',click);
  host.onclick=click;this.dialog.addEventListener('click',click);
  this.dialog.addEventListener('close',()=>host.querySelector('[data-journal-action=open]')?.focus());
 }
 condition(c,path,goal,depth=0){
  const limits=this.catalog.journal.limits,target=this.catalog.journal.target_limits;
  const kinds=this.catalog.journal.conditions.map(option=>`<option value="${option.example.kind}" ${c.kind===option.example.kind?'selected':''} ${depth>=limits.condition_depth&&['all','any'].includes(option.example.kind)?'disabled':''}>${escape(option.name)}</option>`).join('');
  let html=`<label class="creator-field">Condition<select data-journal-path="${path}.kind">${kinds}</select></label>`;
  if(c.kind==='milestone'){const chosen=this.catalog.journal.milestones.find(m=>m.id===c.milestone),options=this.catalog.journal.milestones.map(m=>[m.id,m.name]);if(!chosen)options.push([c.milestone,'Missing milestone · choose another']);html+=select(path+'.milestone','Village milestone',c.milestone,options)+field(path+'.count','Target during this run',c.count,{type:'number',min:1,max:chosen?.maximum??1000000,step:1})+'<p>Counts actual simulation activity during this run, including before this goal starts. Starting supplies and finished buildings do not grant meals or mornings.</p>';}
  if(c.kind==='buildings')html+=select(path+'.building','Building',c.building,this.catalog.buildings.map(b=>[b.id,allBuildingArt[b.id]?.name??b.id.replaceAll('_',' ')]))+field(path+'.count','Completed buildings',c.count,{type:'number',min:1,max:target.buildings,step:1})+select(path+'.credit','Which buildings count?',c.credit,[['present','All completed buildings, including the starting settlement'],['after_activation',goal.event?'Completed after the scenario starts, and still standing':'Completed after this goal starts, and still standing']]);
  if(['buildings','crops','orchards','livestock','material_sites'].includes(c.kind)){
   const regions=this.definition.map.regions??[],options=[['','Anywhere on the map'],...regions.map(r=>[r.id,r.title])];
   if(c.region&&!regions.some(r=>r.id===c.region))options.push([c.region,'Missing region · choose another area']);
   html+=select(path+'.region','Where must the full footprint fit?',c.region??'',options)+(c.region?'':'<p>Draw named regions on the map to target a particular area.</p>');
  }
  if(['crops','orchards','livestock','material_sites'].includes(c.kind)){
   const land=this.catalog.journal.land_use,stages=c.kind==='crops'?land.crop_stages:c.kind==='orchards'?land.orchard_stages:c.kind==='livestock'?land.animal_stages:land.source_stages.filter(s=>['timber','bamboo'].includes(c.material)||s.id==='ready'),options=stages.map(s=>[s.id,s.name]);
   if(!options.some(([id])=>id===c.stage))options.push([c.stage,'Unavailable stage · choose a supported state']);
   if(c.kind==='crops')html+=select(path+'.crop','Current crop',c.crop,land.crops.map(crop=>[crop,crop]));
   if(c.kind==='livestock')html+=select(path+'.building','Animal enclosure',c.building,land.animal_buildings.map(b=>[b,allBuildingArt[b]?.name??b]));
   if(c.kind==='material_sites')html+=select(path+'.material','Local material',c.material,land.materials.map(m=>[m,m]));
   html+=select(path+'.stage','Required current state',c.stage,options)+field(path+'.count',c.kind==='livestock'?'Qualifying enclosures · not individual animals':'Qualifying plots',c.count,{type:'number',min:1,max:land.limit,step:1})+'<p>Current assets count, including the starting settlement. No harvest, extraction or care-work history is credited. Completed goals stay credited. Projects and buildings being moved or removed do not count; regional goals require the full footprint inside the area.</p>';
   if(c.kind==='livestock')html+='<p>Care means an unexpired goat-care period, inspected bees with nearby flowering forage, or hens with an active paid feeding batch. An occupied enclosure alone does not prove care or output.</p>';
   if(c.kind==='material_sites')html+='<p>Harvestable means at least eight timber units or one unit of another material can be taken through normal extraction rules. Cleared plots do not count. Finite deposits can be exhausted. Requires materials, hauling and resident work.</p>';
  }
  if(c.kind==='stored')html+=select(path+'.material','Material',c.material,this.catalog.materials.map(m=>[m,m.replaceAll('_',' ')]))+field(path+'.count','Unreserved units at stores',c.count,{type:'number',min:1,max:target.stored,step:1})+'<p>Incoming orders and reserved materials do not count.</p>';
  if(c.kind==='funds')html+=field(path+'.cents','Shared fund · R$',c.cents/100,{type:'number',min:0,max:target.funds/100,step:.01});
  if(c.kind==='date')html+=field(path+'.day','Day',Math.floor(c.minute/1440)+1,{type:'number',min:1,max:Math.floor(target.date/1440)+1,step:1})+field(path+'.time','Time',`${String(Math.floor(c.minute%1440/60)).padStart(2,'0')}:${String(Math.floor(c.minute%60)).padStart(2,'0')}`,{type:'time',step:60});
  if(c.kind==='harvests')html+=field(path+'.count','Completed harvests',c.count,{type:'number',min:1,max:target.harvests,step:1})+select(path+'.credit','Which harvests count?',c.credit,[['run','All harvests during this playthrough'],['after_activation',goal.event?'Only harvests after the scenario starts':'Only harvests after this goal starts']]);
  if(c.kind==='delivered'){
   const structures=this.definition.start.buildings.filter(b=>b.state==='blueprint'||this.catalog.buildings.find(kind=>kind.id===b.kind)?.receives_deliveries),options=[['','Arrival store'],...structures.map(b=>[b.id,`${allBuildingArt[b.kind]?.name??b.kind} · (${b.x}, ${b.y})`])];
   if(c.building&&!structures.some(b=>b.id===c.building))options.push([c.building,'Missing or unavailable starting building']);
   html+=select(path+'.building','Receiving destination',c.building??'',options)+select(path+'.material','Material carried',c.material,this.catalog.materials.map(m=>[m,m.replaceAll('_',' ')]))+field(path+'.count','Units physically delivered',c.count,{type:'number',min:1,max:this.catalog.journal.target_limits.delivered,step:1})+select(path+'.credit','Which local deliveries count?',c.credit,[['run','All resident dropoffs during this playthrough'],['after_activation',goal.event?'Only dropoffs after the scenario starts':'Only dropoffs after this goal starts']])+'<p>Counts completed resident-carried shipments into the chosen inventory. Starting supplies, town unloads, direct gifts, collection without delivery and dropped loads do not count. Set a storage reserve or arrange actual construction, pantry or preparation demand. Requires materials, hauling and resident work.</p>';
  }
  if(c.kind==='traded')html+=select(path+'.direction','Completed transaction',c.direction,[['purchase','Town purchases received'],['sale','Resources sold']])+select(path+'.material','Material',c.material,this.catalog.journal.trade_materials.map(m=>[m,m.replaceAll('_',' ')]))+field(path+'.count','Units traded',c.count,{type:'number',min:1,max:this.catalog.journal.target_limits.traded,step:1})+select(path+'.credit','Which transactions count?',c.credit,[['run','All completed transactions during this playthrough'],['after_activation',goal.event?'Only transactions completed after the scenario starts':'Only transactions completed after this goal starts']])+'<p>Purchases count when delivery arrives or the resident pickup returns. Pending and cancelled orders do not count. Sales count only after stored goods are removed and payment is recorded. Starting supplies, gifts and local hauling do not count.</p>';
  if(c.kind==='produced')html+=select(path+'.material','Prepared product',c.material,this.catalog.journal.production_materials.map(m=>[m,m.replaceAll('_',' ')]))+field(path+'.count','Units actually produced',c.count,{type:'number',min:1,max:this.catalog.journal.target_limits.produced,step:1})+select(path+'.credit','Which production counts?',c.credit,[['run','All completed production during this playthrough'],['after_activation',goal.event?'Only production after the scenario starts':'Only production after this goal starts']])+'<p>Counts completed native preparation batches, including output later used or sold. Starting stock, purchases, refunds and cancelled batches do not count. Requires materials, hauling and resident work.</p>';
  if(c.kind==='service'){
   const limits=this.catalog.journal.services,entry=limits.kinds.find(s=>s.id===c.service);
   html+=select(path+'.service','Service to maintain',c.service,limits.kinds.map(s=>[s.id,s.name]))+field(path+'.minimum','Required available amount',c.minimum,{type:'number',min:entry.minimum,max:entry.maximum,step:entry.step})+field(path+'.minutes',goal.event?'Consecutive observed minutes after scenario start':'Consecutive observed minutes after activation',c.minutes,{type:'number',min:limits.minimum_minutes,max:limits.maximum_minutes,step:limits.duration_step})+`<p>${escape(entry.note)}</p><p>${entry.observation_minutes===0?'Lighting is checked every native simulation step.':`Access is observed every ${entry.observation_minutes} game minutes, with earlier checks after layout changes or known losses of required supply.`} Failed or late observations restart the period. Earlier time never counts toward a later goal; pauses add no time. Completed goals retain their final observation.</p><p>${entry.requires_logistics?'Requires materials, hauling and resident work.':entry.requires_utilities?'Requires connected local water and power.':'Targets count residents with assigned homes, up to the size of this cast.'} Changing the service selects its default target; adjust the amount or use Undo.</p>`;
  }
  if(c.kind==='wellbeing'){
   const people=this.definition.start.residents??this.catalog.resident_presets,options=[['','Everyone in the founding cast'],...people.map(p=>[p.id,p.name||'Unnamed friend'])],limits=this.catalog.journal.wellbeing;
   if(c.resident&&!people.some(p=>p.id===c.resident))options.push([c.resident,'Missing friend · choose someone or everyone']);
   html+=select(path+'.resident','Whose needs?',c.resident??'',options)+field(path+'.energy_min','Minimum energy · %',c.energy_min,{type:'number',min:0,max:100,step:1})+field(path+'.hunger_max','Minimum fullness · %',100-c.hunger_max,{type:'number',min:0,max:100,step:1})+field(path+'.social_min','Minimum connection · %',c.social_min,{type:'number',min:0,max:100,step:1})+field(path+'.happiness_min','Minimum wellbeing · %',c.happiness_min,{type:'number',min:0,max:100,step:1})+field(path+'.minutes',goal.event?'Consecutive observed game minutes after scenario start':'Consecutive observed game minutes after activation',c.minutes,{type:'number',min:limits.minimum_minutes,max:limits.maximum_minutes,step:1})+'<p>All selected friends must meet every threshold at each native simulation step, including while sleeping or away. A lapse or observation gap restarts the period. Earlier healthy time never counts toward a later goal. Pauses add no time; completing a goal preserves its final observation. A threshold of zero adds no minimum for that need.</p>';
  }
  if(c.kind==='maintain'){
   const outcomes=this.catalog.journal.outcomes,selected=outcomes.find(o=>o.id===c.outcome);
   html+=select(path+'.outcome','Observed village condition',c.outcome,outcomes.map(o=>[o.id,o.name]))+field(path+'.minutes','Consecutive observed minutes after activation',c.minutes,{type:'number',min:15,max:selected.maximum_minutes,step:15})+'<p>Measured every 15 game minutes. A lapse or observation gap resets the period. Earlier success does not count. Completed goals stay credited.</p>';
  }
  if(c.kind==='goal'){
   const options=[['','Choose a goal'],...this.definition.journal.chapters.flatMap(chapter=>chapter.goals.filter(g=>g.id!==goal.id).map(g=>[g.id,`${chapter.title} · ${g.title}`]))];
   if(c.goal&&!options.some(([id])=>id===c.goal))options.push([c.goal,'Missing or unavailable goal · choose another']);
   html+=select(path+'.goal',goal.event?'Completed goal':'Earlier goal',c.goal,options);
  }
  if(['all','any'].includes(c.kind))html+=`<p>${c.kind==='all'?'Every condition must be met.':'At least one condition must be met.'}</p>`+c.conditions.map((child,i)=>`<fieldset><legend>Condition ${i+1}</legend>${this.condition(child,`${path}.conditions.${i}`,goal,depth+1)}<button data-journal-action="remove-condition" data-path="${path}" data-index="${i}">Remove condition</button></fieldset>`).join('')+`<button data-journal-action="add-condition" data-path="${path}" ${c.conditions.length>=limits.group_size||depth>=limits.condition_depth?'disabled':''}>Add condition</button>`;
  return html;
 }
 render(definition,report){
  this.definition=definition;this.report=report;const j=definition.journal;
  this.host.innerHTML=j?'<p>A journal guides this village through its own chapters.</p><button data-journal-action="open">Edit village journal</button><button data-journal-action="disable">Remove journal</button>':'<p>Add chapters and goals for players to follow.</p><button data-journal-action="enable">Add village journal</button>';
  if(j)this.host.insertAdjacentHTML('beforeend',`<button data-journal-action="events">Village events · ${j.events?.length??0}</button>`);this.events.render(definition,report);
  if(!j){if(this.dialog.open)this.dialog.close();return;}if(!this.dialog.open)return;
  if(!j.chapters.some(c=>c.id===this.chapter))this.chapter=j.chapters[0]?.id??null;
  const focused=document.activeElement?.dataset.journalPath,scroll=this.form.scrollTop,open=new Set([...this.form.querySelectorAll('[data-journal-goal][open]')].map(el=>el.dataset.journalGoal));
  this.nav.innerHTML=j.chapters.map((c,i)=>`<button data-journal-action="choose" data-chapter="${escape(c.id)}" aria-pressed="${c.id===this.chapter}">${i+1}. ${escape(c.title)}</button>`).join('')+`<button data-journal-action="add-chapter" ${j.chapters.length>=this.catalog.journal.limits.chapters?'disabled':''}>Add chapter</button>`;
  const index=j.chapters.findIndex(c=>c.id===this.chapter),c=j.chapters[index],base=`chapters.${index}`;
  this.form.innerHTML=field('introduction','Introduction',j.introduction,{multiline:true,max:2000})+field('completion','Completion message',j.completion,{multiline:true,max:1000})+`<fieldset><legend>Timed challenge</legend><label><input type="checkbox" data-challenge-enabled ${j.challenge?'checked':''}> Set a challenge deadline</label><p>Simulation time counts; pausing does not. Goals completed exactly at the deadline count. Missing it stops time until the player restarts or chooses a separate free continuation.</p>${j.challenge?field('challenge.day','Deadline day',Math.floor(j.challenge.deadline/1440)+1,{type:'number',min:1,max:3473,step:1})+field('challenge.time','Deadline time',`${String(Math.floor(j.challenge.deadline%1440/60)).padStart(2,'0')}:${String(Math.floor(j.challenge.deadline%60)).padStart(2,'0')}`,{type:'time'})+field('challenge.failure_message','Failure message',j.challenge.failure_message,{multiline:true,max:1000}):''}</fieldset>`+(c?field(base+'.title','Chapter title',c.title,{max:100})+field(base+'.description','Chapter description',c.description,{multiline:true,max:1000})+`<div class="creator-journal-order"><button data-journal-action="up" ${index<=0?'disabled':''}>Earlier</button><button data-journal-action="down" ${index===j.chapters.length-1?'disabled':''}>Later</button><button data-journal-action="remove-chapter">Remove chapter</button></div>`+c.goals.map((g,i)=>`<details data-journal-goal="${escape(g.id)}" ${open.has(g.id)||g.id===this.reveal?'open':''}><summary>${escape(g.title)}</summary>${field(`${base}.goals.${i}.title`,'Goal title',g.title,{max:100})}${field(`${base}.goals.${i}.description`,'Goal description',g.description,{multiline:true,max:1000})}<label><input type="checkbox" data-journal-path="${base}.goals.${i}.optional" ${g.optional?'checked':''}> Optional goal</label>${this.condition(g.condition,`${base}.goals.${i}.condition`,g)}<button data-journal-action="remove-goal" data-goal="${escape(g.id)}">Remove goal</button></details>`).join('')+`<button data-journal-action="add-goal" ${c.goals.length>=this.catalog.journal.limits.goals_per_chapter||j.chapters.reduce((n,c)=>n+c.goals.length,0)>=this.catalog.journal.limits.goals?'disabled':''}>Add goal</button>`:'<p>Add a chapter to continue shaping this journal.</p>');
  this.reveal=null;this.form.scrollTop=scroll;if(focused)this.form.querySelector(`[data-journal-path="${focused}"]`)?.focus({preventScroll:true});
  this.dialog.querySelector('[data-journal-errors]').textContent=(report?.issues??[]).filter(i=>i.path.startsWith('journal')).map(i=>i.message).join(' ');
  const state=this.history();this.dialog.querySelector('[data-journal-undo]').disabled=!state.undo;this.dialog.querySelector('[data-journal-redo]').disabled=!state.redo;
 }
}
