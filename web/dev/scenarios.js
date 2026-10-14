import { footprint, occupies } from '../building-footprints.js';
import { MAP_SIZE, riverBank } from '../terrain.js';
import {makeArtPreview} from './art-preview.js';
export const scenarios = [
  {id:'sim-compact',name:'Simulation baseline · compact',detail:'Homes, food and storage grouped together. Compare observed travel with the dispersed layout using the same starting supplies and seed.'},
  {id:'sim-spread',name:'Simulation baseline · dispersed',detail:'The same homes and services spread across the property. A paired baseline for transport, travel budgets and later completion forecasts.'},
  {id:'sim-poor',name:'Simulation baseline · empty funds',detail:'Compact services, no construction materials or money, and Bento’s outside job enabled at 09:00. Test a recovery route without selling household food.'},
  {id:'sim-blocked',name:'Simulation baseline · enclosed storage',detail:'A warehouse enclosed by occupied plots. This fixture establishes the blocked-access case for the routing and hauling stage.'},
  {id:'sim-balanced',name:'Simulation baseline · established',detail:'Two homes, varied food, storage, rainwater and solar power. Observe multiple days of time use and material accounts before adding logistics.'},
  {id:'banana',name:'Banana sewage treatment',detail:'A sealed banana bed beside our sanitation buildings, eight accumulated toilet waste and digestion paused. Compare automatic treatment with biogas in Water & waste; saved villages stay protected.'},
  {id:'art',name:'All building artwork',detail:'Every building and house variation, including adobe homes, river power, sanitation and storage. Separate completed plots, normal game scale and renderer; saved villages stay protected.'},
  {id:'art-night',name:'All building artwork at night',detail:'The complete building gallery at 21:00, with rooftop and shared power, matching night sprites and interior lighting.'},
  {id:'cultivation',name:'Player-managed material plots',detail:'Planted timber at 75% growth, cultivated bamboo at 50%, and a manually placed quarry. Advance to watch tending and maturation; request a harvest and compare reserves.'},
  {id:'circular',name:'Closing the loop',detail:'River power, dry toilets, reed beds, biodigestion, storage, and two adobe homes. Start at 10:00; advance to watch private routines and processing.'},
  {id:'circular-night',name:'Circular village at night',detail:'River generation after sunset alongside adobe homes and the new utilities.'},
  { id: 'economy', name: 'Our first projects', detail: 'A home, greenhouse and solar farm with staged materials. Try priorities, local recipes, purchases and deliveries.' },
  { id: 'economy-poor', name: 'An empty shared fund', detail: 'Three blueprints, no money. Enable outside shifts in Town to recover without selling household food.' },
  { id: 'economy-depleted', name: 'Depleted land', detail: 'Finite deposits are empty. Local preparation and town purchases still provide a route forward.' },
  { id: 'grid', name: 'Grid & road edges', detail: 'Every foundation with roads along its front edges. Select Road to inspect grid registration.' },
  { id: 'power', name: 'Stored sunshine', detail: 'A charged solar farm and connected lights at 21:00. Switch loads off in Power to compare.' },
  { id: 'power-outage', name: 'Empty battery', detail: 'An empty shared battery at 21:00; rooftop homes remain lit. Advance until sunrise to recharge.' },
  { id: 'arrival', name: 'Fresh arrival', detail: 'The real starting state, before anyone reaches the clearing.' },
  { id: 'village', name: 'Established village', detail: 'A compact established village, supplies, and completed quests for interaction checks.' },
  { id: 'hungry', name: 'Hungry village', detail: 'Empty pantry and hungry residents during the morning work block.' },
  { id: 'harvest', name: 'First harvest', detail: 'A mature lettuce bed, ready for Iara to harvest.' },
  { id: 'cook', name: 'Overworked cook', detail: 'Staged cooking history across two days; one tick raises the real concern.' },
  { id: 'coop', name: 'Full coop', detail: 'Three hens, a fed batch almost complete, and room for eggs.' },
  { id: 'night', name: 'Night lighting', detail: 'The compact established village at 21:00, with the normal night renderer.' },
  { id: 'occupations', name: 'Outside occupations', detail: 'All five personal jobs enabled at 09:00. Advance to watch departures, independent shifts, and contributions at 17:00.' },
  { id: 'rain', name: 'Afternoon rain', detail: 'The real 15:00 rain: streaks, splashes, river ripples, cloud cover and wet ground. Run the scene to see it move.' },
  { id: 'after-rain', name: 'After the rain', detail: '18:00 after a wet afternoon. Pools dry gradually while sunset lighting returns.' },
  { id: 'dry-afternoon', name: 'A dry afternoon', detail: '15:00 on a dry day. Compare clear light with the rainy scene.' },
  { id: 'leisure', name: 'A relaxed afternoon', detail: 'A modest pantry and content neighbours. Advance to see their hobbies, then evening stargazing.' },
];
// Fixtures are deliberately staged. Real ticks, requests, and systems run after loading.
export function makeScenario(id, fresh, established) {
  if (!scenarios.some(s => s.id === id)) throw new Error('Unknown scenario');
  if (id === 'arrival') return structuredClone(fresh);
  if(id==='art'||id==='art-night')return makeArtPreview(fresh,established,{night:id==='art-night'});
  const state = id==='grid'?makeArtPreview(fresh,established):structuredClone(established), v = state.village;
  v.minutes = 1440 + 600;
  v.simulation=structuredClone(fresh.village.simulation);v.simulation.materials=null;
  v.wood = 110; v.food = 100; v.water = 100; v.meals = 10;
  v.supplies.eggs = 0;
  v.situations = { day: 1, cooking: [[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0]], active: null, resolved_count: 0 };
  for (const r of state.residents) {
    r.energy = 90; r.hunger = 20; r.social = 80; r.task = 'idle';
    r.reason = 'Ready for a development scenario.'; r.remaining = 0;
    r.requested = false; r.visit_building = null; r.last_meal_slot = 3;
    r.target_x = r.x; r.target_y = r.y;
  }
  if(id.startsWith('sim-')) {
    const compact=[['home',9,9],['home',12,9],['warehouse',9,13],['garden',12,13],['kitchen',15,13],['well',15,9]];
    const dispersed=[['home',4,5],['home',12,5],['warehouse',5,19],['garden',19,19],['kitchen',19,6],['well',5,10]];
    const balanced=[['home',6,8],['home',10,8],['warehouse',18,13],['garden',14,17],['greenhouse',10,13],['kitchen',18,8],['well',18,17],['coop',6,13],['compost',6,17],['grove',10,17],['solar_farm',18,22],['streetlight',14,21]];
    const enclosed=[['warehouse',12,12],...[[10,10],[12,10],[14,10],[10,12],[14,12],[10,14],[12,14],[14,14]].map(([x,y])=>['home',x,y])];
    const layout=id==='sim-spread'?dispersed:id==='sim-balanced'?balanced:id==='sim-blocked'?enclosed:compact;
    v.economy=structuredClone(fresh.village.economy);v.economy.next_building=layout.length;
    v.building_jobs=[];v.roads=[];v.circular=structuredClone(fresh.village.circular);
    v.progress.completed.fill(true);v.progress.later_completed.fill(true);v.progress.gathering_until=0;v.progress.invited=0;v.progress.attended=0;
    v.buildings=layout.map(([kind,x,y],id)=>({...structuredClone(established.village.buildings[0]),id,kind,x,y,progress:100,contributors:0,next_visit:0,visits:0,poultry:{remaining:0}}));
    v.economy.projects=v.buildings.map(b=>({building:b.id,recipe:'standard',appearance:b.kind==='home'?b.id%4:0,priority:1,paused:false,stage:fresh.environment.economy.recipes.find(r=>r.kind===b.kind).standard.length,labour:0,committed:false,reserved:Array(15).fill(0),consumed:Array(15).fill(0)}));
    v.power={stored:id==='sim-balanced'?30:0,disabled:[]};v.food=36;v.meals=10;v.water=80;v.minutes=1440+540;
    for(const b of v.buildings)if(['garden','greenhouse'].includes(b.kind))Object.assign(b.crop,{planted:true,kind:'lettuce',next_kind:'lettuce',growth:90,moisture:180,nursery:0,harvests:0});
    if(id==='sim-poor'){v.economy.money=0;v.economy.ledger=[];v.economy.stock.fill(0);v.wood=0;v.economy.outside_jobs[1]=true;}
    for(const r of state.residents)Object.assign(r,{x:8+r.id*1.2,y:17,target_x:8+r.id*1.2,target_y:17,activity_building:null,activity_material:null,trip:null,last_sanitation_day:-1});
  }
  if (id.startsWith('economy')) {
    v.power={stored:0,disabled:[]};
    v.buildings=[['home',8,8],['greenhouse',13,8],['solar_farm',17,13]].map(([kind,x,y],id)=>({id,kind,x,y,progress:0,contributors:0,next_visit:0,visits:0,crop:structuredClone(fresh.village.buildings[0]?.crop||established.village.buildings[0].crop),poultry:{remaining:0}}));
    v.economy=structuredClone(fresh.village.economy);v.wood=12;v.economy.next_building=3;
    v.economy.projects=v.buildings.map(b=>({building:b.id,recipe:'standard',priority:1,paused:false,stage:0,labour:0,committed:false,reserved:Array(15).fill(0),consumed:Array(15).fill(0)}));
    const stock=[v.wood,...v.economy.stock.slice(1)];
    for(const p of v.economy.projects){const kind=v.buildings[p.building].kind,needs=fresh.environment.economy.recipes.find(r=>r.kind===kind).standard[0].items;for(let i=0;i<15;i++){p.reserved[i]=Math.min(stock[i],needs[i]);stock[i]-=p.reserved[i];}}
    if(id==='economy-poor'){v.economy.money=0;v.economy.ledger=[];}
    if(id==='economy-depleted'){v.economy.land=[0,0,0];for(const source of v.economy.sources)if(source.material>1)source.remaining=0;}
  }
  if(id==='cultivation'){
    v.economy.sources=[
      {material:0,x:4,y:3,maximum:32,remaining:0,growth:.75},
      {material:1,x:10,y:4,maximum:24,remaining:0,growth:.5},
      {material:3,x:22,y:22,maximum:96,remaining:v.economy.land[1],growth:1},
    ].map(site=>({...site,restored:false,player_placed:true,active:true,moisture:site.material<2?1440:0,planted:site.material<2,auto_replant:true,auto_harvest:true,harvest_requested:false,plant_requested:false,harvests:0}));
  }
  if(id.startsWith('circular')||id==='banana') {
    v.buildings=[['home',6,8],['home',10,8],['eco_toilet',14,8],['kitchen',18,8],['biodigester',6,13],['wetland',14,13],['warehouse',18,13],['garden',14,17],['well',18,17],['streetlight',21,13],['hydro',24,13]].map(([kind,x,y],id)=>({id,kind,x,y,progress:100,contributors:0,next_visit:0,visits:0,crop:structuredClone(established.village.buildings[0].crop),poultry:{remaining:0}}));
    if(id==='banana')v.buildings.push({...structuredClone(v.buildings[0]),id:v.buildings.length,kind:'banana_treatment',x:9,y:17});
    v.economy.projects=v.buildings.map(b=>({building:b.id,recipe:b.kind==='home'?'adobe':'standard',appearance:b.kind==='home'?4+b.id:0,priority:1,paused:false,stage:fresh.environment.economy.recipes.find(r=>r.kind===b.kind)[b.kind==='home'?'adobe':'standard'].length,labour:0,committed:false,reserved:Array(15).fill(0),consumed:Array(15).fill(0)}));
    v.economy.next_building=v.buildings.length;v.economy.orders=[];
    v.circular={...fresh.village.circular,waste:id==='banana'?8:4,greywater:24,auto_feed:id!=='banana'};v.progress.scraps=4;
    v.power={stored:12,disabled:[]};v.minutes=1440+(id==='circular-night'?1260:600);
    v.roads=[[5,10],[6,10],[7,10],[9,10],[10,10],[11,10],[17,15],[18,15],[19,15]];
    for(const r of state.residents){r.x=r.target_x=5+r.id*2.5;r.y=r.target_y=19;r.last_sanitation_day=-1;r.activity_building=null;r.trip=null;}
  }
  if (id === 'grid') {
    const roads=new Map();
    for(const b of v.buildings){
      const f=footprint(b.kind,b.x,b.y),right=Math.floor(f.maxX)+1,front=Math.floor(f.maxY)+1;
      for(let x=Math.ceil(f.minX);x<=right;x++)roads.set(`${x},${front}`,[x,front]);
      for(let y=Math.ceil(f.minY);y<=front;y++)roads.set(`${right},${y}`,[right,y]);
    }
    v.roads=[...roads.values()].filter(([x,y])=>x>=1&&y>=1&&x<MAP_SIZE-1&&y<MAP_SIZE-1&&!riverBank(x,y)&&!v.buildings.some(b=>occupies(b,x,y)));
  }
  if(id==='occupations'){v.minutes=1440+540;v.economy.outside_jobs=[true,true,true,true,true];}
  if(id==='rain')v.minutes=1440+900;
  if(id==='after-rain')v.minutes=1440+1080;
  if(id==='dry-afternoon')v.minutes=2880+900;
  if (id === 'hungry') {
    v.food = 0; v.meals = 0;
    for (const r of state.residents) r.hunger = 85;
  }
  if (id === 'harvest') {
    v.food = 12; v.meals = 5;
    const garden = v.buildings.find(b => b.kind === 'garden');
    Object.assign(garden.crop, { planted: true, kind: 'lettuce', next_kind: 'lettuce', growth: 180, moisture: 180, harvests: 0 });
    const r = state.residents.find(r => r.id === 0);
    r.x = r.target_x = garden.x + .75; r.y = r.target_y = garden.y + .75;
  }
  if (id === 'cook') v.situations.cooking = [[0,0,4,0,0],[0,0,4,0,0],[0,0,0,0,0]];
  if (id === 'coop') v.buildings.find(b => b.kind === 'coop').poultry.remaining = .75;
  if (['night','power','power-outage'].includes(id)) v.minutes = 1440 + 1260;
  if(id==='power')v.power.stored=28;
  if(id==='power-outage')v.power.stored=0;
  if (id === 'leisure') {
    v.minutes = 1440 + 810;
    v.food = 18; v.meals = 8;
    for (const r of state.residents) r.last_meal_slot = 4;
  }
  return state;
}
export function advanceGame(game, minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 1440) throw new Error('Advance between 0 and 1440 game minutes.');
  const seconds = minutes / 3;
  const fullSteps = Math.floor(seconds / .25);
  for (let i = 0; i < fullSteps; i++) game.tick(.25);
  const remainder = seconds - fullSteps * .25;
  if (remainder > 1e-7) game.tick(remainder);
}
