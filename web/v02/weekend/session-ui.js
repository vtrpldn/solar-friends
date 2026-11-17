// Keep fast-forward responsive even when routing is expensive. Slow simulated
// time under load instead of accumulating a catch-up spiral on the UI thread.
export function simulationSpeed(state, preferred) {
  if (state.stage !== 'playing' || !state.people.length) return preferred;
  const trips = [state.trip, state.secondTrip].filter(Boolean);
  const unavailable = state.people.every(person =>
    (person.tentPhase === 'inside' && person.sleepUntil > state.time) ||
    person.outsideWork?.phase === 'away' ||
    trips.some(trip => trip.person === person.id && ['outbound', 'away', 'inbound'].includes(trip.phase))
  );
  return unavailable ? 64 : preferred;
}
export function simulationFrame(accumulator, elapsed, speed, step, now = () => performance.now()) {
  let remaining = Math.min(elapsed, .1);
  const started = now();
  while (remaining > 1e-9) {
    const currentSpeed = typeof speed === 'function' ? speed() : speed;
    const needed = (.1 - accumulator) / currentSpeed;
    if (remaining + 1e-12 < needed) return accumulator + remaining * currentSpeed;
    remaining = Math.max(0, remaining - needed);
    accumulator = 0;
    step(.1);
    if (now() - started >= 8) return 0;
  }
  return accumulator;
}
export function restoredView(view) {
  if (!view || ![1,4,8,16].includes(view.speed) || typeof view.paused !== 'boolean' ||
      ![view.position,view.target].every(v => Array.isArray(v) && v.length === 3 && v.every(n => Number.isFinite(n) && Math.abs(n)<10000)) ||
      !Number.isFinite(view.zoom) || view.zoom < .18 || view.zoom > 6) return null;
  return view;
}
export function wasteWarnings(node) {
  return ['Greywater','Sewage'].flatMap((name,j) => {
    const i=j+2, capacity=node.capacity?.[i], amount=node.water?.[i];
    return capacity>0 && amount/capacity>=.9 ? [`${name} tank ${amount>=capacity-.1?'full':'nearly full'} (${amount.toFixed(1)}/${capacity})`] : [];
  });
}
export function operationalStatus(project, node, activity) {
  if (node?.enabled === false) return 'Switched off';
  if (node?.demand > 0 && node.power < .99) return node.power > 0 ? 'Limited power' : 'Waiting for power';
  if (activity) return activity.label;
  return 'Ready to use';
}
export function buildingBenefit(def, processes, community) {
  if (def.kind === 'home') return `Housing: ${def.beds || 2} resting places for residents.`;
  if (['warehouse','covered-storage'].includes(def.kind)) return 'Storage: adds 600 supply spaces in story mode. Sandbox storage stays unlimited.';
  if (community[def.kind]) return `Recreation: ${community[def.kind].activity.toLowerCase()}. Helps residents recover fun during breaks.`;
  if (['square','picnic-table','garden-bench','fire-circle','hammock'].includes(def.kind)) return 'Recreation: residents visit during breaks to recover fun.';
  const outputs = [...new Set(Object.values(processes).filter(r=>r.kind===def.kind).map(r=>r.name))];
  return outputs.length ? `Available work: ${outputs.join(' · ')}.` : '';
}
