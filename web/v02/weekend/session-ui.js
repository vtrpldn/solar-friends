// Everyone asleep or away: nothing to watch, so run at 64× until someone is back.
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
// Wall time the visible loop still owes the simulation. Slow frames and steps
// that outrun their budget carry over here instead of being dropped, so game
// time follows the labelled speed. `limit` bounds the carry-over: a long stall
// or a machine that cannot keep up loses the excess instead of jumping ahead
// or spiralling. `ratio` is the share of the last second of wall time that was
// simulated, and `slow` counts consecutive seconds that fell short.
export function createPace(limit = 1) {
  return {debt: 0, limit, ratio: 1, slow: 0, wall: 0, spent: 0};
}
export function resetPace(pace) {
  pace.debt = pace.wall = pace.spent = pace.slow = 0;
  pace.ratio = 1;
}
// Without `pace`, a frame simulates at most 100ms and drops what it cannot
// finish in 8ms. With `pace`, unspent wall time is kept as bounded debt and the
// step budget grows with the frame interval (a quarter of it, 8-30ms), which
// leaves the rest of every frame for input and paint however slow rendering is.
export function simulationFrame(accumulator, elapsed, speed, step, now = () => performance.now(), pace = null) {
  elapsed = Math.max(0, elapsed);
  let remaining = pace ? Math.min(pace.debt + elapsed, pace.limit) : Math.min(elapsed, .1);
  const owed = remaining;
  const budget = pace ? Math.min(30, Math.max(8, elapsed * 250)) : 8;
  const started = now();
  while (remaining > 1e-9) {
    const currentSpeed = typeof speed === 'function' ? speed() : speed;
    const needed = (.1 - accumulator) / currentSpeed;
    if (remaining + 1e-12 < needed) {
      accumulator += remaining * currentSpeed;
      remaining = 0;
      break;
    }
    remaining = Math.max(0, remaining - needed);
    accumulator = 0;
    step(.1);
    if (now() - started >= budget) break;
  }
  if (pace) {
    pace.debt = remaining;
    // One stalled frame counts for at most `limit`, so it cannot dominate the meter.
    pace.wall += Math.min(elapsed, pace.limit);
    pace.spent += owed - remaining;
    if (pace.wall >= 1) {
      pace.ratio = pace.spent / pace.wall;
      pace.slow = pace.ratio < .9 ? pace.slow + 1 : 0;
      pace.wall = pace.spent = 0;
    }
  }
  return accumulator;
}
// The speed the simulation is really achieving, or null while it keeps up.
// A single hitch is repaid from the debt; only a sustained shortfall is reported.
export function laggingSpeed(pace, labelled) {
  return pace.slow >= 2 ? Math.max(.1, labelled * pace.ratio) : null;
}
// Spend hidden wall time in fixed simulation steps, using the same automatic
// sleep/away speed as visible play. Leave enough frame time for input and paint.
export function catchUpFrame(seconds, accumulator, speed, step, now = () => performance.now()) {
  const start = now();
  while (seconds > 0) {
    const rate = speed();
    const cost = (.1 - accumulator) / rate;
    if (seconds + 1e-12 < cost) {
      accumulator += seconds * rate;
      seconds = 0;
      break;
    }
    step(.1);
    accumulator = 0;
    seconds = Math.max(0, seconds - cost);
    if (now() - start >= 8) break;
  }
  return {seconds, accumulator};
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
  if (def.kind === 'carport') return 'Vehicle care: the cars parked beneath weather three times more slowly.';
  if (def.kind === 'home') return `Housing: ${def.beds || 2} resting places for residents.`;
  if (['warehouse','covered-storage'].includes(def.kind)) return 'Storage: adds 600 supply spaces in story mode. Sandbox storage stays unlimited.';
  if (community[def.kind]) return `Recreation: ${community[def.kind].activity.toLowerCase()}. Helps residents recover fun during breaks.`;
  if (['square','picnic-table','garden-bench','fire-circle','hammock'].includes(def.kind)) return 'Recreation: residents visit during breaks to recover fun.';
  const outputs = [...new Set(Object.values(processes).filter(r=>r.kind===def.kind).map(r=>r.name))];
  return outputs.length ? `Available work: ${outputs.join(' · ')}.` : '';
}
