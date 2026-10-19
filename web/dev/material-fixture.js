// Explicit fixture authoring only. Playable saves retain their located ownership.
export function resetMaterialLocations(state) {
  if(state.village.logistics?.shipments?.length)throw new Error('Finish or interrupt cargo before restaging a material fixture.');
  state.village.version=3;
  Object.assign(state.village.progress,{gathering_delivery:null,gathering_until:0,invited:0,attended:0});
  for(const b of [state.village.economy.stock,...state.village.economy.projects.flatMap(p=>[p.reserved,p.consumed]),...state.village.economy.orders.map(o=>o.items),...(state.village.building_jobs||[]).map(j=>j.returns)])while(b.length<19)b.push(0);
  state.village.economy.stock[16]=state.village.food;
  state.village.economy.stock[17]=state.village.meals;
  state.village.economy.stock[18]=state.village.supplies.eggs;
  state.village.economy.stock[15]=state.village.progress.tool_uses||0;
  state.village.logistics=null;
  state.village.production={schema:1,sites:[],batches:[],targets:Array.from({length:19},(_,i)=>i===17?8:0)};
  for(const r of state.residents||[]){
    r.activity_batch=null;r.activity_store=null;
    if(r.task==='prepare'){r.task='idle';r.remaining=0;r.activity_material=null;r.activity_building=null;r.target_x=r.x;r.target_y=r.y;r.requested=false;}
    if(r.help?.task==='prepare'&&r.help.finished==null){r.help.phase='cancelled';r.help.finished=state.village.minutes;r.help.reason='The material fixture was restaged.';}
  }
  if(state.village.simulation)state.village.simulation.materials=null;
  return state;
}

// Deliberate test-scene stock changes. Never call while importing a playable save.
// Preserve existing locations and cargo; change only the requested food delta.
export function restockFixtureFood(state) {
  const v=state.village,s=v.logistics;if(!s)return state;
  for(const [i,target] of [[16,v.food],[17,v.meals],[18,v.supplies.eggs]]){
    if(!Number.isInteger(target)||target<0)throw new Error('Fixture food uses whole portions.');
    const carried=s.shipments.filter(h=>h.carrying&&h.material===i).reduce((n,h)=>n+h.amount,0);
    const current=s.stores.reduce((n,p)=>n+p.items[i],carried);
    let delta=target-current;
    if(delta>0){
      for(const p of s.stores.filter(p=>['camp','warehouse'].includes(p.owner.kind))){
        const reserved=s.shipments.filter(h=>h.to===p.id).reduce((n,h)=>n+h.amount,0);
        const n=Math.min(delta,Math.max(0,p.capacity-p.items.reduce((a,b)=>a+b,0)-reserved));p.items[i]+=n;delta-=n;
      }
      if(delta>0)throw new Error('Provide enough fixture storage before adding food.');
    }else if(delta<0){
      let remove=-delta;
      for(const p of s.stores){
        const held=s.shipments.filter(h=>!h.carrying&&h.from===p.id&&h.material===i).reduce((n,h)=>n+h.amount,0);
        const n=Math.min(remove,p.items[i]-held);p.items[i]-=n;remove-=n;
      }
      if(remove)throw new Error('Finish food cargo before reducing this fixture reserve.');
    }
    v.economy.stock[i]=target;
    if(v.simulation.materials){v.simulation.materials.opening[i]=target;v.simulation.materials.received[i]=0;v.simulation.materials.spent[i]=0;}
  }
  return state;
}
