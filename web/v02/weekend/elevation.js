import { landParameters } from "./land-layout.js";
import { riverCenter, riverWidth } from "./river-layout.js";
import { roadCenter } from "./road-layout.js";
const smooth = (n) => {
  const t = Math.max(0, Math.min(1, n));
  return t * t * (3 - 2 * t);
};
export function elevationVertex(x, z, seed = 0) {
  if (!seed) return 0;
  const p = landParameters(seed);
  // A level starting clearing and continuous low river/road corridors.
  const clearing = smooth((Math.hypot(x, z) - 29) / 15);
  const river = smooth(
    (Math.abs(x - riverCenter(z, seed)) - riverWidth(z, seed) - 5) / 9,
  );
  const road = z < -14 ? smooth((Math.abs(x - roadCenter(z)) - 8) / 10) : 1;
  const hills =
    3.5 +
    2.5 * Math.sin(x * 0.065 + p.phase) * Math.cos(z * 0.052 - p.phase) +
    1.5 * Math.sin(z * 0.105 + p.phase * 0.7);
  return Math.max(0, hills) * clearing * river * road;
}
// Sample the same two triangles as the terrain mesh, avoiding floating feet.
export function elevationAt(x, z, seed = 0) {
  const ix = Math.max(0, Math.min(63, Math.floor((x + 64) / 2))),
    iz = Math.max(0, Math.min(63, Math.floor((z + 64) / 2)));
  const left = ix * 2 - 64,
    top = iz * 2 - 64;
  const u = Math.max(0, Math.min(1, (x - left) / 2)),
    v = Math.max(0, Math.min(1, (z - top) / 2));
  const a = elevationVertex(left, top, seed),
    b = elevationVertex(left, top + 2, seed),
    d = elevationVertex(left + 2, top, seed);
  if (u + v <= 1) return a + (d - a) * u + (b - a) * v;
  const c = elevationVertex(left + 2, top + 2, seed);
  return c + (b - c) * (1 - u) + (d - c) * (1 - v);
}
export function footprintRelief(x, z, w, d, seed = 0) {
  let low = Infinity,
    high = -Infinity;
  for (let i = 0; i <= w; i++)
    for (let j = 0; j <= d; j++) {
      const y = elevationAt(
        (x - 32) * 2 - 1 + i * 2,
        (z - 32) * 2 - 1 + j * 2,
        seed,
      );
      low = Math.min(low, y);
      high = Math.max(high, y);
    }
  return high - low;
}
