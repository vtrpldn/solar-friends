// Keep simulation decisions at 10 Hz, but draw between its last two states on
// every display frame. One fixed tick of visual latency avoids extrapolating
// through obstacles or inventing future actions.
export function captureMotion(state) {
  return {
    time: state.time,
    arrivalElapsed: state.arrivalElapsed,
    people: state.people.map((p) => ({ x: p.x, z: p.z })),
  };
}
export function interpolateMotion(previous, current, alpha) {
  const t = Math.max(0, Math.min(1, alpha)),
    mix = (a, b) => a + (b - a) * t;
  return {
    time: mix(previous.time, current.time),
    arrivalElapsed: mix(previous.arrivalElapsed, current.arrivalElapsed),
    people: current.people.map((p, i) => {
      const old = previous.people[i];
      // Town returns and resets are intentional discontinuities, not long walks.
      if (!old || Math.hypot(p.x - old.x, p.z - old.z) > 2)
        return { x: p.x, z: p.z };
      return { x: mix(old.x, p.x), z: mix(old.z, p.z) };
    }),
  };
}
