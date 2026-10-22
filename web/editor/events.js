const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export class ScenarioEventsEditor {
 constructor({catalog,change,undo,redo,history,field,select,condition,closed}){
  Object.assign(this,{catalog,change,history,field,select,condition});this.dialog=document.createElement('dialog');this.dialog.id='creator-events-dialog';this.dialog.setAttribute('aria-labelledby','creator-events-title');
  this.dialog.innerHTML='<button class="dialog-close" aria-label="Close event editor">×</button><h2 id="creator-events-title">Moments in our story</h2><p>Each event happens once. When its trigger and additional conditions hold together, it queues its effect. Events observe the village before any effects run, then apply in the order below. Event conditions begin observing at the start of the scenario.</p><div data-events-form></div><p data-events-errors role="status"></p><div class="dialog-actions"><button data-events-undo>Undo</button><button data-events-redo>Redo</button><button data-events-done>Done</button></div>';
  document.body.append(this.dialog);this.form=this.dialog.querySelector('[data-events-form]');this.dialog.querySelector('.dialog-close').onclick=this.dialog.querySelector('[data-events-done]').onclick=()=>this.dialog.close();this.dialog.addEventListener('close',closed);this.dialog.querySelector('[data-events-undo]').onclick=undo;this.dialog.querySelector('[data-events-redo]').onclick=redo;
  this.dialog.onclick=e=>{const button=e.target.closest('[data-event-action]');if(!button)return;const action=button.dataset.eventAction,id=button.closest('[data-event-id]')?.dataset.eventId;
   change('Edit story event',d=>{const events=d.journal.events??=[],index=events.findIndex(e=>e.id===id),event=events[index];
    if(action==='add'&&events.length<catalog.journal.events.maximum){const next={id:'event-'+crypto.randomUUID(),title:'A moment together',when:{kind:'start'},effect:{kind:'message',text:'Our neighbours have news.'}};events.push(next);this.reveal=next.id;}
    if(action==='remove')events.splice(index,1);
    if(action==='earlier'&&index>0)[events[index-1],events[index]]=[event,events[index-1]];
    if(action==='later'&&index<events.length-1)[events[index+1],events[index]]=[event,events[index+1]];
    if(action==='guard'){if(event.condition)delete event.condition;else event.condition={kind:'funds',cents:0};}
   });
  };
 }
 open(d,report){this.dialog.showModal();this.render(d,report);}
 render(d,report){
  this.definition=d;if(!d.journal){this.dialog.close();return;}if(!this.dialog.open)return;
  const {field,select}=this,events=d.journal.events??[],focus=document.activeElement?.dataset.journalPath,open=new Set([...this.form.querySelectorAll('[data-event-id][open]')].map(el=>el.dataset.eventId)),scroll=this.form.scrollTop;
  const triggerNames={start:'Scenario begins',goal:'Goal completed',chapter:'Chapter completed',date:'Game date reached',threshold:'Village condition met'},effectNames={message:'Show a message',grant_funds:'Grant shared funding'};
  this.form.innerHTML=events.map((event,i)=>{const base=`events.${i}`,when=event.when;let trigger=select(base+'.when.kind','Moment',when.kind,this.catalog.journal.events.trigger_examples.map(e=>[e.kind,triggerNames[e.kind]]));
   if(when.kind==='goal'){const options=[['','Choose a goal'],...d.journal.chapters.flatMap(c=>c.goals.map(g=>[g.id,`${c.title} · ${g.title}`]))];if(when.goal&&!options.some(([id])=>id===when.goal))options.push([when.goal,'Missing goal · choose another']);trigger+=select(base+'.when.goal','Completed goal',when.goal??'',options);}
   if(when.kind==='chapter'){const options=[['','Choose a chapter'],...d.journal.chapters.map(c=>[c.id,c.title])];if(when.chapter&&!options.some(([id])=>id===when.chapter))options.push([when.chapter,'Missing chapter · choose another']);trigger+=select(base+'.when.chapter','Completed chapter',when.chapter??'',options);}
   if(when.kind==='date')trigger+=field(base+'.when.day','Day',Math.floor(when.minute/1440)+1,{type:'number',min:1,max:Math.floor(this.catalog.journal.target_limits.date/1440)+1,step:1})+field(base+'.when.time','Time',`${String(Math.floor(when.minute%1440/60)).padStart(2,'0')}:${String(Math.floor(when.minute%60)).padStart(2,'0')}`,{type:'time',step:60});
   if(when.kind==='threshold')trigger+=this.condition(when.condition,base+'.when.condition');
   let effect=select(base+'.effect.kind','Action',event.effect.kind,this.catalog.journal.events.effect_examples.map(e=>[e.kind,effectNames[e.kind]]));
   if(event.effect.kind==='message')effect+=field(base+'.effect.text','Message',event.effect.text,{multiline:true,max:1000});
   if(event.effect.kind==='grant_funds')effect+=field(base+'.effect.cents','Shared funding · R$',event.effect.cents/100,{type:'number',min:.01,max:this.catalog.journal.events.maximum_grant_cents/100,step:.01})+'<p>Recorded once in the shared fund ledger. If the full amount cannot fit, the queued grant waits for room; it never pays partially or repeats after a reload.</p>';
   return `<details data-event-id="${escape(event.id)}" ${open.has(event.id)||event.id===this.reveal?'open':''}><summary>${i+1}. ${escape(event.title)}</summary>${field(base+'.title','Event title',event.title,{max:100})}<fieldset><legend>When</legend>${trigger}</fieldset><fieldset><legend>If</legend><button data-event-action="guard">${event.condition?'Remove additional condition':'Add an additional condition'}</button>${event.condition?this.condition(event.condition,base+'.condition'):'<p>No additional condition.</p>'}</fieldset><fieldset><legend>Then</legend>${effect}</fieldset><div class="creator-selection-actions"><button data-event-action="earlier" ${i===0?'disabled':''}>Earlier</button><button data-event-action="later" ${i===events.length-1?'disabled':''}>Later</button><button data-event-action="remove">Remove event</button></div></details>`;
  }).join('')+`<button data-event-action="add" ${events.length>=this.catalog.journal.events.maximum?'disabled':''}>Add event</button>`;
  this.reveal=null;this.form.scrollTop=scroll;if(focus)this.form.querySelector(`[data-journal-path="${focus}"]`)?.focus({preventScroll:true});this.dialog.querySelector('[data-events-errors]').textContent=(report?.issues??[]).filter(e=>e.path.startsWith('journal.events')).map(e=>e.message).join(' ');const history=this.history();this.dialog.querySelector('[data-events-undo]').disabled=!history.undo;this.dialog.querySelector('[data-events-redo]').disabled=!history.redo;
 }
}
