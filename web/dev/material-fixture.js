// Explicit fixture authoring only. Playable saves retain their located ownership.
export function resetMaterialLocations(state) {
  if(state.village.maintenance?.jobs?.some(j=>j.finished==null))throw new Error('Finish or cancel equipment service before restaging a material fixture.');
  state.village.maintenance={schema:1,enabled:false,records:[],jobs:[]};
  state.village.market={schema:1,enabled:false,last_period:0,used:0};
  for(const o of state.village.economy.orders)if(o.terms?.discount)throw Error("Do not restage a fixture with claimed supplier offers.");
  state.village.skills={schema:1,enabled:false,people:Array.from({length:5},()=>({experience:Array(6).fill(0),today:Array(6).fill(0),day:0}))};
  if(state.village.logistics?.shipments?.length)throw new Error('Finish or interrupt cargo before restaging a material fixture.');
  state.village.version=3;
  if(state.village.power?.battery_jobs?.some(j=>!['complete','cancelled'].includes(j.phase)))throw new Error('Finish battery work before restaging a material fixture.');
  if(state.village.power)for(const field of ['network','opening_equipment','salvaged_equipment','retired_equipment','battery_jobs'])delete state.village.power[field];
  state.village.pipes={schema:1,lines:[]};
  state.village.restoration=[];
  delete state.village.water_supply;
  delete state.village.land;
  state.village.processes={schema:2,batches:[],paused:[]};
  state.village.freshness={schema:1,expired:Array(state.environment.economy.materials.length).fill(0)};
  Object.assign(state.village.progress,{gathering_delivery:null,gathering_until:0,invited:0,attended:0});
  for(const b of [state.village.economy.stock,...state.village.economy.projects.flatMap(p=>[p.reserved,p.consumed]),...state.village.economy.orders.map(o=>o.items),...(state.village.building_jobs||[]).map(j=>j.returns)])while(b.length<state.environment.economy.materials.length)b.push(0);
  state.village.economy.stock[16]=state.village.food;
  state.village.economy.stock[17]=state.village.meals;
  state.village.economy.stock[18]=state.village.supplies.eggs;
  state.village.economy.stock[19]=state.village.progress.compost||0;
  state.village.economy.stock[20]=state.village.progress.scraps||0;
  state.village.economy.stock[21]=state.village.seedlings||0;
  state.village.economy.stock[15]=state.village.progress.tool_uses||0;
  state.village.logistics=null;
  state.village.production={schema:1,sites:[],batches:[],targets:Array.from({length:state.environment.economy.materials.length},(_,i)=>i===17?8:0)};
  for(const r of state.residents||[]){
    r.activity_batch=null;r.activity_store=null;
    if(['prepare','restore'].includes(r.task)){r.task='idle';r.remaining=0;r.activity_material=null;r.activity_building=null;r.target_x=r.x;r.target_y=r.y;r.requested=false;}
    if(r.help?.task==='prepare'&&r.help.finished==null){r.help.phase='cancelled';r.help.finished=state.village.minutes;r.help.reason='The material fixture was restaged.';}
  }
  if(state.village.simulation)state.village.simulation.materials=null;
  return state;
}

// Test fixtures may restage stock; live transfers always keep native lot dates.
function alignFoodLots(state,material){
  const v=state.village,life=state.environment.economy.freshness?.lifetimes.find(l=>l.material===material)?.minutes||({16:5760,17:4320,18:11520})[material];
  for(const p of v.logistics.stores){
    p.food_lots??=[];
    if(p.food_lots.some(l=>l.material===material&&(l.produced>v.minutes||v.mode==='story'&&l.expires<=v.minutes)))p.food_lots=p.food_lots.filter(l=>l.material!==material);
    let current=p.food_lots.filter(l=>l.material===material).reduce((n,l)=>n+l.amount,0),delta=p.items[material]-current;
    if(delta>0)p.food_lots.push({material,amount:delta,produced:v.minutes,expires:v.minutes+life});
    if(delta<0){let remove=-delta;p.food_lots.sort((a,b)=>a.expires-b.expires);for(const l of p.food_lots.filter(l=>l.material===material)){const n=Math.min(remove,l.amount);l.amount-=n;remove-=n;}}
    p.food_lots=p.food_lots.filter(l=>l.amount>0).sort((a,b)=>a.expires-b.expires||a.material-b.material||a.produced-b.produced);
  }
}

