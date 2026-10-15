const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={camp:'Arrival barrels',well:'Cistern',home:'Home',kitchen:'Kitchen',garden:'Garden',greenhouse:'Greenhouse',eco_toilet:'Ecological toilet',wetland:'Reed bed',biodigester:'Biodigester',banana_treatment:'Banana treatment bed',source_timber:'Timber plot',source_bamboo:'Bamboo patch'};
const number=n=>Number(n.toFixed(n>0&&n<.1?3:1)).toLocaleString('en');
let preview=null,previewKey='',revision=0;
const previewVisible=()=>!!preview&&!document.getElementById('supplies-panel')?.hidden&&!!document.getElementById('water-networks')?.open&&!!document.getElementById('water-line-planner')?.open;
export const waterOverlayRevision=()=>`${revision}:${previewVisible()}`;
export function installWaterConnections({game,snapshot,transact,openTown}){
  const $=id=>document.getElementById(id),kind=$('pipe-kind'),from=$('pipe-from'),to=$('pipe-to'),rows=$('water-lines');
  let optionKey='',rowKey='';
  const parts=(items,s)=>items.map((n,i)=>n?`${n} ${s.environment.economy.materials[i].name.toLowerCase()}`:'').filter(Boolean).join(' · ')||'None';
  const label=p=>`${names[p.kind]||'Growing plot'} · ${p.x}, ${p.y}`;
  function setText(el,text){if(el.textContent!==text)el.textContent=text;}
  function update(s){
    const endpoints=JSON.parse(game().utility_endpoints(kind.value)).endpoints;
    const owner=p=>p.id===-1?{kind:'camp'}:p.id>=0?{kind:'building',id:p.id}:{kind:'source',id:-p.id-2};
    const compatible=p=>{const o=owner(p);return s.village.water_supply.tanks.some(t=>t.owner.kind===o.kind&&t.owner.id===o.id&&t.capacity[['fresh','irrigation','greywater','sewage'].indexOf(kind.value)]>0);};
    const sources=endpoints.filter(p=>p.supply&&compatible(p)),destinations=endpoints.filter(p=>p.receive&&compatible(p));
    const options=JSON.stringify([kind.value,sources,destinations]);
    if(options!==optionKey){
      optionKey=options;
      for(const [select,choices]of [[from,sources],[to,destinations]]){
        const old=select.value;
        select.innerHTML=choices.map(p=>`<option value="${p.id}" ${p.ready?'':'disabled'}>${escape(label(p))}${p.ready?'':' · building work'}</option>`).join('');
        select.disabled=!choices.length;
        if(choices.some(p=>String(p.id)===old))select.value=old;
        else select.value=String(choices.find(p=>p.ready&&p.kind==='well')?.id??choices.find(p=>p.ready)?.id??choices[0]?.id??'');
      }
    }
    const quote=sources.length&&destinations.length?JSON.parse(game().water_connection_quote(kind.value,Number(from.value),Number(to.value))):{allowed:false,reason:!sources.length?({irrigation:'Finish a reed bed before planning reclaimed irrigation.',greywater:'Finish a home, kitchen or toilet to collect its greywater.',sewage:'Finish an ecological toilet to collect its sealed sewage.'}[kind.value]||'Finish an available water source first.'):({greywater:'Finish a reed bed to receive greywater.',sewage:'Finish a banana treatment bed or biodigester to receive sewage.'}[kind.value]||'Finish a home, kitchen, toilet or growing plot to supply.')};
    $('pipe-queue').disabled=!quote.allowed;
    let text=quote.reason;
    if(quote.allowed){
      const missing=quote.parts.map((n,i)=>Math.max(0,n-s.environment.economy.materials[i].available));
      const availability=missing.every((n,i)=>n===quote.parts[i])?'The whole kit needs sourcing.':missing.some(Boolean)?`Still needed: ${parts(missing,s)}.`:'The kit is available; residents still need to deliver it.';
      text=`${quote.plan.cells.length} corridor cells · ${quote.labour_minutes} minutes of attended work, plus travel. Kit: ${parts(quote.parts,s)}. ${availability} Pump: up to ${quote.flow_per_hour} units/hour · ${number(quote.flow_per_hour*quote.energy_per_water)} energy/hour while pumping.`;
      if(!s.environment.power.capacity)text+=' Build a solar farm or river generator before the pump can run.';
    }
    setText($('pipe-quote'),text);
    const nextPreview=quote.allowed?quote.plan:null,key=JSON.stringify(nextPreview);
    if(key!==previewKey){previewKey=key;preview=nextPreview;revision++;}
    const report=JSON.parse(game().water_connections()),live=report.lines.filter(r=>r.line.phase!=='retired'||r.line.replacement),history=report.lines.filter(r=>r.line.phase==='retired'&&!r.line.replacement).slice(-3);
    setText($('water-line-summary'),`${live.filter(r=>r.line.phase==='active').length} installed · ${live.filter(r=>r.line.phase!=='active').length} queued or changing. Pipes transfer compatible local contents only after installation; closed service containers remain available for greywater and sewage.`);
    $('water-buy-parts').disabled=!s.environment.economy.shortage.some(Boolean);
    const markup=[...live,...history].map(row=>{
      const p=row.line,ended=p.phase==='retired',removing=p.phase==='removing',working=s.residents.find(r=>r.task==='utility'&&r.activity_material===p.id);
      const store=s.village.logistics?.stores.find(store=>store.owner.kind==='utility'&&store.owner.id===p.id);
      const deliveries=s.village.logistics?.shipments.filter(h=>h.to===store?.id)||[];
      const deliveryText=deliveries.map(h=>`${s.residents.find(r=>r.id===h.resident).name} is ${h.carrying?'carrying':'collecting'} ${h.amount} ${s.environment.economy.materials[h.material].name.toLowerCase()}`).join(' · ');
      const amount=removing?p.removal_work:p.work,total=removing?row.removal_minutes:row.labour_minutes;
      const state=p.paused?'Paused':({awaiting_inputs:'Waiting for the kit',installing:'Laying the line',active:'Installed',removing:'Dismantling',retired:p.replacement?'Replacement pending':'Removed'})[p.phase];
      return `<article class="production-worksite" data-water-line="${p.id}"><div class="production-title"><h4>${escape(label(p.anchors[0]))} → ${escape(label(p.anchors[1]))}</h4>${ended?'':`<button data-pipe-action="pause" data-pipe-id="${p.id}" aria-label="${p.paused?'Resume':'Pause'} water line">${p.paused?'Resume':'Pause'}</button>`}</div><b>${kindName(p.plan.kind)} · ${state}</b><p>${escape(row.reason)}</p>${working?`<p>${escape(working.name)} is ${Math.hypot(working.x-working.target_x,working.y-working.target_y)>.08?'on the way':'working along this route'}.</p>`:''}${!ended&&p.phase!=='active'?`<progress value="${amount}" max="${total}" aria-label="Water line work progress"></progress><small>${number(amount)} / ${total} minutes of work saved</small>`:''}<p>${number(p.transferred)} units transferred · ${number(p.energy_used)} energy used</p>${p.spent?'':`<p>Kit delivered here: ${escape(parts(row.parts_here,s))}</p>${deliveryText?`<p>${escape(deliveryText)}</p>`:''}`}<details><summary>Parts & recovery</summary><p>Installation kit: ${escape(parts(p.kit,s))}</p><p>Residents recover the pump and half the other parts when dismantling. Unused parts remain owned if an unstarted installation is cancelled. Recovery waits safely when storage is full.</p></details>${ended?'':`<div class="project-actions"><label>Priority<select data-pipe-id="${p.id}" data-pipe-action="priority" aria-label="Water line priority">${['Low','Normal','High','First'].map((t,i)=>`<option value="${i}" ${p.priority===i?'selected':''}>${t}</option>`).join('')}</select></label>${removing?'':`<button data-pipe-action="remove" data-pipe-id="${p.id}">${p.spent?'Dismantle line':'Cancel installation'}</button>`}</div>`}</article>`;
    }).join('');
    if(markup!==rowKey&&!rows.contains(document.activeElement)){rowKey=markup;rows.innerHTML=markup;}
  }
  for(const control of [kind,from,to])control.onchange=()=>update(snapshot());
  $('pipe-queue').onclick=()=>transact(game().queue_water_connection(kind.value,Number(from.value),Number(to.value)));
  $('water-buy-parts').onclick=()=>{openTown();document.getElementById('town-shortages').click();};
  rows.addEventListener('click',e=>{
    const button=e.target.closest('button[data-pipe-action]');if(!button)return;
    const p=snapshot().village.pipes.lines.find(p=>p.id===Number(button.dataset.pipeId));if(!p)return;
    button.blur();transact(button.dataset.pipeAction==='remove'?game().remove_water_connection(p.id):game().configure_water_connection(p.id,p.priority,!p.paused));
  });
  rows.addEventListener('change',e=>{
    const select=e.target.closest('select[data-pipe-action="priority"]');if(!select)return;
    const p=snapshot().village.pipes.lines.find(p=>p.id===Number(select.dataset.pipeId));if(!p)return;
    const priority=Number(select.value);select.blur();transact(game().configure_water_connection(p.id,priority,p.paused));
  });
  rows.addEventListener('focusout',()=>queueMicrotask(()=>update(snapshot())));
  return {update};
}
function kindName(kind){return {fresh:'Fresh water',irrigation:'Reclaimed irrigation',greywater:'Greywater',sewage:'Sealed sewage'}[kind];}
export function drawWaterConnections(ctx,iso,scale,state){
  const enabled=!!document.getElementById('pipe-overlay')?.checked,live=state.village.pipes.lines.filter(p=>p.phase!=='retired');
  const showPreview=previewVisible();
  for(const [key,value]of Object.entries({waterLines:enabled?live.length:0,waterPreview:enabled&&showPreview}))if(ctx.canvas.dataset[key]!==String(value))ctx.canvas.dataset[key]=String(value);
  if(!enabled)return;
  ctx.save();ctx.lineJoin='round';ctx.lineCap='round';
  const paint=(plan,color,dashed)=>{
    const points=[plan.start.edge,...plan.cells,plan.end.edge].map(([x,y])=>iso(x,y));
    ctx.strokeStyle='#263d32bb';ctx.lineWidth=Math.max(3,5*scale);ctx.setLineDash([]);ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();
    ctx.strokeStyle=color;ctx.lineWidth=Math.max(1.5,2.5*scale);ctx.setLineDash(dashed?[6*scale,4*scale]:[]);ctx.stroke();
    ctx.setLineDash([]);ctx.fillStyle='#d9ba7f';ctx.strokeStyle='#5f492c';ctx.lineWidth=1;
    const p=points[1];ctx.beginPath();ctx.arc(p.x,p.y,Math.max(3,5*scale),0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.strokeStyle=color;ctx.beginPath();ctx.moveTo(p.x-3*scale,p.y);ctx.lineTo(p.x+3*scale,p.y);ctx.stroke();
  };
  for(const p of live)paint(p.plan,p.paused?'#bab69b':p.phase==='removing'?'#c27d50':p.phase==='active'?({fresh:'#7bb8c8',irrigation:'#9dbb68',greywater:'#b99dbb',sewage:'#c6a06a'}[p.plan.kind]):'#d4ad65',p.phase!=='active');
  if(showPreview)paint(preview,'#e6dbaa',true);
  ctx.restore();
}
