import {MAP_CELLS, CELL_MIN} from './map-size.js';
import {GAME_DAY} from './biological-production.js';

// Where residents really walk. The land is divided into one-metre squares and
// each square counts the half-metre strides that landed in it, so the paths
// the village shows are the routes it uses. Counts are whole numbers to keep
// saves small.
export const FOOTFALL_GRID = MAP_CELLS * 2;
// Map cells are two metres wide, so a stride is a quarter of a cell.
const STRIDE = .25;
// Grass grows back: each day an unused path keeps this share of its wear.
const REGROWTH = .96;
// Strides after which a square is about two-thirds of the way to bare earth.
const PACKED = 400;
const carried = new WeakMap();

export const footfallSquare = (x, z) => {
  const gx = Math.floor((x - CELL_MIN + .5) * 2), gz = Math.floor((z - CELL_MIN + .5) * 2);
  return gx < 0 || gz < 0 || gx >= FOOTFALL_GRID || gz >= FOOTFALL_GRID ? -1 : gx + gz * FOOTFALL_GRID;
};
// Map-cell coordinates of the middle of a square.
export const squareCentre = square => [
  CELL_MIN - .5 + (square % FOOTFALL_GRID + .5) / 2,
  CELL_MIN - .5 + (Math.floor(square / FOOTFALL_GRID) + .5) / 2,
];
// How worn a square looks, from 0 (grass) towards 0.6 (packed earth).
export const wearLevel = strides => .6 * (1 - Math.exp(-strides / PACKED));

// Strides after which a track is plain enough that walkers follow it.
const TRODDEN = 200;
// Whether the two-metre map cell around a point holds a clearly worn track.
export function trodden(s, x, z) {
  const squares = s.footfall?.squares;
  if (!squares) return false;
  const gx = (Math.round(x) - CELL_MIN) * 2, gz = (Math.round(z) - CELL_MIN) * 2;
  if (gx < 0 || gz < 0 || gx + 1 >= FOOTFALL_GRID || gz + 1 >= FOOTFALL_GRID) return false;
  const at = gx + gz * FOOTFALL_GRID;
  return Math.max(squares[at] || 0, squares[at + 1] || 0, squares[at + FOOTFALL_GRID] || 0, squares[at + FOOTFALL_GRID + 1] || 0) >= TRODDEN;
}

export const footfallBefore = s => s.people.map(r => [r.x, r.z]);
// Adds the ground each resident covered since `before`, and lets a day's
// regrowth happen when the date changes.
export function recordFootfall(s, before, dt) {
  const f = s.footfall ??= {day: Math.floor(s.time / GAME_DAY), squares: {}};
  const day = Math.floor(s.time / GAME_DAY);
  if (day > f.day) {
    const keep = REGROWTH ** (day - f.day);
    for (const square in f.squares) {
      const left = Math.floor(f.squares[square] * keep);
      if (left > 0) f.squares[square] = left; else delete f.squares[square];
    }
    f.day = day;
  }
  s.people.forEach((r, i) => {
    const from = before[i];
    if (!from) return;
    const length = Math.hypot(r.x - from[0], r.z - from[1]);
    // Nobody walks faster than a cell a second; anything more was a ride or a relocation.
    if (!(length > 0) || length > dt * 1.2 + .05) return;
    let due = (carried.get(r) || 0) + length;
    for (; due >= STRIDE; due -= STRIDE) {
      const t = 1 - (due - STRIDE) / length;
      const square = footfallSquare(from[0] + (r.x - from[0]) * Math.max(0, t), from[1] + (r.z - from[1]) * Math.max(0, t));
      if (square >= 0) f.squares[square] = (f.squares[square] || 0) + 1;
    }
    carried.set(r, due);
  });
}
// A damaged record is dropped rather than refusing the whole village.
export function repairFootfall(s) {
  const f = s.footfall;
  if (f === undefined) return;
  const sound = f && Number.isInteger(f.day) && f.squares && typeof f.squares === 'object' && !Array.isArray(f.squares) &&
    Object.entries(f.squares).every(([square, strides]) =>
      /^\d+$/.test(square) && +square < FOOTFALL_GRID * FOOTFALL_GRID && Number.isInteger(strides) && strides > 0);
  if (!sound) delete s.footfall;
}