// Deliberate test-scene stock changes. Never call while importing a playable save.
// Preserve existing locations and cargo; change only the requested food delta.
export function restockFixtureFood(state) {
  const v=state.village;return restockFixtureMaterials(state,[[16,v.food],[17,v.meals],[18,v.supplies.eggs]]);
}
export function restockFixtureOrganics(state) {
  const v=state.village;return restockFixtureMaterials(state,[[19,v.progress.compost||0],[20,v.progress.scraps||0]]);
}
function restockFixtureMaterials(state,targets) {
  const v=state.village,s=v.logistics;if(!s)return state;
  for(const [i,target] of targets){
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
    if(i<19)alignFoodLots(state,i);
    v.freshness??={schema:1,expired:Array(state.environment.economy.materials.length).fill(0)};v.freshness.expired[i]=0;
    v.economy.stock[i]=target;
    if(v.simulation.materials){v.simulation.materials.opening[i]=target;v.simulation.materials.received[i]=0;v.simulation.materials.spent[i]=0;}
  }
  return state;
}

// Explicit test setup only. This is not a live-game transfer or save migration.
export function stageFixtureMaterial(state,owner,material,n) {
  const s=state.village.logistics,p=s.stores.find(p=>p.owner.kind===owner.kind&&p.owner.id===owner.id);
  if(!p||s.shipments.length)throw Error('Stage a material fixture before any cargo starts.');
  let left=Math.max(0,n-p.items[material]);
  for(const from of s.stores){if(from===p)continue;const amount=Math.min(left,from.items[material]);from.items[material]-=amount;p.items[material]+=amount;left-=amount;}
  if(left)throw Error('Fixture input is absent.');
  if(p.items.reduce((a,b)=>a+b,0)>p.capacity)throw Error('Fixture staging is full.');
  return state;
}

// Fixture capacity mirrors sealed input returns and filtration output ownership.
function liquidReservation(v,p,i){
  return v.processes.batches.filter(b=>!['complete','cancelled'].includes(b.phase)).reduce((sum,b)=>sum+
    (b.input_tank===p.id?(b.kind==='digestion'&&i===3?2:b.kind==='filtration'&&i===2?12:0):0)+
    (b.kind==='filtration'&&i===1&&p.owner.kind==='building'&&p.owner.id===b.building?8:0),0);
}
// Explicit scene authoring only. Live water moves through native resident work.
export function restockFixtureWater(state){
  const v=state.village,s=v.water_supply;if(!s?.schema)return state;
  if(s.trips.length)throw Error('Finish or interrupt water cargo before restaging water.');
  for(const [i,target]of [[0,v.water],[1,v.circular.reclaimed]]){
    if(!Number.isFinite(target)||target<0||target>150000)throw Error('Invalid fixture water stock.');
    let delta=target-s.tanks.reduce((n,p)=>n+p.water[i],0);
    if(delta<0){for(const p of s.tanks){const n=Math.min(-delta,p.water[i]);p.water[i]-=n;delta+=n;}}
    else{
      for(const p of s.tanks.filter(p=>p.owner.kind!=='service')){const n=Math.min(delta,Math.max(0,p.capacity[i]-p.water[i]-liquidReservation(v,p,i)));p.water[i]+=n;delta-=n;}
      while(delta>1e-6){const n=Math.min(delta,i?60:75),water=[0,0,0,0];water[i]=n;s.tanks.push({id:v.simulation.next_id++,owner:{kind:'ground'},x:10.7,y:13,capacity:[...water],water});delta-=n;}
    }
    s.opening[i]=s.tanks.reduce((n,p)=>n+p.water[i],0);s.received[i]=0;s.consumed[i]=0;
  }
  v.water=Math.fround(s.opening[0]);v.circular.reclaimed=Math.fround(s.opening[1]);return state;
}
export function stageFixtureWater(state,owner,kind,n){
  const s=state.village.water_supply,i=['fresh','irrigation','greywater','sewage'].indexOf(kind);
  if(i<0||s.trips.length)throw Error('Stage a known water class before cargo starts.');
  const to=s.tanks.find(p=>p.owner.kind===owner.kind&&p.owner.id===owner.id);
  if(!to||n>to.capacity[i]-liquidReservation(state.village,to,i))throw Error('No compatible fixture container.');
  if(to.water[i]>=n)return state;
  let left=n-to.water[i];
  for(const p of s.tanks){if(p===to)continue;const amount=Math.min(left,p.water[i]);p.water[i]-=amount;to.water[i]+=amount;left-=amount;}
  if(left>1e-6)throw Error('Stage an owned fixture water supply first.');return state;
}
