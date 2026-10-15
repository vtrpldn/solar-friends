const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const terminal=b=>['complete','cancelled'].includes(b.phase);
export function productionSiteName(s,v){return s.building==null?'Camp workbench':`Workshop ${s.building+1}`;}
export function installProductionUI({snapshot,game,transact,notify}){
  const host=document.getElementById('preparation-recipes');let last='';
  const items=(bundle,e)=>bundle.map((n,i)=>n?`${n} ${e.materials[i].name.toLowerCase()}`:'').filter(Boolean).join(' · ');
  host.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.productionTarget!=null){
      const i=Number(button.dataset.productionTarget),n=Number(host.querySelector(`#production-target-${i}`).value);
      if(!Number.isInteger(n)||n<0||n>30){notify('Choose a village reserve between 0 and 30 units.');return;}
      transact(game().set_production_target(i,n));
    }
    if(button.dataset.productionPause!=null){
      const id=Number(button.dataset.productionPause),site=snapshot().village.production.sites.find(s=>s.id===id);
      if(site)transact(game().set_production_paused(id,!site.paused));
    }
    if(button.dataset.productionCancel!=null)transact(game().cancel_production_batch(Number(button.dataset.productionCancel)));
  });
  host.addEventListener('focusout',()=>queueMicrotask(()=>update(snapshot())));
  function update(s){
    const e=s.environment.economy,v=s.village,p=e.production;if(!p)return;
    const buffers=v.logistics?.stores.filter(s=>s.owner.kind==='production')||[];
    const key=JSON.stringify({p:{...p,batches:p.batches.map(b=>({...b,work:Math.floor(b.work*10)/10}))},buffers,buildings:p.sites.map(site=>[site.building,v.buildings.find(b=>b.id===site.building)?.progress>=100]),workers:s.residents.map(r=>[r.id,r.activity_batch,r.task,(r.x-r.target_x)**2+(r.y-r.target_y)**2<=.0064])});
    if(key===last||host.contains(document.activeElement)&&document.activeElement.matches('input'))return;
    const focused=document.activeElement?.closest('[data-production-target],[data-production-pause],[data-production-cancel]');
    const focus=focused?{...focused.dataset}:null;
    const expanded=[...host.querySelectorAll('details[open]')].map(d=>d.dataset.productionRecipes);
    last=key;
    host.innerHTML='<p>Inputs travel to each workbench. Finished materials stay there until collected. Zero reserve makes building materials for current projects. With tool use enabled in Supplies, neighbours replace a small tool supply when it runs low. Roof tiles and tool supplies require a workshop.</p>'+`<div class="production-targets">${[5,6,7,8,15].map(i=>`<div><label for="production-target-${i}">${escape(e.materials[i].name)} reserve</label><input id="production-target-${i}" type="number" min="0" max="30" step="1" value="${p.targets[i]}"><button data-production-target="${i}" aria-label="Set ${escape(e.materials[i].name.toLowerCase())} reserve">Set</button></div>`).join('')}</div>`+p.sites.filter(site=>site.building==null||v.buildings.some(b=>b.id===site.building)).map(site=>{
      const name=productionSiteName(site,v),buffer=buffers.find(b=>b.owner.id===site.id),definition=p.recipes.find(d=>d.site===site.id);
      const batch=p.batches.find(b=>b.site===site.id&&!terminal(b));
      const lastBatch=p.batches.filter(b=>b.site===site.id&&terminal(b)).at(-1);
      const closed=site.building!=null&&v.buildings.some(b=>b.id===site.building&&b.progress<100);
      const worker=batch&&s.residents.find(r=>['prepare','craft'].includes(r.task)&&r.activity_batch===batch.id&&!r.trip);
      let status=closed?'Closed while residents change this building.':site.paused?(!batch&&lastBatch?.phase==='cancelled'?'Batch cancelled. Inputs returned; resume the station to prepare another batch.':'Worksite paused. Staged goods and partial work stay safe.'):!p.work_open?'Waiting for community hours: 09:00–12:00 and 15:00–16:00.':!batch?'No batch queued. Projects and village reserves guide preparation.':worker?`${worker.name} is ${Math.hypot(worker.x-worker.target_x,worker.y-worker.target_y)>.08?'on the way':'working on this batch'}.`:({awaiting_inputs:'Waiting for inputs to reach this worksite.',hauling:'Neighbours are bringing the inputs.',ready:'Inputs are staged. A neighbour can start.',processing:'Waiting for a neighbour to continue the saved work.',paused:'Waiting for a neighbour to continue the saved work.',awaiting_output:'Make room for the finished materials.'}[batch.phase]||'Waiting for shared work.');
      const used=(buffer?.items.reduce((a,b)=>a+b,0)||0)+(definition?.reserved_space||0);
      if(!batch&&used>=p.buffer_capacity&&!closed&&!site.paused)status='The worksite pile is full. Collect finished goods before starting another batch.';
      return `<article class="production-worksite"><div class="production-title"><h4>${escape(name)}</h4><button data-production-pause="${site.id}" ${closed?'disabled':''} aria-label="${site.paused?'Resume':'Pause'} ${escape(name)}">${site.paused?'Resume':'Pause'}</button></div><small>${used} / ${p.buffer_capacity} spaces in use${definition?.reserved_space?' · includes committed work':''}</small><p>${escape(status)}</p><p>${buffer&&buffer.items.some(Boolean)?escape(items(buffer.items,e)):'No loose materials at this workbench.'}</p>${!batch&&lastBatch?.phase==='complete'?`<small>Last batch finished: ${lastBatch.output} ${escape(e.materials[lastBatch.material].name.toLowerCase())}. Goods stay here until collected.</small>`:''}${batch?`<div class="production-batch"><b>${batch.output} ${escape(e.materials[batch.material].name.toLowerCase())}</b><progress max="100" value="${batch.work/p.labour_seconds*100}" aria-label="${escape(name)} production progress"></progress><small>${Math.floor(batch.work/p.labour_seconds*100)}% prepared · ${batch.committed?'inputs committed':'inputs reserved'}: ${escape(items(batch.inputs,e))}</small><button data-production-cancel="${batch.id}" aria-label="Cancel batch at ${escape(name)}">Cancel batch & pause station</button></div>`:''}<details data-production-recipes="${site.id}"><summary>Recipes at this station</summary>${(definition?.recipes||[]).map(r=>`<p class="recipe-stage"><b>${r.output} ${escape(e.materials[r.material].name.toLowerCase())}</b>${escape(items(r.inputs,e))} · ${p.labour_minutes} minutes of work</p>`).join('')}</details></article>`;
    }).join('');
    for(const id of expanded){const d=host.querySelector(`[data-production-recipes="${id}"]`);if(d)d.open=true;}
    if(focus){const selector=focus.productionTarget!=null?`[data-production-target="${focus.productionTarget}"]`:focus.productionPause!=null?`[data-production-pause="${focus.productionPause}"]`:`[data-production-cancel="${focus.productionCancel}"]`;host.querySelector(selector)?.focus({preventScroll:true});}
  }
  return {update};
}
