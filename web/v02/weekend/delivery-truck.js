import { MAP_HALF } from "./map-size.js";
import { roadCenter, PARK_Z } from "./road-layout.js";
// The supplier truck drives in along the access road, parks beside the
// residents' cars and cranes its load onto the receiving pile by the supplies.
export const TRUCK_DRIVE = 18, TRUCK_UNLOAD = 40, BUNDLE_SECONDS = 6, MAX_BUNDLES = 8;
export const TRUCK_PARK = { x: -4.25, z: PARK_Z + 0.3 };
export const PILE = { x: -2.05, z: PARK_Z + 3.15 };
export function truckPhase(delivery, leaving) {
  if (delivery && delivery.left <= 0) return "unloading";
  if (delivery && delivery.left <= TRUCK_DRIVE) return "inbound";
  if (leaving) return "leaving";
  return "away";
}
export function truckPose(delivery, leaving) {
  const phase = truckPhase(delivery, leaving);
  if (phase === "away") return { ...TRUCK_PARK, yaw: 0, visible: false, phase };
  if (phase === "unloading") return { ...TRUCK_PARK, yaw: 0, visible: true, phase };
  const outgoing = phase === "leaving";
  const t = Math.max(0, Math.min(1, 1 - (outgoing ? leaving.left : delivery.left) / TRUCK_DRIVE));
  const smooth = t * t * (3 - 2 * t), fraction = outgoing ? smooth : 1 - smooth;
  const z = TRUCK_PARK.z + (-MAP_HALF - 8 - TRUCK_PARK.z) * fraction;
  const x = roadCenter(z) + (TRUCK_PARK.x - roadCenter(TRUCK_PARK.z)) * (1 - fraction);
  const ahead = z + (outgoing ? -0.1 : 0.1);
  const tangent = Math.atan2(roadCenter(ahead) - roadCenter(z), ahead - z);
  // Like the cars, it swings round on the spot before heading for the gate.
  return { x, z, yaw: outgoing ? tangent * Math.min(1, t * 6) : tangent * Math.min(1, (1 - t) * 6), visible: true, phase };
}
// Crane-lifts on the bed: one per half tonne, so a bigger order looks bigger.
export function bundleCount(kg) {
  return Math.max(1, Math.min(MAX_BUNDLES, Math.round(kg / 500)));
}
// Bed slots fill from the cab backwards; the crane clears the tail first.
export function bedSlot(index) {
  return { x: index % 2 ? 0.52 : -0.52, y: 1.06, z: -0.25 - Math.floor(index / 2) * 0.85 };
}
// The pile is two bundles square and two high.
export function pileSlot(index) {
  const i = index % MAX_BUNDLES;
  return { x: PILE.x + (i % 2 ? 0.52 : -0.52), y: i >= 4 ? 0.56 : 0, z: PILE.z + (Math.floor(i / 2) % 2 ? 0.43 : -0.43) };
}
// Which lift is in the air, and how far through its cycle, after `elapsed`
// time parked. Lifts beyond `count` mean the bed is empty and the crane rests.
export function unloadProgress(elapsed, count) {
  const cycle = Math.min(BUNDLE_SECONDS, TRUCK_UNLOAD / count);
  const done = Math.max(0, Math.min(count, Math.floor(elapsed / cycle)));
  return { done, fraction: done >= count ? 0 : elapsed / cycle - done };
}
const ease = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const HIGH = 2.55, REST = { x: 0, z: -1.0 };
// Hook position for one lift in truck-local coordinates, swinging around the
// mast rather than cutting straight across. `from` is where the hook starts.
export function craneCycle(fraction, source, dest, from = REST, mast = { x: 0, z: 0.72 }) {
  const polar = (p) => ({ a: Math.atan2(p.x - mast.x, p.z - mast.z), r: Math.hypot(p.x - mast.x, p.z - mast.z) });
  const swing = (a, b, t) => {
    const p = polar(a), q = polar(b);
    let turn = q.a - p.a;
    if (turn > Math.PI) turn -= 2 * Math.PI;
    if (turn < -Math.PI) turn += 2 * Math.PI;
    const angle = p.a + turn * t, radius = p.r + (q.r - p.r) * t;
    return { x: mast.x + Math.sin(angle) * radius, z: mast.z + Math.cos(angle) * radius };
  };
  const stage = (start, end) => ease((fraction - start) / (end - start));
  const top = (p) => p.y + 0.56;
  if (fraction < 0.22) return { ...swing(from, source, stage(0, 0.22)), y: HIGH, carrying: false };
  if (fraction < 0.34) return { x: source.x, z: source.z, y: HIGH + (top(source) - HIGH) * stage(0.22, 0.34), carrying: false };
  if (fraction < 0.48) return { x: source.x, z: source.z, y: top(source) + (HIGH - top(source)) * stage(0.34, 0.48), carrying: true };
  if (fraction < 0.74) return { ...swing(source, dest, stage(0.48, 0.74)), y: HIGH, carrying: true };
  if (fraction < 0.9) return { x: dest.x, z: dest.z, y: HIGH + (top(dest) - HIGH) * stage(0.74, 0.9), carrying: true };
  return { x: dest.x, z: dest.z, y: top(dest) + (HIGH - top(dest)) * stage(0.9, 1), carrying: false };
}
export const CRANE_REST = { ...REST, y: HIGH };
