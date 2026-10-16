import {itemIcon,materialIcons} from './game-ui.js';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const same=(a,b)=>a.kind===b.kind&&a.id===b.id;
export function installMaintenanceUI({game,snapshot,changed,notify,openTown,openUpkeep,focusAt,developer}){
  const $=s=>document.querySelector(s),list=$('#maintenance-equipment');let report=null;
  const apply=result=>{if(result!==true&&result!=='ok'){notify(typeof result==='string'?result:'This service order has ended.');return;}changed();};
  $('#equipment-wear').onchange=e=>{game().set_equipment_condition(e.target.checked);changed();};
  $('#automatic-service').onchange=e=>{game().set_automatic_service(e.target.checked);changed();};
  $('#maintenance-alert').onclick=openUpkeep;
  const bundle=(items,materials)=>items.map((n,i)=>n?`${n} ${materials[i].name.toLowerCase()}`:'').filter(Boolean).join(' · ')||'None';
  function context(key,v){
    if(key.kind==='truck')return 'At the arrival camp';
    if(key.kind==='workshop')return `Workshop ${key.id+1}`;
    const node=v.power.network.nodes.find(n=>n.id===key.id),owner=node?.owner;
    if(owner?.kind==='building'){
      const b=v.buildings.find(b=>b.id===owner.id);return `${({solar_farm:'Solar farm',hydro:'River generator',home:'Home'})[b?.kind]||'Building'} ${owner.id+1}`;
    }
    if(owner?.kind==='pump'){const p=v.pipes.lines.find(p=>p.id===owner.id);return `${({fresh:'Fresh water',irrigation:'Irrigation',greywater:'Greywater',sewage:'Sealed sewage'})[p?.plan.kind]||'Water'} connection`;}
    return owner?.kind==='carrier'?'Being carried':'Recovered battery';
  }
  list.onclick=e=>{
    const button=e.target.closest('[data-service-action]');if(!button||!report)return;
    const row=report.equipment.find(r=>JSON.stringify(r.equipment)===button.dataset.equipment);if(!row)return;
    const service=report.jobs.find(r=>same(r.job.equipment,row.equipment)&&r.job.finished==null);
    if(button.dataset.serviceAction==='locate'){focusAt(...row.location);return;}
    if(button.dataset.serviceAction==='queue'){apply(game().queue_equipment_service(JSON.stringify(row.equipment)));return;}
    if(button.dataset.serviceAction==='pause'){apply(game().configure_equipment_service(service.job.id,!service.job.paused));return;}
    if(button.dataset.serviceAction==='cancel'){apply(game().cancel_equipment_service(service.job.id));return;}
    if(button.dataset.serviceAction==='parts'){
      const s=snapshot(),items=service.missing.map((n,i)=>Math.min(n,s.environment.economy.shortage[i]));
      openTown();for(let i=0;i<items.length;i++){const input=$(`[data-material="${i}"]`);if(input)input.value=items[i];}
      if(report.equipment.some(r=>r.equipment.kind==='truck'&&(r.failed||report.jobs.some(j=>j.job.finished==null&&j.job.equipment.kind==='truck'))))$('[name="town-transport"][value="delivery"]').checked=true;
      $('#town-catalog').dispatchEvent(new Event('input',{bubbles:true}));
      $('#town-order').focus();
    }
  };
  return {update(){
    const s=snapshot(),v=s.village,materials=s.environment.economy.materials;report=JSON.parse(game().maintenance_report());
    const due=report.equipment.filter(r=>r.service_due),active=report.jobs.filter(r=>r.job.finished==null),failed=report.equipment.filter(r=>r.failed);
    $('#equipment-wear').checked=report.enabled;$('#equipment-wear').disabled=v.mode!=='sandbox'&&!developer();
    $('#maintenance-mode-note').textContent=v.mode==='sandbox'?'Optional Sandbox constraint. Turning wear off cancels service orders and preserves condition and used parts.':report.enabled?'Equipment upkeep is part of Story. Prepare supplies before a unit reaches 10% condition.':'This authored test scene has equipment wear disabled.';
    $('#automatic-service').checked=report.automatic;$('#automatic-service').disabled=!report.enabled;
    $('#maintenance-summary').textContent=!report.enabled?'Wear is off. Equipment operates at its usual performance.':`${failed.length?failed.length+' need repair · ':''}${due.length} due for service · ${active.length} saved service orders. Spare parts are bought in Trade; nothing is purchased automatically.`;
    const alert=$('#maintenance-alert');alert.hidden=!report.enabled||!due.length;const alertMarkup=itemIcon('tools')+`<span>${failed.length?failed.length+' need repair':due.length+' need service'}<small>Village upkeep</small></span>`;if(alert.innerHTML!==alertMarkup)alert.innerHTML=alertMarkup;
    const equipment=[...report.equipment].sort((a,b)=>Number(b.failed)-Number(a.failed)||Number(b.service_due)-Number(a.service_due));
    const rows=equipment.map(row=>{
      const key=JSON.stringify(row.equipment),service=active.find(r=>same(r.job.equipment,row.equipment)),worker=service&&s.residents.find(r=>r.task==='utility'&&r.activity_material===service.job.id);
      const stage=service?service.job.paused?'Service paused':worker?`${worker.name} ${Math.hypot(worker.x-worker.target_x,worker.y-worker.target_y)>.08?'on the way':'servicing this unit'}`:service.phase==='awaiting_parts'?'Waiting for local delivery':'Waiting for neighbours':row.failed?'Repair needed':row.service_due?'Service recommended':'In good condition';
      const buttons=(action,label,disabled=false)=>`<button data-service-action="${action}" data-equipment="${escape(key)}" ${disabled?'disabled':''}>${label}</button>`;
      const canBuy=service&&service.missing.some((n,i)=>n>0&&s.environment.economy.shortage[i]>0);
      const progress=service?`<p>${Math.floor(service.job.work/service.labour_minutes*100)}% serviced · ${Math.ceil(service.labour_minutes-service.job.work)} attended minutes left</p>`:'';
      const parts=service?`<p class="service-parts">Kit: ${escape(bundle(service.kit,materials))}<br>Here: ${escape(bundle(service.here,materials))}${service.incoming.some(Boolean)?'<br>Coming: '+escape(bundle(service.incoming,materials)):''}${service.missing.some(Boolean)?'<br>Still to deliver: '+escape(bundle(service.missing,materials)):''}</p>`:'';
      const note=row.in_service?'Equipment is stopped while service is underway.':row.automatic_deferred?'Automatic rebooking deferred. Schedule manually when ready.':row.estimated_days_to_service!=null&&!row.service_due?`At average use, around ${row.estimated_days_to_service} days until service.`:row.equipment.kind==='truck'&&row.failed?'Use town delivery while the pickup needs repair.':'';
      return `<article class="service-record" data-equipment-kind="${row.equipment.kind}" data-failed="${row.failed}"><div class="service-heading">${itemIcon(row.equipment.kind==='battery'?'batteries':row.equipment.kind==='pump'?'pumps':'tools')}<div><h4>${escape(row.name)}</h4><small>${escape(context(row.equipment,v))}</small></div><b>${Math.round(row.condition)}%</b></div><progress max="100" value="${row.condition.toFixed(1)}" aria-label="${escape(row.name)} condition"></progress><p class="service-stage">${escape(stage)}</p>${progress}${parts}${note?'<p>'+escape(note)+'</p>':''}<div class="service-actions">${buttons('locate','Locate')}${service?buttons('pause',service.job.paused?'Resume service':'Pause service')+buttons('cancel','Cancel service')+(canBuy?buttons('parts','Find missing parts in Trade'):''):buttons('queue','Schedule service',!report.enabled||!row.service_due)}</div></article>`;
    }).join('');if(list._markup!==rows){
      const focused=list.contains(document.activeElement)?{key:document.activeElement.dataset.equipment,action:document.activeElement.dataset.serviceAction}:null;
      list.innerHTML=rows;list._markup=rows;
      if(focused)for(const button of list.querySelectorAll('[data-service-action]'))if(button.dataset.equipment===focused.key&&button.dataset.serviceAction===focused.action){button.focus({preventScroll:true});break;}
    }
  }};
}
