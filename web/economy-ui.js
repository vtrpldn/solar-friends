const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:n%100?2:0,maximumFractionDigits:2}).format(n/100);
const time=t=>`Day ${Math.floor(t/1440)+1} · ${String(Math.floor(t%1440/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={home:'Home',garden:'Garden',greenhouse:'Greenhouse',kitchen:'Kitchen',well:'Cistern',grove:'Food forest',compost:'Compost',square:'Square',workshop:'Workshop',coop:'Chicken coop',solar_farm:'Solar farm',streetlight:'Street light'};
export function recipeSummary(state,kind){
  const e=state.environment.economy,r=e.recipes.find(r=>r.kind===kind);if(!r)return 'Free';
  const total=Array(15).fill(0);for(const s of r.standard)for(let i=0;i<15;i++)total[i]+=s.items[i];
  return total.map((n,i)=>n?`${n} ${e.materials[i].name.toLowerCase()}`:'').filter(Boolean).join(' · ');
}
export function installEconomyUI({snapshot,game,changed,notify,locate,openTown}){
  const $=s=>document.querySelector(s);let lastProjects='',lastInventory='',lastOrders='',lastLand='';
  const transact=result=>{if(result!=='ok')notify(result);else{changed();update();}};
  const materials=snapshot().environment.economy.materials;
  $('#town-catalog').innerHTML=materials.map(m=>`<label class="town-item"><span><b>${m.name}</b><small>${money(m.price)} / unit</small></span><input type="number" min="0" max="100" step="1" value="0" aria-label="Order ${m.name}" data-material="${m.id}"></label>`).join('');
  $('#spare-material').innerHTML=materials.map(m=>`<option value="${m.id}">${m.name}</option>`).join('');
  function spareQuote(){const e=snapshot().environment.economy,m=e.materials[Number($('#spare-material').value)],n=Number($('#spare-quantity').value),valid=Number.isInteger(n)&&n>0&&n<=20&&n<=m.available;$('#sell-material').disabled=!valid;$('#spare-quote').textContent=`${m.available} unreserved units · ${valid?money(Math.floor(n*m.price/2))+' contribution':'choose 1–20 available units'}`;}
  $('#spare-material').onchange=spareQuote;$('#spare-quantity').oninput=spareQuote;
  $('#sell-material').onclick=()=>transact(game().sell_material(Number($('#spare-material').value),Number($('#spare-quantity').value)));
  $('#project-list').addEventListener('focusout',()=>queueMicrotask(update));
  const basket=()=>Array.from({length:15},(_,i)=>Number($(`[data-material="${i}"]`).value));
  function quote(){const s=snapshot(),e=s.environment.economy,items=basket(),valid=items.every(n=>Number.isInteger(n)&&n>=0&&n<=100),quantity=items.reduce((a,b)=>a+b,0),total=items.reduce((a,n,i)=>a+n*e.materials[i].price,0)+(quantity?6000:0);
    $('#town-total').textContent=money(total);$('#town-delivery').textContent=quantity?'Includes R$ 60 delivery · dispatch in two game hours, arrival at 10:00 after dispatch.':'Combine purchases for several projects in one delivery.';
    $('#town-order').disabled=!valid||!quantity||e.money<total||e.used+quantity>e.capacity;
    $('#town-basket-status').textContent=!valid?'Use whole quantities from 0 to 100.':e.money<total?'The fund is too small. Enable an outside shift or sell surplus.':e.used+quantity>e.capacity?'Receiving space is full; use stored materials first.':quantity?`${quantity} ${quantity===1?'unit':'units'} · ${e.capacity-e.used-quantity} receiving spaces left`:'Choose supplies or fill this list from village needs.';
  }
  $('#town-catalog').addEventListener('input',quote);
  $('#town-shortages').onclick=()=>{const e=snapshot().environment.economy;for(let i=0;i<15;i++)$(`[data-material="${i}"]`).value=Math.min(e.shortage[i],100);quote();};
  $('#town-clear').onclick=()=>{for(const input of $('#town-catalog').querySelectorAll('input'))input.value=0;quote();};
  $('#town-order').onclick=()=>{const result=game().order_supplies(JSON.stringify(basket()));if(result==='ok')$('#town-clear').click();transact(result);};
  $('#outside-work').onchange=event=>{game().set_outside_work(event.target.checked);changed();update();};
  $('#sell-surplus').onclick=()=>transact(game().sell_surplus(Math.min(20,snapshot().environment.economy.saleable_food)));
  $('#exchange-parts').onclick=()=>transact(game().exchange_parts());
  $('#town-orders').onclick=event=>{const button=event.target.closest('[data-cancel-order]');if(button)transact(game().cancel_order(Number(button.dataset.cancelOrder)));};
  $('#project-list').onclick=event=>{
    const button=event.target.closest('button');if(!button)return;const id=Number(button.dataset.project),p=snapshot().environment.economy.projects.find(p=>p.building===id);if(!p)return;
    if(button.dataset.action==='locate')locate(id);
    if(button.dataset.action==='supplies'){openTown();$('#town-shortages').click();$('#town-shortages').focus();}
    if(button.dataset.action==='pause')transact(game().configure_project(id,p.priority,!p.paused,p.recipe));
    if(button.dataset.action==='cancel'){$('#project-cancel-note').textContent=`Cancel ${names[p.kind]} ${id+1}? Unused reservations return in full. Half of each consumed material can be salvaged. Town orders continue unless cancelled separately.`;$('#project-cancel-confirm').dataset.project=id;$('#project-cancel-dialog').showModal();}
  };
  $('#project-cancel-close').onclick=()=>$('#project-cancel-dialog').close();
  $('#project-cancel-confirm').onclick=()=>{transact(game().cancel_project(Number($('#project-cancel-confirm').dataset.project)));$('#project-cancel-dialog').close();};
  $('#project-list').onchange=event=>{const input=event.target.closest('select');if(!input)return;const id=Number(input.dataset.project),p=snapshot().environment.economy.projects.find(p=>p.building===id);if(p)transact(game().configure_project(id,input.dataset.action==='priority'?Number(input.value):p.priority,p.paused,input.dataset.action==='recipe'?input.value:p.recipe));};
  $('#land-sources').onclick=event=>{const button=event.target.closest('[data-restore-source]');if(button)transact(game().restore_source(Number(button.dataset.restoreSource)));};
  function update(){
    const s=snapshot(),e=s.environment.economy,v=s.village;
    $('#fund').textContent=money(e.money);$('#town-fund').textContent=money(e.money);$('#outside-work').checked=e.outside_work;
    $('#sell-surplus').disabled=e.saleable_food===0;$('#sell-surplus').textContent=e.saleable_food?`Sell ${Math.min(20,e.saleable_food)} surplus ingredients`:'36 ingredients stay for the household';
    $('#exchange-parts').disabled=!e.exchange_available||v.food<40||e.used+2>e.capacity;
    $('#storage-summary').textContent=`${e.used} / ${e.capacity} spaces · including confirmed deliveries`;
    $('#project-summary').textContent=e.projects.length?`${e.projects.length} active ${e.projects.length===1?'project':'projects'} · work follows normal community hours`:'Plan a building to start a shared project. Blueprints are free.';
    $('#property-description').textContent=e.property;
    $('#preparation-recipes').innerHTML=`<p>${e.workshop?'Workshop preparation includes roof tiles and efficient salvage recovery.':'Residents prepare frames, wall material and fittings at the camp. A workshop adds roof tiles and more efficient salvage recovery.'}</p>`+e.preparation.map(r=>`<p class="recipe-stage"><b>${r.yield} ${e.materials[r.material].name.toLowerCase()}</b>${r.inputs.map((n,i)=>n?`${n} ${e.materials[i].name.toLowerCase()}`:'').filter(Boolean).join(' · ')}</p>`).join('');
    const projectKey=JSON.stringify(e.projects.map(p=>({...p,labour:Math.floor(p.labour),progress:Math.floor(p.progress)})));
    if(projectKey!==lastProjects&&!($('#project-list').contains(document.activeElement)&&document.activeElement.matches('select,input'))){
      const focused=$('#project-list').contains(document.activeElement)?{id:document.activeElement.dataset.project,action:document.activeElement.dataset.action}:null;
      const expanded=[...$('#project-list').querySelectorAll('details[open]')].map(d=>d.closest('.project-card').querySelector('[data-project]').dataset.project);
      lastProjects=projectKey;$('#project-list').innerHTML=e.projects.map(p=>{
        const missing=p.missing.map((n,i)=>n?`${n} ${e.materials[i].name.toLowerCase()}`:'').filter(Boolean),inTransit=p.missing.some((n,i)=>n&&e.materials[i].incoming),hasConsumed=p.consumed.some(n=>n),r=e.recipes.find(r=>r.kind===p.kind),alternative=JSON.stringify(r.standard)!==JSON.stringify(r.local);
        const status=p.paused?'Paused · unused reservations released':p.ready?`Ready for community work · ${Math.ceil(p.work-p.labour)} labour left`:inTransit?'Waiting for incoming supplies':`Source, prepare or purchase: ${missing.join(', ')}`;
        return `<article class="project-card"><div class="project-title"><h3>${names[p.kind]} <small>${p.building+1}</small></h3><button data-project="${p.building}" data-action="locate">Locate</button></div><div class="project-stage"><b>${p.stage}</b><span>${Math.floor(p.progress)}%</span></div><progress value="${p.progress}" max="100" aria-label="${names[p.kind]} construction"></progress><p>${status}</p>${!p.paused&&!p.ready?`<button class="project-supply-link" data-project="${p.building}" data-action="supplies">Review town supplies</button>`:''}<details><summary>Stages & materials</summary>${p.stages.map((s,i)=>`<p class="recipe-stage"><b>${i<p.stage_index?'✓ ':''}${s.name}</b>${s.items.map((n,j)=>n?`${n} ${e.materials[j].name.toLowerCase()}`:'').filter(Boolean).join(' · ')}</p>`).join('')}</details><div class="project-actions"><label>Priority<select data-project="${p.building}" data-action="priority">${[0,1,2,3].map((n)=>`<option value="${n}" ${n===p.priority?'selected':''}>${['Low','Normal','High','First'][n]}</option>`).join('')}</select></label><label>Method<select data-project="${p.building}" data-action="recipe" ${hasConsumed||!alternative?'disabled':''}><option value="standard" ${p.recipe==='standard'?'selected':''}>Prepared materials</option><option value="local" ${p.recipe==='local'?'selected':''}>Local materials</option></select></label><button data-project="${p.building}" data-action="pause">${p.paused?'Resume':'Pause'}</button><button data-project="${p.building}" data-action="cancel">Cancel</button></div></article>`;
      }).join('')||'<div class="economy-empty">Every journey starts with a blueprint.<p>Open Build and choose a clearing. Projects reserve the next stage’s materials.</p></div>';
      if(focused?.id){const target=$(`#project-list [data-project="${focused.id}"][data-action="${focused.action}"]`);(target||$('#projects-panel [data-close-panel]')).focus({preventScroll:true});}
      for(const id of expanded){const card=$(`#project-list [data-project="${id}"]`)?.closest('.project-card');if(card)card.querySelector('details').open=true;}
    }
    const inventoryKey=JSON.stringify(e.materials);if(inventoryKey!==lastInventory){lastInventory=inventoryKey;$('#material-inventory').innerHTML=`<table><thead><tr><th>Material</th><th>Stored</th><th>Reserved</th><th>Free</th><th>Incoming</th></tr></thead><tbody>${e.materials.map(m=>`<tr><th>${m.name}</th><td>${m.stored}</td><td>${m.reserved}</td><td>${m.available}</td><td>${m.incoming||'—'}</td></tr>`).join('')}</tbody></table>`;}
    const orderKey=JSON.stringify(v.economy.orders);if(orderKey!==lastOrders){lastOrders=orderKey;$('#town-orders').innerHTML=[...v.economy.orders].reverse().map(o=>`<article class="order-row"><div><b>Order ${o.id+1} · ${money(o.paid)}</b><small>${o.items.map((n,i)=>n?`${n} ${e.materials[i].name.toLowerCase()}`:'').filter(Boolean).join(' · ')}</small><span>${o.status==='cancelled'?'Cancelled · fully refunded':o.status==='delivered'?'Delivered to the receiving area':`${o.status==='confirmed'?'Awaiting dispatch':'On the way'} · arrives ${time(o.arrival)}`}</span></div>${o.status==='confirmed'?`<button data-cancel-order="${o.id}">Cancel & refund</button>`:''}</article>`).join('')||'<p>No orders yet. Confirm a combined delivery when you need supplies.</p>';}
    $('#fund-ledger').innerHTML=[...v.economy.ledger].reverse().slice(0,12).map(l=>`<div class="ledger-row"><span>${escape(l.note)}<small>${time(l.minute)}</small></span><b>${l.amount>0?'+':''}${money(l.amount)}</b></div>`).join('');
    const landKey=JSON.stringify(v.economy.sources.map(s=>({...s,remaining:Math.floor(s.remaining)})));if(landKey!==lastLand){lastLand=landKey;$('#land-sources').innerHTML=v.economy.sources.map((s,i)=>`<article class="source-row"><div><b>${e.materials[s.material].name}</b><small>${Math.floor(s.remaining)} / ${s.maximum} locally available · ${s.material<=1?(s.restored?'restored · 3 units/day':'managed · 1 unit/day'):'finite deposit'}</small></div>${s.material<=1?`<button data-restore-source="${i}" ${s.restored||v.progress.compost<2?'disabled':''}>${s.restored?'Restored':'Restore · 2 compost'}</button>`:''}</article>`).join('');}
    quote();spareQuote();
  }
  update();return {update};
}
