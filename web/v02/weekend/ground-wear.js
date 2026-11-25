import * as THREE from 'three';
import {MAP_CELLS, MAP_HALF, CELL_MIN} from './map-size.js';
import {riverBankAt} from './river-layout.js';
import {squareCentre, wearLevel} from './footfall.js';

// The ground shows how the village is used. Red holds the footpaths residents
// have worn (see footfall.js); green holds the swept-earth yard kept around
// each walled building.
const SIZE = 512, TEXELS = SIZE / (MAP_HALF * 2);
const FACING = [[0, 1], [1, 0], [0, -1], [-1, 0]];
const metres = cell => (cell - 32) * 2;
// Metres over which one square's wear spreads, so neighbouring squares blend into a track.
const REACH = 1.1;
const hasWalls = asset => /^(home-|adobe-|house|kitchen|warehouse|workshop|reading-room|community-hall|outdoor-classroom|eco_toilet|coop|shed|groundwater-well)/.test(asset);

export function createGroundWear() {
  const data = new Uint8Array(SIZE * SIZE * 4);
  const worn = new Float32Array(SIZE * SIZE);
  const texture = new THREE.DataTexture(data, SIZE, SIZE);
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  let settled = '', river = null, riverSeed = null;

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

  return {
    texture,
    // Rebuilds the yards when the built village changes.
    settle(projects, defs, footprint) {
      const built = projects.filter(p => !p.natural && !defs[p.key].natural && !p.felled && p.work >= defs[p.key].work && hasWalls(defs[p.key].asset));
      const signature = built.map(p => `${p.id}:${p.x}:${p.z}:${p.rotation || 0}`).join('|');
      if (signature === settled) return;
      settled = signature;
      for (let i = 1; i < data.length; i += 4) data[i] = 0;
      for (const p of built) {
        const [w, d] = footprint(p);
        yard(metres(p.x + (w - 1) / 2), metres(p.z + (d - 1) / 2), w, d, FACING[(p.rotation || 0) % 4]);
      }
      texture.needsUpdate = true;
    },
    // Redraws the paths from the village's recorded footfall.
    paint(footfall, seed) {
      if (riverSeed !== seed) {
        riverSeed = seed;
        river = new Uint8Array(MAP_CELLS * MAP_CELLS);
        for (let z = 0; z < MAP_CELLS; z++) for (let x = 0; x < MAP_CELLS; x++)
          if (riverBankAt(x + CELL_MIN, z + CELL_MIN, 0, seed)) river[x + z * MAP_CELLS] = 1;
      }
      worn.fill(0);
      for (const square in footfall?.squares) {
        const [x, z] = squareCentre(+square);
        // Bridges carry people over the water; the riverbed stays untouched.
        if (river[(Math.round(x) - CELL_MIN) + (Math.round(z) - CELL_MIN) * MAP_CELLS]) continue;
        const cx = (metres(x) + MAP_HALF) * TEXELS, cz = (metres(z) + MAP_HALF) * TEXELS, r = REACH * TEXELS;
        const level = wearLevel(footfall.squares[square]);
        for (let tz = Math.max(0, Math.floor(cz - r)); tz <= Math.min(SIZE - 1, cz + r); tz++)
          for (let tx = Math.max(0, Math.floor(cx - r)); tx <= Math.min(SIZE - 1, cx + r); tx++) {
            const d = Math.hypot(tx + .5 - cx, tz + .5 - cz) / r;
            if (d < 1) worn[tz * SIZE + tx] += level * (1 - d * d);
          }
      }
      for (let i = 0; i < worn.length; i++) data[i * 4] = Math.min(255, Math.round(worn[i] * 255));
      texture.needsUpdate = true;
    },
  };
}
