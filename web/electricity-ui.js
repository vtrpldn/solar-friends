import {paintUtilityRoute} from './utility-lines-art.js';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={solar_farm:'Solar farm',hydro:'River generator',home:'Home',streetlight:'Street light',workshop:'Workshop',well:'Cistern',kitchen:'Kitchen',greenhouse:'Greenhouse',warehouse:'Storage house',square:'Square',coop:'Chicken coop',eco_toilet:'Ecological toilet',pump:'Water pump',battery:'Recovered battery'};
const number=n=>Number(n.toFixed(n>0&&n<.1?3:1)).toLocaleString('en');
let preview=null,revision=0,previewKey='';
const previewVisible=()=>!!preview&&!document.getElementById('power-panel')?.hidden&&!!document.getElementById('cable-planner')?.open;
export const electricalOverlayRevision=()=>`${revision}:${previewVisible()}`;
export function installElectricityUI({game,snapshot,transact,openTown,focusUtility,moveBattery}){
  const $=id=>document.getElementById(id),host=$('electrical-network'),from=$('cable-from'),to=$('cable-to'),rows=$('electrical-lines');
  let optionsKey='',rowsKey='',circuitsKey='',banksKey='';
  const parts=(bundle,s)=>bundle.map((n,i)=>n?`${n} ${s.environment.economy.materials[i].name.toLowerCase()}`:'').filter(Boolean).join(' · ')||'None';
  const label=(endpoint,s)=>{
    const node=s.village.power.network.nodes.find(n=>n.id===endpoint.id);
    return node?.owner.kind==='building'?`${names[endpoint.kind]||endpoint.kind} ${node.owner.id+1}`:`${names[endpoint.kind]||endpoint.kind} at ${endpoint.x}, ${endpoint.y}`;
  };
  const anchorLabel=(a,s)=>label({...a,id:a.endpoint},s);
  const setText=(el,value)=>{if(el.textContent!==value)el.textContent=value;};
  function update(s){
    host.hidden=typeof game().electrical_connection_quote!=='function';
    if(host.hidden||$('power-panel').hidden)return;
    const report=JSON.parse(game().electricity_report()),endpoints=report.endpoints;
    const banks=report.network.nodes.filter(n=>['ground','carrier'].includes(n.owner.kind));
    const jobs=report.batteries?.jobs||[],bankList=$('battery-banks');
    $('recovered-batteries').hidden=typeof game().queue_battery_work!=='function'||(!banks.length&&!jobs.length);
    const bankMarkup=banks.map(n=>{
      const job=jobs.find(j=>j.bank===n.id&&!['complete','cancelled'].includes(j.phase));
      const carrier=n.owner.kind==='carrier'?s.residents.find(r=>r.id===n.owner.id):null;
      const worker=job?s.residents.find(r=>r.task==='utility'&&r.activity_material===job.id):null;
      const phase=job?({packing:'Packing',carrying:'In transit',installing:'Installing',salvaging:'Careful salvage'})[job.phase]:'Ready to connect';
      const total=({packing:12,installing:18,salvaging:36})[job?.phase];
      return `<article class="production-worksite" data-battery="${n.id}"><div class="production-title"><h4>Battery ${n.id} · ${carrier?`with ${esc(carrier.name)}`:`${n.x}, ${n.y}`}</h4><button data-battery-action="locate" data-battery-id="${n.id}">Locate</button></div><b>${phase}</b><p>${number(n.charge)} / ${n.capacity} energy · ${n.equipment?'one reusable battery unit recorded':'no purchased equipment recorded'}</p>${job?`<p>${job.destination?`Moving to ${job.destination.join(', ')}. `:''}${worker?`${esc(worker.name)} is ${job.phase==='carrying'?'carrying the bank':Math.hypot(worker.x-worker.target_x,worker.y-worker.target_y)>.08?'on the way':'working'}.`:'Waiting for an available neighbour during community hours.'}</p>${total?`<progress value="${job.work}" max="${total}" aria-label="Battery ${n.id} ${job.phase} progress"></progress><small>${number(job.work)} / ${total} minutes of work saved</small>`:''}${['packing','salvaging'].includes(job.phase)?`<button data-battery-action="cancel" data-battery-id="${job.id}">Cancel battery work</button>`:''}`:`<div class="project-actions"><button data-battery-action="move" data-battery-id="${n.id}">Move battery</button></div><details><summary>Salvage battery</summary><p>A neighbour spends 36 minutes dismantling this bank. ${number(n.charge)} energy will be discharged; ${n.equipment?'one reusable battery unit will remain here for collection':'no materials will be returned because this equipment was placed free'}.</p><button data-battery-action="salvage" data-battery-id="${n.id}">Queue careful salvage</button></details>`}</article>`;
    }).join('')+jobs.filter(j=>j.phase==='complete'&&j.action==='salvage').slice(-2).map(j=>`<p>Battery ${j.bank} salvaged · ${j.recovered?'one reusable unit recovered':'no paid equipment to return'}.</p>`).join('');
    if(bankMarkup!==banksKey&&!bankList.contains(document.activeElement)){banksKey=bankMarkup;bankList.innerHTML=bankMarkup;}
    const byId=id=>endpoints.find(e=>e.id===id);
    const options=JSON.stringify(endpoints.map(e=>[e.id,e.kind,e.x,e.y,e.ready]));
    if(options!==optionsKey){
      optionsKey=options;
      for(const [select,first]of [[from,true],[to,false]]){
        const old=select.value;
        select.innerHTML=endpoints.map(e=>`<option value="${e.id}" ${e.ready?'':'disabled'}>${esc(label(e,s))}${e.ready?'':' · building work'}</option>`).join('');
        const preferred=endpoints.find(e=>e.ready&&(first?['solar_farm','hydro','battery'].includes(e.kind):!['solar_farm','hydro','battery'].includes(e.kind)));
        select.value=endpoints.some(e=>String(e.id)===old)?old:String(preferred?.id??endpoints.find(e=>e.ready)?.id??'');select.disabled=!endpoints.length;
      }
    }
    const quote=endpoints.length>1?JSON.parse(game().electrical_connection_quote(Number(from.value),Number(to.value))):{allowed:false,reason:'A cable needs two finished electrical ports. Add a shared building, light or generator; rooftop batteries stay private.'};
    $('cable-queue').disabled=!quote.allowed;$('cable-locate').disabled=!quote.allowed;
    let quoteText=quote.reason;
    if(quote.allowed){
      const missing=quote.parts.map((n,i)=>Math.max(0,n-s.environment.economy.materials[i].available));
      quoteText=`${quote.plan.cells.length} corridor cells · ${quote.labour_minutes} minutes of attended work, plus travel. Kit: ${parts(quote.parts,s)}. ${missing.some(Boolean)?`Still needed: ${parts(missing,s)}.`:'Parts are available; neighbours still need to deliver them.'} Capacity: ${quote.energy_per_hour} energy/hour in either direction. The route supplies power only after commissioning.`;
    }
    setText($('cable-quote'),quoteText);
    const next=quote.allowed?quote.plan:null,key=JSON.stringify(next);if(key!==previewKey){previewKey=key;preview=next;revision++;}
    const shared=report.circuits.filter(c=>!c.private_roof),powered=shared.filter(c=>c.capacity>0),isolated=shared.filter(c=>c.capacity===0);
    const isolatedCount=isolated.reduce((n,c)=>n+c.nodes.length,0);
    setText($('circuit-summary'),`${powered.length} ${powered.length===1?'circuit has':'circuits have'} storage · ${isolatedCount} ${isolatedCount===1?'port':'ports'} without a connected battery. Pumps run first, then attended workshop tools, then lighting. Rooftop energy stays with its home.`);
    const circuits=powered.map(c=>{
      const nodes=c.nodes.map(byId).filter(Boolean),source=nodes.find(n=>['solar_farm','hydro','battery'].includes(n.kind))||nodes[0];
      return `<article class="electrical-circuit"><h4>${esc(source?label(source,s):'Shared circuit')}</h4><div class="power-battery-label"><b>${number(c.stored)} / ${c.capacity} energy</b><span>${number(c.generation)} generated/hour</span></div><progress value="${c.stored}" max="${c.capacity}" aria-label="${esc(source?label(source,s):'Circuit')} stored energy"></progress><p>${nodes.map(n=>esc(label(n,s))).join(' · ')}</p><small>${number(c.full_night_lighting)} energy/hour with all enabled lights after dusk${c.pump_demand?` · pumps request ${number(c.pump_demand)}/hour`:''}${c.powered_tools_when_attended?` · tools use up to ${number(c.powered_tools_when_attended)}/hour while attended`:''}. Cable capacity can limit individual routes.</small></article>`;
    }).join('')||'<p>No shared battery circuit yet. Build a solar farm or river generator; existing recovered batteries can also be connected.</p>';
    if(circuits!==circuitsKey){circuitsKey=circuits;$('electrical-circuits').innerHTML=circuits;}
    const live=report.connections.lines.filter(r=>r.line.phase!=='retired'||r.line.replacement),history=report.connections.lines.filter(r=>r.line.phase==='retired'&&!r.line.replacement).slice(-2);
    const missing=Array(s.environment.economy.materials.length).fill(0);
    for(const row of live.filter(r=>!r.line.spent)){
      const store=s.village.logistics.stores.find(p=>p.owner.kind==='utility'&&p.owner.id===row.line.id);
      for(let i=0;i<missing.length;i++)missing[i]+=Math.max(0,row.line.kit[i]-row.parts_here[i]-s.village.logistics.shipments.filter(h=>h.to===store?.id&&h.material===i).reduce((n,h)=>n+h.amount,0));
    }
    const buy=missing.map((n,i)=>Math.min(n,s.environment.economy.shortage[i]));
    $('cable-buy-parts').disabled=!buy.some(Boolean);$('cable-buy-parts').dataset.parts=JSON.stringify(buy);
    const markup=[...live,...history].map(row=>{
      const p=row.line,ended=p.phase==='retired',removing=p.phase==='removing',crew=s.residents.find(r=>r.task==='utility'&&r.activity_material===p.id);
      const state=p.paused?'Paused':({awaiting_inputs:'Waiting for the kit',installing:'Laying cable',active:'Commissioned',removing:'Dismantling',retired:p.replacement?'Replacement pending':'Removed'})[p.phase];
      const work=removing?p.removal_work:p.work,total=removing?row.removal_minutes:row.labour_minutes;
      return `<article class="production-worksite" data-electrical-line="${p.id}"><div class="production-title"><h4>${esc(anchorLabel(p.anchors[0],s))} ↔ ${esc(anchorLabel(p.anchors[1],s))}</h4>${ended?'':`<button data-cable-action="pause" data-cable-id="${p.id}" aria-label="${p.paused?'Resume':'Pause'} cable ${p.id}">${p.paused?'Resume':'Pause'}</button>`}</div><b>${state}</b><p>${esc(row.reason)}</p>${crew?`<p>${esc(crew.name)} is ${Math.hypot(crew.x-crew.target_x,crew.y-crew.target_y)>.08?'on the way':'working along this route'}.</p>`:''}${!ended&&p.phase!=='active'?`<progress value="${work}" max="${total}" aria-label="Cable ${p.id} work progress"></progress><small>${number(work)} / ${total} minutes of work saved</small>`:''}<p>${number(p.transferred)} energy transferred along this route · 12 energy/hour capacity</p>${p.spent?'':`<p>Kit delivered here: ${esc(parts(row.parts_here,s))}</p>`}<details><summary>Cable parts & recovery</summary><p>Kit: ${esc(parts(p.kit,s))}</p><p>Residents recover half of each installed material when dismantling. Unused delivered parts remain owned if installation is cancelled. Transfer meters count energy passing along each route; the circuit spends it once at its consumer.</p></details>${ended?'':`<div class="project-actions"><label>Installation priority<select data-cable-id="${p.id}" data-cable-action="priority" aria-label="Cable ${p.id} installation priority">${['Low','Normal','High','First'].map((t,i)=>`<option value="${i}" ${p.priority===i?'selected':''}>${t}</option>`).join('')}</select></label>${removing?'':`<button data-cable-action="remove" data-cable-id="${p.id}" aria-label="${p.spent?'Dismantle':'Cancel installation of'} cable ${p.id}">${p.spent?'Dismantle cable':'Cancel installation'}</button>`}</div>`}</article>`;
    }).join('');
    if(markup!==rowsKey&&!rows.contains(document.activeElement)){rowsKey=markup;rows.innerHTML=markup;}
  }
  for(const select of [from,to])select.onchange=()=>update(snapshot());
  $('cable-locate').onclick=()=>{if(preview){$('cable-overlay').checked=true;focusUtility(preview);}};
  $('cable-queue').onclick=()=>transact(game().queue_electrical_connection(Number(from.value),Number(to.value)));
  $('cable-buy-parts').onclick=()=>{
    const parts=JSON.parse($('cable-buy-parts').dataset.parts||'[]');openTown();$('town-clear').click();
    for(let i=0;i<parts.length;i++){const input=$('buy-'+i);if(input)input.value=String(Math.min(100,parts[i]));}
    $('town-catalog').dispatchEvent(new Event('input',{bubbles:true}));
  };
  rows.addEventListener('click',event=>{
    const b=event.target.closest('button[data-cable-action]');if(!b)return;
    const p=snapshot().village.pipes.lines.find(p=>p.id===Number(b.dataset.cableId));if(!p)return;
    b.blur();transact(b.dataset.cableAction==='remove'?game().remove_electrical_connection(p.id):game().configure_electrical_connection(p.id,p.priority,!p.paused));
  });
  rows.addEventListener('change',event=>{
    const select=event.target.closest('select[data-cable-action="priority"]');if(!select)return;
    const p=snapshot().village.pipes.lines.find(p=>p.id===Number(select.dataset.cableId));if(!p)return;
    const priority=Number(select.value);select.blur();transact(game().configure_electrical_connection(p.id,priority,p.paused));
  });
  rows.addEventListener('focusout',()=>queueMicrotask(()=>update(snapshot())));
  $('battery-banks').addEventListener('click',event=>{
    const button=event.target.closest('[data-battery-action]');if(!button)return;
    const id=Number(button.dataset.batteryId),action=button.dataset.batteryAction;
    button.blur();
    if(action==='move'){moveBattery(id);return;}
    if(action==='locate'){
      const s=snapshot(),n=s.village.power.network.nodes.find(n=>n.id===id);if(!n)return;
      const r=n.owner.kind==='carrier'?s.residents.find(r=>r.id===n.owner.id):n,point=[r.x,r.y];
      focusUtility({start:{edge:point},cells:[point],end:{edge:point}});return;
    }
    transact(action==='cancel'?game().cancel_battery_work(id):game().queue_battery_work(id,'salvage',0,0));
  });
  $('battery-banks').addEventListener('focusout',()=>queueMicrotask(()=>update(snapshot())));
  return {update};
}
export function drawElectricalConnections(ctx,iso,scale,state){
  const enabled=!!document.getElementById('cable-overlay')?.checked,live=state.village.pipes.lines.filter(p=>p.plan.kind==='electricity'&&p.phase!=='retired');
  const showPreview=previewVisible();
  for(const [key,value]of Object.entries({electricalLines:enabled?live.length:0,electricalPreview:enabled&&showPreview}))if(ctx.canvas.dataset[key]!==String(value))ctx.canvas.dataset[key]=String(value);
  if(!enabled)return;
  ctx.save();ctx.lineJoin='round';ctx.lineCap='round';
  for(const p of live)paintUtilityRoute(ctx,iso,scale,p.plan,p.paused?'#bab69b':p.phase==='removing'?'#c27d50':p.phase==='active'?'#e0c46b':'#e6dbaa',p.phase!=='active');
  if(showPreview)paintUtilityRoute(ctx,iso,scale,preview,'#f9edb7',true);
  ctx.restore();
}
