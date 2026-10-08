export const scenarios = [
  { id: 'power', name: 'Stored sunshine', detail: 'A charged solar farm and connected lights at 21:00. Switch loads off in Power to compare.' },
  { id: 'power-outage', name: 'Empty battery', detail: 'An empty shared battery at 21:00; rooftop homes remain lit. Advance until sunrise to recharge.' },
  { id: 'arrival', name: 'Fresh arrival', detail: 'The real starting state, before anyone reaches the clearing.' },
  { id: 'village', name: 'Established village', detail: 'Every building, supplies, and completed quests for interaction checks.' },
  { id: 'hungry', name: 'Hungry village', detail: 'Empty pantry and hungry residents during the morning work block.' },
  { id: 'harvest', name: 'First harvest', detail: 'A mature lettuce bed, ready for Iara to harvest.' },
  { id: 'cook', name: 'Overworked cook', detail: 'Staged cooking history across two days; one tick raises the real concern.' },
  { id: 'coop', name: 'Full coop', detail: 'Three hens, a fed batch almost complete, and room for eggs.' },
  { id: 'night', name: 'Night lighting', detail: 'All buildings at 21:00, with the normal night renderer.' },
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
