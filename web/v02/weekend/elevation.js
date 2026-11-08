import { MAP_CELLS, MAP_HALF } from "./map-size.js";
import { landParameters } from "./land-layout.js";
import { riverCenter, riverWidth, riverBankAt } from "./river-layout.js";
import { roadCenter, accessRoadAt, ROAD_END_Z } from "./road-layout.js";
const smooth = (n) => {
  const t = Math.max(0, Math.min(1, n));
  return t * t * (3 - 2 * t);
};
function naturalVertex(x, z, seed = 0) {
  if (!seed) return 0;
  const p = landParameters(seed);
  // A level starting clearing and continuous low river/road corridors.
  const clearing = smooth((Math.hypot(x, z) - 29) / 15);
  const river = smooth(
    (Math.abs(x - riverCenter(z, seed)) - riverWidth(z, seed) - 5) / 9,
  );
  const road = smooth(Math.hypot(
    Math.max(0, Math.abs(x - roadCenter(z)) - 8),
    Math.max(0, z - ROAD_END_Z - 3),
  ) / 10);
  const hills =
    p.hillHeight * .6 +
    p.hillHeight * .5 * Math.sin(x * p.hillScaleX + p.phase) * Math.cos(z * p.hillScaleZ - p.phase) +
    p.ridge * Math.sin(z * .105 + p.phase * .7);
  return Math.max(0, hills) * clearing * river * road;
}
// Pads cover whole mesh triangles beneath the foundation. Blended shoulders
// never override another pad's level interior.
const layers = new WeakMap();
function terrainLayers(pads) {
  let layer = layers.get(pads);
  if (!layer || layer.length !== pads.length) {
    layer = {length:pads.length, foundations:pads.filter(p=>!p.terraform), vertices:pads.find(p=>p.terraform)?.vertices || {}};
    layers.set(pads,layer);
  }
  return layer;
}
export function elevationVertex(x, z, seed = 0, pads = []) {
  const layer = terrainLayers(pads);
  const natural = layer.vertices[`${x},${z}`] ?? naturalVertex(x, z, seed);
  let total = 0,
    height = 0,
    strongest = 0;
  for (const p of layer.foundations) {
    const distance = Math.hypot(
      Math.max(p.left - x, 0, x - p.right),
      Math.max(p.top - z, 0, z - p.bottom),
    );
    if (distance < 0.0001) return p.height;
    const weight = 1 - smooth(distance / 8);
    total += weight;
    height += p.height * weight;
    strongest = Math.max(strongest, weight);
  }
  if (!total) return natural;
  // Keep the existing riverbed and access road intact outside foundations.
  if (
    accessRoadAt(x / 2 + 32, z / 2 + 32, 1) ||
    riverBankAt(x / 2 + 32, z / 2 + 32, 1, seed)
  )
    return natural;
  return total
    ? natural * (1 - strongest) + (height / total) * strongest
    : natural;
}
export function foundationPad(x, z, w, d, seed = 0, pads = []) {
  const pad = {
    left: Math.floor(((x - 32) * 2 - 1) / 2) * 2,
    right: Math.ceil(((x + w - 32) * 2 - 1) / 2) * 2,
    top: Math.floor(((z - 32) * 2 - 1) / 2) * 2,
    bottom: Math.ceil(((z + d - 32) * 2 - 1) / 2) * 2,
  };
  const touching = pads.filter(
    (p) =>
      !p.terraform && pad.left <= p.right &&
      pad.right >= p.left &&
      pad.top <= p.bottom &&
      pad.bottom >= p.top,
  );
  if (touching.some((p) => Math.abs(p.height - touching[0].height) > 0.001))
    return null;
  pad.height = touching.length
    ? touching[0].height
    : elevationAt(
        (pad.left + pad.right) / 2,
        (pad.top + pad.bottom) / 2,
        seed,
        pads,
      );
  return pad;
}
// Sample the same two triangles as the terrain mesh, avoiding floating feet.
export function elevationAt(x, z, seed = 0, pads = []) {
  const ix = Math.max(
      0,
      Math.min(MAP_CELLS - 1, Math.floor((x + MAP_HALF) / 2)),
    ),
    iz = Math.max(0, Math.min(MAP_CELLS - 1, Math.floor((z + MAP_HALF) / 2)));
  const left = ix * 2 - MAP_HALF,
    top = iz * 2 - MAP_HALF;
  const u = Math.max(0, Math.min(1, (x - left) / 2)),
    v = Math.max(0, Math.min(1, (z - top) / 2));
  const a = elevationVertex(left, top, seed, pads),
    b = elevationVertex(left, top + 2, seed, pads),
    d = elevationVertex(left + 2, top, seed, pads);
  if (u + v <= 1) return a + (d - a) * u + (b - a) * v;
  const c = elevationVertex(left + 2, top + 2, seed, pads);
  return c + (b - c) * (1 - u) + (d - c) * (1 - v);
}
export function footprintRelief(x, z, w, d, seed = 0, pads = []) {
  let low = Infinity,
    high = -Infinity;
  for (let i = 0; i <= w; i++)
    for (let j = 0; j <= d; j++) {
      const y = elevationAt(
        (x - 32) * 2 - 1 + i * 2,
        (z - 32) * 2 - 1 + j * 2,
        seed,
        pads,
      );
      low = Math.min(low, y);
      high = Math.max(high, y);
    }
  return high - low;
}
