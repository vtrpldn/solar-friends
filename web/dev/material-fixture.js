// Explicit fixture authoring only. Playable saves retain their located ownership.
export function resetMaterialLocations(state) {
  if(state.village.logistics?.shipments?.length)throw new Error('Finish or interrupt cargo before restaging a material fixture.');
  state.village.version=3;
  for(const b of [state.village.economy.stock,...state.village.economy.projects.flatMap(p=>[p.reserved,p.consumed]),...state.village.economy.orders.map(o=>o.items),...(state.village.building_jobs||[]).map(j=>j.returns)])while(b.length<19)b.push(0);
  state.village.economy.stock[16]=state.village.food;
  state.village.economy.stock[17]=state.village.meals;
  state.village.economy.stock[18]=state.village.supplies.eggs;
  state.village.economy.stock[15]=state.village.progress.tool_uses||0;
  state.village.logistics=null;
  state.village.production={schema:1,sites:[],batches:[],targets:Array(19).fill(0)};
  for(const r of state.residents||[]){
    r.activity_batch=null;
    if(r.task==='prepare'){r.task='idle';r.remaining=0;r.activity_material=null;r.activity_building=null;r.target_x=r.x;r.target_y=r.y;r.requested=false;}
    if(r.help?.task==='prepare'&&r.help.finished==null){r.help.phase='cancelled';r.help.finished=state.village.minutes;r.help.reason='The material fixture was restaged.';}
  }
  if(state.village.simulation)state.village.simulation.materials=null;
  return state;
}
