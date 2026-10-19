import {usesLogistics} from './sandbox-rules.js';
import {installSupplierUI} from './supplier-ui.js';
import {installElectricityUI} from './electricity-ui.js';
import {installProcessUI} from './process-ui.js';
import {installWaterUI} from './water-ui.js';
import {installWaterConnections} from './water-connections.js';
import {freshnessMarkup,freshnessWarning,expiryNote} from './freshness-ui.js';
import {itemIcon,materialIcons} from './game-ui.js';
import {createProjectForecasts} from './forecasts.js';
import {installProductionUI,productionSiteName} from './production-ui.js';
const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:n%100?2:0,maximumFractionDigits:2}).format(n/100);
const time=t=>`Day ${Math.floor(t/1440)+1} · ${String(Math.floor(t%1440/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={orchard:'Fruit orchard',goat_pasture:'Goat pasture',apiary:'Stingless bee apiary',hydro:'River generator',eco_toilet:'Ecological toilet',banana_treatment:'Banana treatment bed',wetland:'Reed bed',biodigester:'Biodigester',warehouse:'Storage house',home:'Home',garden:'Garden',greenhouse:'Greenhouse',kitchen:'Kitchen',well:'Cistern',grove:'Food forest',compost:'Compost',square:'Square',workshop:'Workshop',coop:'Chicken coop',solar_farm:'Solar farm',streetlight:'Street light'};
export function recipeSummary(state,kind,variant='standard'){
  const e=state.environment.economy,source=e.source_options?.find(s=>s.key===kind);if(source)return (!usesLogistics(state.village)?'Free plot':money(source.cost))+(source.planting_amount?` · ${source.planting_amount} ${e.materials[source.planting_material].name.toLowerCase()} delivered for resident planting`:'');
  const r=e.recipes.find(r=>r.kind===kind);if(!r)return 'Free';
  const total=Array(e.materials.length).fill(0);for(const s of r[variant]||r.standard)for(let i=0;i<e.materials.length;i++)total[i]+=s.items[i];
  return total.map((n,i)=>n?`${n} ${e.materials[i].name.toLowerCase()}`:'').filter(Boolean).join(' · ');
}
export function installEconomyUI({snapshot,game,changed,notify,locate,openTown,planSource,avatar,paintPortraits,focusUtility,moveBattery}){
  const $=s=>document.querySelector(s);let lastProjects='',lastInventory='',lastOrders='',lastLand='',lastLocations='',lastFreshness='',pickupNoticeOrder=null,currentQuote=null;
  const forecasts=createProjectForecasts({checkpoint:()=>game().snapshot(),refresh:()=>{lastProjects='';update();}});
  $('#project-forecast-run').onclick=forecasts.start;
  $('#project-forecast-cancel').onclick=forecasts.cancel;
  const transact=result=>{if(result!=='ok')notify(result);else{forecasts.invalidate();lastProjects='';changed();update();}};
  const productionUI=installProductionUI({snapshot,game,transact,notify});
  const processUI=installProcessUI({snapshot,game,transact});
  const waterUI=installWaterUI({game});
  const waterConnections=installWaterConnections({game,snapshot,transact,openTown});
  const electricityUI=installElectricityUI({game,snapshot,transact,openTown,focusUtility,moveBattery});
  const materials=snapshot().environment.economy.materials;
  const suppliers=installSupplierUI({snapshot,game,changed:()=>{changed();update();},addOffer:(material,n)=>{const input=$(`[data-material="${material}"]`);if(input){input.value=Math.min(100,(Number(input.value)||0)+n);quote();}}});
  $('#town-catalog').innerHTML=materials.filter(m=>m.buyable!==false).map(m=>`<article class="town-item"><div class="trade-item-art">${itemIcon(materialIcons[m.id])}</div><label for="buy-${m.id}">${m.name}</label><small class="trade-price">${money(m.price)}</small><div class="trade-quantity"><button type="button" data-adjust="-1" aria-label="Remove one ${m.name.toLowerCase()}">−</button><input id="buy-${m.id}" type="number" min="0" max="100" step="1" value="0" aria-label="Order ${m.name}" data-material="${m.id}"><button type="button" data-adjust="1" aria-label="Add one ${m.name.toLowerCase()}">+</button></div></article>`).join('');
  $('#spare-material').innerHTML=materials.filter(m=>m.price>0).map(m=>`<option value="${m.id}">${m.name}</option>`).join('');
  function spareQuote(){const e=snapshot().environment.economy,m=e.materials[Number($('#spare-material').value)],n=Number($('#spare-quantity').value),valid=Number.isInteger(n)&&n>0&&n<=20&&n<=m.available;$('#sell-material').disabled=!valid;$('#spare-quote').textContent=`${m.available} unreserved units · ${valid?money(n*m.sell_price)+' contribution':'choose 1–20 available units'}`;}
  $('#spare-material').onchange=spareQuote;$('#spare-quantity').oninput=spareQuote;
  $('#sell-material').onclick=()=>transact(game().sell_material(Number($('#spare-material').value),Number($('#spare-quantity').value)));
  $('#project-list').addEventListener('focusout',()=>queueMicrotask(update));
  const basket=()=>Array.from({length:materials.length},(_,i)=>Number($(`[data-material="${i}"]`)?.value||0));
  const pickupMode=()=>$('[name="town-transport"]:checked').value==='pickup';
  function refreshDrivers(select){
    const drivers=snapshot().environment.economy.pickup_drivers;
    const previous=select.value,markup=drivers.map(r=>`<option value="${r.id}" ${r.blocker?'disabled':''}>${escape(r.name)}${r.blocker?' · '+escape(r.blocker):''}</option>`).join('');
    if(select.innerHTML!==markup){select.innerHTML=markup;select.value=drivers.some(r=>String(r.id)===previous)?previous:String(drivers.find(r=>!r.blocker)?.id??'');}
  }
  function pickupMessage(name){return `${name} is collecting our supplies. ${$('#pause').getAttribute('aria-label')==='Resume simulation'?'Resume time to let the trip begin.':'The order will arrive when they return.'}`;}
  function quote(){
    const s=snapshot(),e=s.environment.economy,items=basket(),valid=items.every(n=>Number.isInteger(n)&&n>=0&&n<=100),quantity=items.reduce((a,b)=>a+b,0),pickup=pickupMode(),driver=e.pickup_drivers.find(r=>String(r.id)===$('#pickup-driver').value);
    currentQuote=valid&&quantity?JSON.parse(game().supply_order_quote(JSON.stringify(items),pickup)):null;
    const total=currentQuote?.total||0,discount=currentQuote?.terms?.discount;
    $('#pickup-controls').hidden=!pickup;
    $('#pickup-driver-note').textContent=driver?.blocker||`${Math.round(e.pickup_minutes||120)} game minutes driving and loading, plus the walk to the truck. This duration is fixed when the order is confirmed.`;
    $('#town-total').textContent=money(total);
    $('#town-delivery').textContent=pickup?'Includes R$ 20 fuel. Supplies enter our stores when the driver returns.':currentQuote?.terms?`Includes R$ 60 delivery · dispatch in two game hours · agreed arrival ${time(currentQuote.terms.arrival)}.`:'Combine purchases for several projects in one delivery.';
    if(discount)$('#town-delivery').textContent+=` ${discount.units} ${e.materials[discount.material].name.toLowerCase()} at the offer price.`;
    const blocked=pickup&&(quantity>e.pickup_capacity||!driver||driver.blocker);
    $('#town-order').disabled=!currentQuote?.allowed||!!blocked;
    $('#town-order').textContent=pickup?'Buy & collect':'Buy supplies';
    $('#town-basket-status').textContent=!valid?'Use whole quantities from 0 to 100.':pickup&&quantity>e.pickup_capacity?'The truck holds 40 units. Split this order or choose town delivery.':pickup&&(!driver||driver.blocker)?driver?.blocker||'No resident is ready to drive.':currentQuote&&!currentQuote.allowed?currentQuote.reason:quantity?`${quantity} ${quantity===1?'unit':'units'} · ${e.capacity-e.used-quantity} total storage spaces left`:'Choose supplies or fill this list from village needs.';
  }
  document.querySelector('.transport-choice').onchange=()=>{$('#town-pickup-status').textContent='';quote();};
  function updatePickupDialog(){
    const e=snapshot().environment.economy,o=snapshot().village.economy.orders.find(o=>o.id===Number($('#pickup-confirm').dataset.order)),driver=e.pickup_drivers.find(r=>String(r.id)===$('#pickup-order-driver').value);
    $('#pickup-order-status').textContent=!o||o.status!=='confirmed'?'This order is no longer awaiting dispatch.':driver?.blocker||(!driver?'No resident is ready to drive.':'Ready to collect. Supplies stay incoming until the driver returns.');
    $('#pickup-confirm').disabled=!o||o.status!=='confirmed'||!driver||!!driver.blocker;
  }
  $('#pickup-close').onclick=()=>$('#pickup-dialog').close();
  $('#pickup-dialog').addEventListener('close',()=>$('#town-panel [data-close-panel]').focus());
  $('#pickup-order-driver').onchange=updatePickupDialog;
  $('#pickup-confirm').onclick=()=>{const id=Number($('#pickup-confirm').dataset.order),driver=snapshot().environment.economy.pickup_drivers.find(r=>String(r.id)===$('#pickup-order-driver').value),result=game().collect_order(id,Number($('#pickup-order-driver').value));if(result==='ok')pickupNoticeOrder=id;transact(result);if(result==='ok'){$('#pickup-dialog').close();notify(pickupMessage(driver.name));}else updatePickupDialog();};
  $('#town-catalog').addEventListener('input',quote);
  $('#town-catalog').addEventListener('click',event=>{const button=event.target.closest('[data-adjust]');if(!button)return;const input=button.closest('.town-item').querySelector('input');input.value=Math.max(0,Math.min(100,(Number(input.value)||0)+Number(button.dataset.adjust)));quote();});
  $('#town-shortages').onclick=()=>{const e=snapshot().environment.economy;for(let i=0;i<e.materials.length;i++){const input=$(`[data-material="${i}"]`);if(input)input.value=Math.min(e.shortage[i],100);}quote();};
  $('#town-clear').onclick=()=>{for(const input of $('#town-catalog').querySelectorAll('input'))input.value=0;quote();};
  $('#town-order').onclick=()=>{const pickup=pickupMode(),orderId=snapshot().village.economy.next_order,driver=snapshot().environment.economy.pickup_drivers.find(r=>String(r.id)===$('#pickup-driver').value),result=pickup?game().order_supplies_pickup_quoted(JSON.stringify(basket()),Number($('#pickup-driver').value),currentQuote?.token||''):game().order_supplies_quoted(JSON.stringify(basket()),currentQuote?.token||'');if(result==='ok'){if(pickup)pickupNoticeOrder=orderId;$('#town-clear').click();}transact(result);if(result!=='ok')quote();if(result==='ok'&&pickup)notify(pickupMessage(driver.name));};
  const jobs=snapshot().environment.economy.jobs;
  $('#outside-jobs').innerHTML=jobs.map(job=>`<article class="occupation-card"><div class="occupation-heading">${avatar(job.id)}<div><strong>${escape(job.name)}</strong><b>${escape(job.title)}</b></div><label><input type="checkbox" data-outside-job="${job.id}" aria-label="Schedule ${escape(job.name)}'s outside job"> Work outside</label></div><p>${escape(job.description)}</p><small>09:00–17:00 · ${money(job.income)} contribution per shift</small><span data-job-status="${job.id}"></span></article>`).join('');paintPortraits();
  $('#jobs-outlook').onclick=()=>{const section=$('#outside-jobs').closest('details');section.open=true;section.querySelector('summary').scrollIntoView({block:'start'});section.querySelector('summary').focus({preventScroll:true});};
  $('#outside-jobs').onchange=event=>{const input=event.target.closest('[data-outside-job]');if(!input)return;game().set_resident_job(Number(input.dataset.outsideJob),input.checked);changed();update();};
  $('#sell-surplus').onclick=()=>transact(game().sell_surplus(Math.min(20,snapshot().environment.economy.saleable_food)));
  $('#exchange-parts').onclick=()=>transact(game().exchange_parts());
  $('#town-orders').onclick=event=>{
    const cancel=event.target.closest('[data-cancel-order]');if(cancel){transact(game().cancel_order(Number(cancel.dataset.cancelOrder)));return;}
    const collect=event.target.closest('[data-collect-order]');if(!collect)return;
    const o=snapshot().village.economy.orders.find(o=>o.id===Number(collect.dataset.collectOrder));if(!o)return;
    $('#pickup-confirm').dataset.order=o.id;$('#pickup-order-summary').textContent=`Order ${o.id+1} · ${o.items.reduce((a,b)=>a+b,0)} ${o.items.reduce((a,b)=>a+b,0)===1?'unit':'units'}. R$ 40 of the delivery fee returns to the fund; R$ 20 covers fuel.`;
    refreshDrivers($('#pickup-order-driver'));updatePickupDialog();$('#pickup-dialog').showModal();
  };
  $('#project-list').onclick=event=>{
    const button=event.target.closest('button');if(!button)return;const id=Number(button.dataset.project),p=snapshot().environment.economy.projects.find(p=>p.building===id);if(!p)return;
    if(button.dataset.action==='locate')locate(id);
    if(button.dataset.action==='supplies'){openTown();$('#town-shortages').click();$('#town-shortages').focus();}
    if(button.dataset.action==='pause')transact(game().configure_project(id,p.priority,!p.paused,p.recipe));
    if(button.dataset.action==='cancel'){$('#project-cancel-note').textContent=`Cancel ${names[p.kind]} ${id+1}? Unused reservations return in full. If materials were consumed, residents must carefully dismantle the structure before half can be recovered. Empty blueprints cancel immediately. Trade orders continue unless cancelled separately.`;$('#project-cancel-confirm').dataset.project=id;$('#project-cancel-dialog').showModal();}
  };
  $('#project-cancel-close').onclick=()=>$('#project-cancel-dialog').close();
  $('#project-cancel-confirm').onclick=()=>{const id=Number($('#project-cancel-confirm').dataset.project),result=game().cancel_project(id);transact(result);if(result==='ok')notify((snapshot().village.building_jobs||[]).some(j=>j.building===id)?'Salvage queued. Residents must finish dismantling before materials return.':'Empty blueprint cancelled.');$('#project-cancel-dialog').close();};
  $('#project-list').onchange=event=>{const input=event.target.closest('select');if(!input)return;const id=Number(input.dataset.project),p=snapshot().environment.economy.projects.find(p=>p.building===id);if(p)transact(game().configure_project(id,input.dataset.action==='priority'?Number(input.value):p.priority,p.paused,input.dataset.action==='recipe'?input.value:p.recipe));};
  $('#land-sources').onclick=event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.planSource!=null){planSource(Number(button.dataset.planSource));return;}
    const index=Number(button.dataset.site),action=button.dataset.action;
    if(action==='clear'&&!confirm('Clear this plot? Standing crops are lost; the property’s finite reserves remain unchanged.'))return;
    const result=action==='harvest'?game().harvest_source(index):action==='plant'?game().replant_source(index):action==='enrich'?game().restore_source(index):game().clear_source(index);
    transact(result);if(result==='ok'&&['harvest','plant','enrich'].includes(action))notify('Queued for community work. Resume time if the village is paused.');
  };
  $('#land-sources').onchange=event=>{const input=event.target.closest('[data-source-setting]');if(!input)return;const index=Number(input.dataset.site),site=snapshot().village.economy.sources[index];transact(game().configure_source(index,input.dataset.sourceSetting==='replant'?input.checked:site.auto_replant,input.dataset.sourceSetting==='harvest'?input.checked:site.auto_harvest));};
  const locationName=p=>p.owner.kind==='production'?productionSiteName(snapshot().village.production.sites.find(s=>s.id===p.owner.id)||{},snapshot().village)+' pile':({camp:'Arrival store',warehouse:`Storage house ${(p.owner.id??0)+1}`,source:`Material plot ${(p.owner.id??0)+1}`,site:`${snapshot().village.buildings.find(b=>b.id===p.owner.id)?.progress>=100?'Garden supplies':'Construction site'} ${(p.owner.id??0)+1}`,ground:'Recoverable pile',maintenance:`Service parts ${p.owner.id}`,utility:snapshot().village.pipes.lines.find(line=>line.id===p.owner.id)?.plan.kind==='electricity'?'Cable kit':'Water line kit',restoration:`Soil work ${(p.owner.id??0)}`,pantry:snapshot().village.buildings.find(b=>b.id===p.owner.id)?.kind==='square'?`Shared table ${(p.owner.id??0)+1}`:`${names[snapshot().village.buildings.find(b=>b.id===p.owner.id)?.kind]||'Food'} ${['compost','biodigester'].includes(snapshot().village.buildings.find(b=>b.id===p.owner.id)?.kind)?'store':'pantry'} ${(p.owner.id??0)+1}`}[p.owner.kind]);
  $('#storage-locations').onclick=event=>{
    const button=event.target.closest('[data-store-target]');if(!button)return;
    const row=button.closest('.storage-location'),building=Number(button.dataset.storeTarget),store=snapshot().village.logistics.stores.find(p=>p.owner.kind==='warehouse'&&p.owner.id===building),target=[...store.target];
    target[Number(row.querySelector('select').value)]=Number(row.querySelector('input').value);
    const result=game().set_storage_target(building,JSON.stringify(target));transact(result);if(result==='ok')notify('Reserve set. Residents will move available supplies when they have the energy.');
  };
  $('#storage-locations').onchange=event=>{if(event.target.matches('select')){const row=event.target.closest('.storage-location'),building=Number(row.querySelector('button').dataset.storeTarget),store=snapshot().village.logistics.stores.find(p=>p.owner.kind==='warehouse'&&p.owner.id===building);row.querySelector('input').value=store.target[Number(event.target.value)];}};
  $('#storage-locations').addEventListener('focusout',()=>queueMicrotask(update));
  function update(){
    const s=snapshot(),e=s.environment.economy,v=s.village;
    suppliers.update(s);
    for(const m of e.materials){const node=$(`[data-material="${m.id}"]`)?.closest('.town-item').querySelector('.trade-price');if(node&&node.textContent!==money(m.price))node.textContent=money(m.price);}
    if(forecasts.observe(s))lastProjects='';
    $('#fund').textContent=money(e.money);$('#town-fund').textContent=money(e.money);
    const enabled=e.jobs.filter(j=>j.enabled),away=s.residents.filter(r=>r.trip?.purpose==='work'&&r.trip.phase==='away');
    $('#jobs-outlook').textContent=enabled.length?`${enabled.length} optional ${enabled.length===1?'shift':'shifts'} · up to ${money(enabled.reduce((sum,j)=>sum+j.income,0))} per day${away.length?' · '+away.length+' working off-site':''}`:'Choose outside shifts';
    for(const job of e.jobs){
      $(`[data-outside-job="${job.id}"]`).checked=job.enabled;
      const r=s.residents.find(r=>r.id===job.id),working=r.trip?.purpose==='work';
      $(`[data-job-status="${job.id}"]`).textContent=working?r.trip.phase==='leaving'?`Leaving for ${job.place}`:r.trip.phase==='away'?'Working off-site · returns at 17:00':`Back from work · ${money(job.income)} contributed`:job.paid_today?`Today’s contribution received · ${job.enabled?'scheduled again tomorrow':'future shifts off'}`:!job.enabled?'Staying available for village life':v.minutes%1440>=600?'No shift taken today · next departure tomorrow at 09:00':'Scheduled · leaves between 09:00 and 10:00 when rested';
    }
    $('#sell-surplus').disabled=e.saleable_food===0;$('#sell-surplus').textContent=e.saleable_food?`Sell ${Math.min(20,e.saleable_food)} surplus ingredients`:'36 ingredients stay for the household';
    $('#exchange-parts').disabled=!e.exchange_available||v.food<40||e.materials[16].available<4||e.used+2>e.capacity;
    $('#storage-summary').textContent=`${e.used} / ${e.capacity} spaces · including incoming orders${e.salvage_reserved?` and ${e.salvage_reserved} reserved for salvage`:""}${e.production?.reserved_space?` · ${e.production.reserved_space} spaces reserved for processing`:''}`;
    $('#project-summary').textContent=e.projects.length?`${e.projects.length} active ${e.projects.length===1?'project':'projects'} · work follows each neighbour’s energy and needs`:'Plan a building to start a shared project. Blueprints are free.';
    const outlook=forecasts.summary();
    $('#project-forecast').hidden=!e.projects.length;
    $('#project-forecast-run').disabled=outlook.pending;
    $('#project-forecast-run').textContent=outlook.label;
    $('#project-forecast-cancel').hidden=!outlook.pending;
    if($('#project-forecast-status').textContent!==outlook.status)$('#project-forecast-status').textContent=outlook.status;
    $('#project-forecast-assumptions').hidden=!outlook.assumptions;
    $('#project-forecast-assumptions').textContent=outlook.assumptions;
    $('#property-description').textContent=e.property;
    productionUI.update(s);
    processUI.update(s);
    waterUI.update(s);
    waterConnections.update(s);
    electricityUI.update(s);
    const freshnessKey=JSON.stringify(e.freshness);if(freshnessKey!==lastFreshness){lastFreshness=freshnessKey;$('#food-freshness').innerHTML=freshnessMarkup(s);const warning=freshnessWarning(s);$('#food-freshness-warning').textContent=warning;$('#food-freshness-warning').hidden=!warning;}
    const locations=v.logistics?.stores||[],shipments=v.logistics?.shipments||[],locationKey=JSON.stringify({locations,shipments:shipments.map(h=>[h.resident,h.material,h.amount,h.carrying])});
    if(locationKey!==lastLocations&&!$('#storage-locations').contains(document.activeElement)){
      lastLocations=locationKey;
      $('#storage-locations').innerHTML='<h3>Where supplies are</h3><p>Residents carry up to 12 units per trip. Set a nearby storage reserve to shorten future hauls. Setting a reserve queues work; it moves no goods immediately.</p>'+locations.filter(p=>p.items.some(n=>n)||['camp','warehouse'].includes(p.owner.kind)).map(p=>`<article class="storage-location source-row"><div><b>${locationName(p)}</b><small>Plot ${p.x.toFixed(1)}, ${p.y.toFixed(1)} · ${p.items.reduce((a,b)=>a+b,0)} / ${p.capacity}</small><p>${p.items.map((n,i)=>n?`${n} ${e.materials[i].name.toLowerCase()}`:'').filter(Boolean).join(' · ')||'Empty'}</p>${e.freshness?.enabled&&p.food_lots?.length?`<small>${expiryNote(p.food_lots,true)}</small>`:''}${p.blocker?`<p>${escape(p.blocker)}</p>`:''}${p.owner.kind==='warehouse'?`<div class="storage-reserve"><label>Keep nearby<select aria-label="Material reserve for storage house ${p.owner.id+1}">${e.materials.map(m=>`<option value="${m.id}">${m.name}</option>`).join('')}</select></label><label>Units<input type="number" min="0" max="300" step="1" value="${p.target[0]}" aria-label="Reserve quantity for storage house ${p.owner.id+1}"></label><button data-store-target="${p.owner.id}">Set reserve</button></div>`:''}</div></article>`).join('')+shipments.map(h=>`<p>${escape(s.residents.find(r=>r.id===h.resident).name)} · ${h.carrying?'carrying':'collecting'} ${h.amount} ${e.materials[h.material].name.toLowerCase()}</p>`).join('');
    }
    const projectKey=JSON.stringify(e.projects.map(p=>({...p,labour:Math.floor(p.labour),progress:Math.floor(p.progress)})));
    if(projectKey!==lastProjects&&!($('#project-list').contains(document.activeElement)&&document.activeElement.matches('select,input'))){
      const focused=$('#project-list').contains(document.activeElement)?{id:document.activeElement.dataset.project,action:document.activeElement.dataset.action}:null;
      const expanded=[...$('#project-list').querySelectorAll('details[open]')].map(d=>d.closest('.project-card').querySelector('[data-project]').dataset.project);
      lastProjects=projectKey;$('#project-list').innerHTML=e.projects.map(p=>{
        const missing=p.missing.map((n,i)=>n?`${n} ${e.materials[i].name.toLowerCase()}`:'').filter(Boolean),inTransit=p.missing.some((n,i)=>n&&e.materials[i].incoming),hasConsumed=p.consumed.some(n=>n),r=e.recipes.find(r=>r.kind===p.kind),alternative=!!r.adobe||JSON.stringify(r.standard)!==JSON.stringify(r.local);
        const awaitingHaul=!p.missing.some(n=>n)&&!p.ready;
        const status=p.hauling_blocker|| (p.paused?'Paused · staged supplies await collection':p.ready?`Ready for community work · ${Math.ceil(p.work-p.labour)} labour left`:inTransit?'Waiting for incoming supplies':awaitingHaul?'Supplies reserved · residents must bring them to the site':`Source, prepare or purchase: ${missing.join(', ')}`);
        return `<article class="project-card"><div class="project-title"><h3>${names[p.kind]} <small>${p.building+1}</small></h3><button data-project="${p.building}" data-action="locate">Locate</button></div><div class="project-stage"><b>${p.stage}</b><span>${Math.floor(p.progress)}%</span></div><progress value="${p.progress}" max="100" aria-label="${names[p.kind]} construction"></progress><p>${status}</p>${!p.paused&&!p.ready&&!awaitingHaul?`<button class="project-supply-link" data-project="${p.building}" data-action="supplies">Review town supplies</button>`:''}<details><summary>Stages & materials</summary>${p.stages.map((s,i)=>`<p class="recipe-stage"><b>${i<p.stage_index?'✓ ':''}${s.name}</b>${s.items.map((n,j)=>n?`${n} ${e.materials[j].name.toLowerCase()}`:'').filter(Boolean).join(' · ')}</p>`).join('')}</details>${forecasts.render(p)}<div class="project-actions"><label>Priority<select data-project="${p.building}" data-action="priority">${[0,1,2,3].map((n)=>`<option value="${n}" ${n===p.priority?'selected':''}>${['Low','Normal','High','First'][n]}</option>`).join('')}</select></label><label>Method<select data-project="${p.building}" data-action="recipe" ${hasConsumed||!alternative?'disabled':''}><option value="standard" ${p.recipe==='standard'?'selected':''}>Prepared materials</option><option value="local" ${p.recipe==='local'?'selected':''}>Local materials</option>${r.adobe?`<option value="adobe" ${p.recipe==='adobe'?'selected':''}>Adobe bricks & bamboo</option>`:''}</select></label><button data-project="${p.building}" data-action="pause">${p.paused?'Resume':'Pause'}</button><button data-project="${p.building}" data-action="cancel">Cancel</button></div></article>`;
      }).join('')||'<div class="economy-empty">Every journey starts with a blueprint.<p>Open Build and choose a clearing. Projects reserve the next stage’s materials.</p></div>';
      if(focused?.id){const target=$(`#project-list [data-project="${focused.id}"][data-action="${focused.action}"]`);(target||$('#projects-panel [data-close-panel]')).focus({preventScroll:true});}
      for(const id of expanded){const card=$(`#project-list [data-project="${id}"]`)?.closest('.project-card');if(card)card.querySelector('details').open=true;}
    }
    const inventoryKey=JSON.stringify({mode:v.mode,constrained:usesLogistics(v),materials:e.materials,freshness:e.freshness});if(inventoryKey!==lastInventory){lastInventory=inventoryKey;$('#material-inventory').innerHTML=`<div class="material-slots">${e.materials.map(m=>`<article class="material-slot" data-item="${m.id}" title="${m.name}: ${m.stored} owned, ${m.reserved} reserved, ${m.available} free, ${m.incoming} incoming${e.freshness?.enabled&&e.freshness.next_expiry[m.id]!=null?` · Next food expires ${time(e.freshness.next_expiry[m.id])}`:''}"><div class="material-art">${itemIcon(materialIcons[m.id])}<b class="slot-count">${m.stored}</b></div><strong>${m.name}</strong><small>${m.available} free${m.reserved?' · '+m.reserved+' reserved':''}${m.in_transit?' · '+m.in_transit+' carried':''}</small>${e.freshness?.enabled&&e.freshness.due_within_day[m.id]?`<small class="slot-expiry">${e.freshness.due_within_day[m.id]} use within a day</small>`:''}${m.incoming?`<span class="slot-incoming">+${m.incoming} on the way</span>`:''}</article>`).join('')}</div>`;}
    const orderKey=JSON.stringify({orders:v.economy.orders.map(o=>({...o,arrival:Math.floor(o.arrival)})),trips:s.residents.map(r=>[r.id,r.trip?.phase])});
    if(orderKey!==lastOrders){lastOrders=orderKey;$('#town-orders').innerHTML=[...v.economy.orders].reverse().map(o=>{
      const driver=s.residents.find(r=>r.id===o.pickup_by),quantity=o.items.reduce((a,b)=>a+b,0),pickup=o.pickup_by!=null;
      const status=o.status==='cancelled'?'Cancelled · fully refunded':o.status==='delivered'?pickup?`Collected by ${driver?.name||'our neighbour'} · supplies received`:'Delivered to the receiving area':o.status==='collecting'?driver?.trip?.phase==='leaving'?`${driver.name} is walking to the truck · ${Math.round(o.pickup_minutes||120)} minutes away after departure`:`${driver?.name||'Our neighbour'} is driving to collect supplies · back ${time(o.arrival)}`:`${o.status==='confirmed'?'Awaiting dispatch':'On the way'} · arrives ${time(o.arrival)}`;
      return `<article class="order-row"><div><b>Order ${o.id+1} · ${money(o.paid)}${pickup?' · pickup':''}</b><small>${o.items.map((n,i)=>n?`${n} ${e.materials[i].name.toLowerCase()}`:'').filter(Boolean).join(' · ')}</small><span>${escape(status)}</span>${o.terms?`<small>Price agreed Day ${o.terms.day+1}${o.terms.discount?` · ${o.terms.discount.units} units at the offer price`:""}</small>`:""}</div>${o.status==='confirmed'?`<div class="order-actions"><button data-collect-order="${o.id}" ${quantity>e.pickup_capacity?'disabled title="The truck holds at most 40 units"':''}>Drive to collect</button><button data-cancel-order="${o.id}">Cancel & refund</button></div>`:''}</article>`;
    }).join('')||'<p>No orders yet. Choose delivery or send a resident to collect supplies.</p>';}
    $('#fund-ledger').innerHTML=[...v.economy.ledger].reverse().slice(0,12).map(l=>`<div class="ledger-row"><span>${escape(l.note)}<small>${time(l.minute)}</small></span><b>${l.amount>0?'+':''}${money(l.amount)}</b></div>`).join('');
    const sources=e.source_status,landKey=JSON.stringify({mode:v.mode,compostReady:e.materials[19].available>=2,soilJobs:(v.restoration||[]).map(j=>[j.id,j.finished!=null]),sources:sources.map(row=>({...row,source:{...v.economy.sources[row.index],growth:row.growth_percent,moisture:Math.ceil(v.economy.sources[row.index].moisture/60)}}))});if(landKey!==lastLand){lastLand=landKey;
      const focused=$('#land-sources').contains(document.activeElement)?{...document.activeElement.dataset}:null;
      $('#land-sources').innerHTML='<div class="source-plans">'+e.source_options.map(o=>`<button data-plan-source="${o.material}">${o.name} · ${!usesLogistics(v)?'Free':money(o.cost)}</button>`).join('')+'</div>'+(!sources.length?'<p>No material sites yet. Choose a plot to cultivate or extract; town supplies are available while plants grow.</p>':'')+sources.map(row=>{
        const site=v.economy.sources[row.index],renewable=site.material<2,siteId=row.index;
        return `<article class="source-row"><div><b>${row.name}</b><small>Plot ${site.x}, ${site.y} · ${renewable?!site.planted?'Awaiting resident planting':site.growth<1?row.growth_percent+'% grown · about '+row.hours_left+' growth hours left':Math.floor(site.remaining)+' / '+site.maximum+' ready units':row.unlimited?'Non-depleting extraction · '+Math.floor(site.remaining)+' saved units':Math.floor(site.remaining)+' / '+site.maximum+' in this local deposit'}</small><p>${row.status}</p>${row.planting_stock?`<p>${row.planting_stock.here} / ${row.planting_stock.amount} ${(row.planting_stock.amount===1?e.materials[row.planting_stock.material].name.replace(/s$/,''):e.materials[row.planting_stock.material].name).toLowerCase()} at this plot. Planting uses two irrigation water after a neighbour arrives.</p>`:''}${site.harvest_requested?'<p>Harvest queued for community work.</p>':''}${site.plant_requested?'<p>Planting queued for community work.</p>':''}
        ${renewable?`<label><input type="checkbox" data-site="${siteId}" data-source-setting="replant" ${site.auto_replant?'checked':''}> ${site.material===0?'Replant after cutting · 4 delivered timber seedlings':'Regrow bamboo shoots after cutting'}</label>`:''}
        <label><input type="checkbox" data-site="${siteId}" data-source-setting="harvest" ${site.auto_harvest?'checked':''}> Harvest for project demand</label>
        <div class="source-actions"><button data-site="${siteId}" data-action="harvest" ${!row.ready||site.harvest_requested?'disabled':''}>${site.material===0?'Cut one tree · 8 timber':renewable?'Harvest bamboo':'Extract a batch'}</button>
        ${renewable&&!site.planted?`<button data-site="${siteId}" data-action="plant" ${site.plant_requested?'disabled':''}>${site.harvests?'Plant again':'Plant first crop'}</button>`:''}
        ${renewable?`<button data-site="${siteId}" data-action="enrich" ${(v.restoration||[]).some(j=>j.finished==null&&j.source===siteId)||e.materials[19].available<2?'disabled':''}>${(v.restoration||[]).some(j=>j.finished==null&&j.source===siteId)?'Soil work queued':'Restore soil · 2 compost'}</button>`:''}<button data-site="${siteId}" data-action="clear">Clear plot</button></div></div></article>`;
      }).join('');
      if(focused){const selector=focused.planSource!=null?`[data-plan-source="${focused.planSource}"]`:focused.sourceSetting?`[data-site="${focused.site}"][data-source-setting="${focused.sourceSetting}"]`:`[data-site="${focused.site}"][data-action="${focused.action}"]`;$(`#land-sources ${selector}`)?.focus({preventScroll:true});}
    }
    refreshDrivers($('#pickup-driver'));refreshDrivers($('#pickup-order-driver'));
    if($('#pickup-dialog').open)updatePickupDialog();
    const notice=v.economy.orders.find(o=>o.id===pickupNoticeOrder&&o.pickup_by!=null),driver=s.residents.find(r=>r.id===notice?.pickup_by);
    $('#town-pickup-status').textContent=!notice?'':notice.status==='delivered'?`${driver.name} brought our supplies home. They await local distribution at camp.`:driver.trip?.phase==='away'?`${driver.name} is driving to collect supplies · back ${time(notice.arrival)}`:pickupMessage(driver.name);
    quote();spareQuote();
  }
  update();return {update,resetForVillage(){
    forecasts.reset();lastProjects='';pickupNoticeOrder=null;currentQuote=null;
    for(const input of $('#town-catalog').querySelectorAll('input'))input.value=0;
    $('[name="town-transport"][value="delivery"]').checked=true;
    $('#town-pickup-status').textContent='';if($('#pickup-dialog').open)$('#pickup-dialog').close();
  }};
}
