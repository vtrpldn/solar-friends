import {MAP_METRES} from '../land/layout.js';
const NAV_HALF=MAP_METRES/2;
import { ASSETS } from "../library/catalog.js";
import { footprint } from "../land/editor.js";
import { placementPosition } from "../land/layout.js";
import { connections } from "../land/connections.js";
export const INTERACTIONS = {
  "garden-bench": [["sit", "Sit on the bench"]],
  shed: [["sit", "Rest in the shade"]],
  "picnic-table": [["sit", "Sit at the table"]],
  hammock: [["rest", "Rest in the hammock"]],
  garden: [
    ["water", "Water the garden"],
    ["tend", "Tend the vegetables"],
  ],
  "seedling-bench": [["work", "Tend the seedlings"]],
  workshop: [["work", "Work at the bench"]],
  kitchen: [["work", "Prepare food"]],
  "wash-station": [["wash", "Wash hands"]],
  "produce-crates": [["carry", "Pick up and carry a crate"]],
};
export function worldAnchor(record, point) {
  const [x, , z] = placementPosition(
      record.column,
      record.row,
      footprint(record),
    ),
    a = (record.rotation * Math.PI) / 180;
  return [
    x + Math.cos(a) * point[0] + Math.sin(a) * point[1],
    z - Math.sin(a) * point[0] + Math.cos(a) * point[1],
  ];
}
export function interactionSlots(record, records) {
  if (!INTERACTIONS[record.asset]) return [];
  let slots = [];
  const [width,depth]=ASSETS.find(a=>a.id===record.asset).footprint;
  if (record.asset === "garden") {
    const edges = connections(records).get(record.id)?.edges ?? [
      [[-width,-depth],[-width,depth]],[[width,-depth],[width,depth]],
      [[-width,-depth],[width,-depth]],[[-width,depth],[width,depth]],
    ];
    for (const [a, b] of edges) {
      const x = (a[0] + b[0]) / 2,
        z = (a[1] + b[1]) / 2,
        nx = a[0] === b[0] ? Math.sign(x) : 0,
        nz = nx ? 0 : Math.sign(z);
      slots.push({
        at: [x + nx * 0.45, z + nz * 0.45],
        approach: [x + nx * 1.3, z + nz * 1.3],
        yaw: Math.atan2(-nx, -nz),
      });
    }
  } else {
    const s = {
      "garden-bench": [[0, 0], [0, 1.5], 0],
      shed: [[0, -0.4], [0, 1.6], 0],
      "picnic-table": [[0, 0.85], [0, 1.7], Math.PI],
      hammock: [[-0.15, 0], [-0.15, 1.7], 0],
      "seedling-bench": [[0, 0.74], [0, 1.5], Math.PI],
      workshop: [[-2.3, .95], [0, depth+1.3], Math.PI],
      kitchen: [[-1, -2.3], [0, depth+1.3], Math.PI],
      "wash-station": [[0, 0.52], [0, 1.5], Math.PI],
      "produce-crates": [[0.35, 0.85], [0.35, 1.5], Math.PI],
    }[record.asset];
    slots = [{ at: s[0], approach: [s[1][0],Math.max(s[1][1],depth+1.3)], yaw: s[2] }];
  }
  return slots.map((s) => ({
    ...s,
    at: worldAnchor(record, s.at),
    approach: worldAnchor(record, s.approach),
    yaw: s.yaw + (record.rotation * Math.PI) / 180,
  }));
}
// One-metre navigation cells, inflated by a resident's shoulder radius. Target
// interiors are only entered through the authored final approach above.
export function navigation(records, otherResidents = []) {
  const blocked = new Set(),
    key = (x, z) => z * MAP_METRES + x;
  for (const r of records) {
    const category = ASSETS.find((a) => a.id === r.asset)?.category;
    if (["Residents", "Terrain", "Crops"].includes(category)) continue;
    const [w, d] = footprint(r),
      left = r.column * 2 - 0.28,
      top = r.row * 2 - 0.28,
      right = (r.column + w) * 2 + 0.28,
      bottom = (r.row + d) * 2 + 0.28;
    for (
      let x = Math.max(0, Math.floor(left));
      x < Math.min(MAP_METRES, Math.ceil(right));
      x++
    )
      for (
        let z = Math.max(0, Math.floor(top));
        z < Math.min(MAP_METRES, Math.ceil(bottom));
        z++
      )
        if (
          x + 0.5 > left &&
          x + 0.5 < right &&
          z + 0.5 > top &&
          z + 0.5 < bottom
        )
          blocked.add(key(x, z));
  }
  for (const [x, z] of otherResidents)
    blocked.add(key(Math.floor(x + NAV_HALF), Math.floor(z + NAV_HALF)));
  return { blocked, key };
}
export function findRoute(start, end, nav) {
  const cell = (p) => p.map((v) => Math.floor(v + NAV_HALF)),
    [sx, sz] = cell(start),
    [ex, ez] = cell(end),
    { blocked, key } = nav;
  if (
    [sx, sz, ex, ez].some((v) => v < 0 || v >= MAP_METRES) ||
    blocked.has(key(ex, ez)) ||
    blocked.has(key(sx, sz))
  )
    return null;
  const begin = key(sx, sz),
    finish = key(ex, ez),
    queue = [begin],
    parents = new Map([[begin, null]]);
  for (let i = 0; i < queue.length; i++) {
    const here = queue[i];
    if (here === finish) break;
    const x = here % MAP_METRES,
      z = Math.floor(here / MAP_METRES);
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx,
        nz = z + dz,
        next = key(nx, nz);
      if (
        nx < 0 ||
        nz < 0 ||
        nx >= MAP_METRES ||
        nz >= MAP_METRES ||
        blocked.has(next) ||
        parents.has(next)
      )
        continue;
      parents.set(next, here);
      queue.push(next);
    }
  }
  if (!parents.has(finish)) return null;
  const route = [];
  let at = finish;
  while (at !== begin) {
    route.push([(at % MAP_METRES) - (NAV_HALF-.5), Math.floor(at / MAP_METRES) - (NAV_HALF-.5)]);
    at = parents.get(at);
  }
  route.reverse();
  route.push([...end]);
  return route;
}
