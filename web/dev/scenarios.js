import { footprint, occupies } from '../building-footprints.js';
import { MAP_SIZE, riverBank } from '../terrain.js';
export const scenarios = [
  { id: 'economy', name: 'Our first projects', detail: 'A home, greenhouse and solar farm with staged materials. Try priorities, local recipes, purchases and deliveries.' },
  { id: 'economy-poor', name: 'An empty shared fund', detail: 'Three blueprints, no money. Enable outside shifts in Town to recover without selling household food.' },
  { id: 'economy-depleted', name: 'Depleted land', detail: 'Finite deposits are empty. Local preparation and town purchases still provide a route forward.' },
  { id: 'grid', name: 'Grid & road edges', detail: 'Every foundation with roads along its front edges. Select Road to inspect grid registration.' },
  { id: 'power', name: 'Stored sunshine', detail: 'A charged solar farm and connected lights at 21:00. Switch loads off in Power to compare.' },
  { id: 'power-outage', name: 'Empty battery', detail: 'An empty shared battery at 21:00; rooftop homes remain lit. Advance until sunrise to recharge.' },
  { id: 'arrival', name: 'Fresh arrival', detail: 'The real starting state, before anyone reaches the clearing.' },
  { id: 'village', name: 'Established village', detail: 'Every building, supplies, and completed quests for interaction checks.' },
  { id: 'hungry', name: 'Hungry village', detail: 'Empty pantry and hungry residents during the morning work block.' },
  { id: 'harvest', name: 'First harvest', detail: 'A mature lettuce bed, ready for Iara to harvest.' },
  { id: 'cook', name: 'Overworked cook', detail: 'Staged cooking history across two days; one tick raises the real concern.' },
  { id: 'coop', name: 'Full coop', detail: 'Three hens, a fed batch almost complete, and room for eggs.' },
  { id: 'night', name: 'Night lighting', detail: 'All buildings at 21:00, with the normal night renderer.' },
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
  const state = structuredClone(established), v = state.village;
  v.minutes = 1440 + 600;
  v.wood = 110; v.food = 100; v.water = 100; v.meals = 10;
  v.supplies.eggs = 0;
  v.situations = { day: 1, cooking: [[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0]], active: null, resolved_count: 0 };
  for (const r of state.residents) {
    r.energy = 90; r.hunger = 20; r.social = 80; r.task = 'idle';
    r.reason = 'Ready for a development scenario.'; r.remaining = 0;
    r.requested = false; r.visit_building = null; r.last_meal_slot = 3;
    r.target_x = r.x; r.target_y = r.y;
  }
  if (id.startsWith('economy')) {
    v.power={stored:0,disabled:[]};
    v.buildings=[['home',8,8],['greenhouse',13,8],['solar_farm',17,13]].map(([kind,x,y],id)=>({id,kind,x,y,progress:0,contributors:0,next_visit:0,visits:0,crop:structuredClone(fresh.village.buildings[0]?.crop||established.village.buildings[0].crop),poultry:{remaining:0}}));
    v.economy=structuredClone(fresh.village.economy);v.wood=12;v.economy.next_building=3;
    v.economy.projects=v.buildings.map(b=>({building:b.id,recipe:'standard',priority:1,paused:false,stage:0,labour:0,committed:false,reserved:Array(15).fill(0),consumed:Array(15).fill(0)}));
    const stock=[v.wood,...v.economy.stock.slice(1)];
    for(const p of v.economy.projects){const kind=v.buildings[p.building].kind,needs=fresh.environment.economy.recipes.find(r=>r.kind===kind).standard[0].items;for(let i=0;i<15;i++){p.reserved[i]=Math.min(stock[i],needs[i]);stock[i]-=p.reserved[i];}}
    if(id==='economy-poor'){v.economy.money=0;v.economy.ledger=[];}
    if(id==='economy-depleted')for(const source of v.economy.sources)if(source.material>1)source.remaining=0;
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
