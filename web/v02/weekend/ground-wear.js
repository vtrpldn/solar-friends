import * as THREE from 'three';
import {MAP_CELLS, MAP_HALF, CELL_MIN} from './map-size.js';
import {riverBankAt} from './river-layout.js';

// The ground records how the village is used. Red holds footpaths worn between
// doors; green holds the swept-earth yard kept around each walled building.
const SIZE = 512, TEXELS = SIZE / (MAP_HALF * 2);
const FACING = [[0, 1], [1, 0], [0, -1], [-1, 0]];
const metres = cell => (cell - 32) * 2;
// Days of use before a new building's predicted paths are fully worn in.
const WEAR_IN_DAYS = 8;
// One stamp per STRIDE metres walked. A crossing adds about 0.003 to the middle
// of the track: grass yellows after some twenty crossings and only gives way to
// packed earth after seventy or more.
const STRIDE = .5, FOOTFALL = .0016;
const hasWalls = asset => /^(home-|adobe-|house|kitchen|warehouse|workshop|reading-room|community-hall|outdoor-classroom|eco_toilet|coop|shed|groundwater-well)/.test(asset);

export function createGroundWear() {
  const data = new Uint8Array(SIZE * SIZE * 4);
  const texture = new THREE.DataTexture(data, SIZE, SIZE);
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  // Wear is kept as fractions so single footsteps, far below one texture level,
  // still add up. `laid` is the predicted network, `walked` real footfall.
  const laid = new Float32Array(SIZE * SIZE), walked = new Float32Array(SIZE * SIZE);
  const since = new Map(), strides = new Map();
  let settled = '', dirty = false, first = true;

  function stamp(x, z, radius, layer, amount) {
    const cx = (x + MAP_HALF) * TEXELS, cz = (z + MAP_HALF) * TEXELS, r = radius * TEXELS;
    for (let tz = Math.max(0, Math.floor(cz - r)); tz <= Math.min(SIZE - 1, cz + r); tz++)
      for (let tx = Math.max(0, Math.floor(cx - r)); tx <= Math.min(SIZE - 1, cx + r); tx++) {
        const d = Math.hypot(tx + .5 - cx, tz + .5 - cz) / r;
        if (d >= 1) continue;
        const i = tz * SIZE + tx;
        layer[i] = Math.min(1, layer[i] + amount * (1 - d * d));
        data[i * 4] = Math.min(255, Math.round((laid[i] + walked[i]) * 255));
      }
    dirty = true;
  }
  // A rounded rectangle, deeper on the side the door opens onto.
  function yard(cx, cz, halfW, halfD, [fx, fz]) {
    const apron = 3, reach = 2.4;
    cx += fx * apron / 2; cz += fz * apron / 2;
    halfW += Math.abs(fx) * apron / 2 + .6; halfD += Math.abs(fz) * apron / 2 + .6;
    for (let tz = Math.max(0, Math.floor((cz - halfD - reach + MAP_HALF) * TEXELS)); tz <= Math.min(SIZE - 1, (cz + halfD + reach + MAP_HALF) * TEXELS); tz++)
      for (let tx = Math.max(0, Math.floor((cx - halfW - reach + MAP_HALF) * TEXELS)); tx <= Math.min(SIZE - 1, (cx + halfW + reach + MAP_HALF) * TEXELS); tx++) {
        const dx = Math.max(0, Math.abs((tx + .5) / TEXELS - MAP_HALF - cx) - halfW);
        const dz = Math.max(0, Math.abs((tz + .5) / TEXELS - MAP_HALF - cz) - halfD);
        const value = Math.max(0, 1 - Math.hypot(dx, dz) / reach);
        const i = (tz * SIZE + tx) * 4 + 1;
        data[i] = Math.max(data[i], value * 255);
      }
  }

  // Later walkers prefer ground that is already worn, so separate doors
  // converge on shared trunks the way real desire lines do.
  function route(from, to, blocked, worn, grain) {
    const index = (x, z) => (x - CELL_MIN) + (z - CELL_MIN) * MAP_CELLS;
    const start = index(...from), goal = index(...to);
    const cost = new Float64Array(MAP_CELLS * MAP_CELLS).fill(Infinity);
    const previous = new Int32Array(MAP_CELLS * MAP_CELLS).fill(-1);
    const heap = [[0, start]];
    cost[start] = 0;
    while (heap.length) {
      // The frontier stays small on this grid; a sorted insert is enough.
      const [distance, cell] = heap.shift();
      if (cell === goal) break;
      if (distance > cost[cell]) continue;
      const x = cell % MAP_CELLS, z = (cell - x) / MAP_CELLS;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= MAP_CELLS || nz >= MAP_CELLS) continue;
        const next = nx + nz * MAP_CELLS;
        if (blocked[next] && next !== goal) continue;
        const step = Math.hypot(dx, dz) * (worn[next] ? .42 : 1 + grain[next]);
        const total = distance + step;
        if (total >= cost[next]) continue;
        cost[next] = total; previous[next] = cell;
        let low = 0, high = heap.length;
        while (low < high) { const mid = (low + high) >> 1; if (heap[mid][0] < total) low = mid + 1; else high = mid; }
        heap.splice(low, 0, [total, next]);
      }
    }
    if (previous[goal] < 0) return [];
    const cells = [];
    for (let cell = goal; cell >= 0; cell = previous[cell]) { cells.push(cell); worn[cell] = 1; }
    return cells.map(cell => [metres(cell % MAP_CELLS + CELL_MIN), metres(Math.floor(cell / MAP_CELLS) + CELL_MIN)]);
  }
  function tread(points, amount, random) {
    if (points.length < 2) return;
    // Round the grid corners, then walk the line in half-metre steps.
    for (let pass = 0; pass < 3; pass++) {
      const next = [points[0]];
      for (let i = 0; i < points.length - 1; i++) {
        const [ax, az] = points[i], [bx, bz] = points[i + 1];
        next.push([ax * .75 + bx * .25, az * .75 + bz * .25], [ax * .25 + bx * .75, az * .25 + bz * .75]);
      }
      next.push(points.at(-1));
      points = next;
    }
    const sway = (random() - .5) * .8;
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, az] = points[i], [bx, bz] = points[i + 1];
      const length = Math.hypot(bx - ax, bz - az), steps = Math.max(1, Math.ceil(length / .5));
      for (let n = 0; n < steps; n++) {
        const t = n / steps;
        stamp(ax + (bx - ax) * t + sway * (bz - az) / (length || 1), az + (bz - az) * t - sway * (bx - ax) / (length || 1), .75, laid, amount);
      }
    }
  }

  return {
    texture,
    // Rebuilds yards and paths when the built village changes or a day passes.
    // Paths to a new building wear in over its first days; `day` is game days.
    settle(projects, defs, footprint, seed, day = 0) {
      const built = projects.filter(p => !p.natural && !defs[p.key].natural && defs[p.key].kind !== 'wild-tree' &&
        !p.felled && p.work >= defs[p.key].work &&
        !['road', 'bridge'].includes(p.key));
      // Buildings already standing when the village loads count as long used.
      for (const p of built) if (!since.has(p.id)) since.set(p.id, first ? -Infinity : day);
      first = false;
      const use = p => Math.min(WEAR_IN_DAYS, Math.max(0, Math.floor(day - since.get(p.id)))) / WEAR_IN_DAYS;
      const signature = built.map(p => `${p.id}:${p.x}:${p.z}:${p.rotation || 0}:${use(p)}`).join('|');
      if (signature === settled) return;
      settled = signature;
      laid.fill(0);
      for (let i = 0; i < walked.length; i++) { data[i * 4] = Math.min(255, Math.round(walked[i] * 255)); data[i * 4 + 1] = 0; }
      if (!built.length) { texture.needsUpdate = true; return; }
      let state = (seed ^ 0x7f4a7c15) >>> 0;
      const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
      const blocked = new Uint8Array(MAP_CELLS * MAP_CELLS), worn = new Uint8Array(MAP_CELLS * MAP_CELLS);
      const grain = Float32Array.from({length: MAP_CELLS * MAP_CELLS}, () => random() * .3);
      for (let z = 0; z < MAP_CELLS; z++) for (let x = 0; x < MAP_CELLS; x++)
        if (riverBankAt(x + CELL_MIN, z + CELL_MIN, 0, seed)) blocked[x + z * MAP_CELLS] = 1;
      const doors = [];
      let hub = null;
      for (const p of built) {
        const def = defs[p.key], [w, d] = footprint(p), open = ['square', 'fire-circle'].includes(def.asset);
        if (!open) for (let z = p.z; z < p.z + d; z++) for (let x = p.x; x < p.x + w; x++)
          blocked[(x - CELL_MIN) + (z - CELL_MIN) * MAP_CELLS] = 1;
        const facing = FACING[(p.rotation || 0) % 4];
        const cx = p.x + (w - 1) / 2, cz = p.z + (d - 1) / 2;
        const door = [Math.round(cx + facing[0] * (w / 2 + .5)), Math.round(cz + facing[1] * (d / 2 + .5))];
        if (def.asset === 'square' || (def.asset === 'fire-circle' && !hub)) hub = [Math.round(cx), Math.round(cz)];
        if (hasWalls(def.asset)) yard(metres(cx), metres(cz), w, d, facing);
        else if (!open) stamp(metres(door[0]), metres(door[1]), 1.8, laid, .5 * use(p));
        if (!open) { door.use = use(p); doors.push(door); }
      }
      hub ??= doors.reduce((sum, door) => [sum[0] + door[0] / doors.length, sum[1] + door[1] / doors.length], [0, 0]).map(Math.round);
      const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
      doors.sort((a, b) => distance(a, hub) - distance(b, hub));
      for (const door of doors) tread(route(door, hub, blocked, worn, grain), .34 * door.use, random);
      // Neighbours also visit each other directly.
      for (const door of doors) {
        const neighbour = doors.filter(other => other !== door && distance(other, door) > 2)
          .sort((a, b) => distance(a, door) - distance(b, door))[0];
        if (neighbour && distance(neighbour, door) < 12) tread(route(door, neighbour, blocked, worn, grain), .2 * Math.min(door.use, neighbour.use), random);
      }
      texture.needsUpdate = true;
      dirty = false;
    },
    // A walking resident; positions are map cells. Wear follows the distance
    // covered, so it does not depend on frame rate or game speed.
    step(who, x, z) {
      x = metres(x); z = metres(z);
      const last = strides.get(who);
      if (!last) { strides.set(who, {x, z, due: 0}); return; }
      const length = Math.hypot(x - last.x, z - last.z);
      // A jump is not a walk: someone was carried, or arrived from off the map.
      if (length < 8) for (last.due += length; last.due >= STRIDE; last.due -= STRIDE) {
        const t = 1 - (last.due - STRIDE) / (length || 1);
        stamp(last.x + (x - last.x) * Math.max(0, t), last.z + (z - last.z) * Math.max(0, t), .7, walked, FOOTFALL);
      }
      last.x = x; last.z = z;
    },
    flush() { if (dirty) { texture.needsUpdate = true; dirty = false; } },
  };
}
