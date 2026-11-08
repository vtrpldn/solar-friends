import { MAP_HALF } from "./map-size.js";
// Keep the entrance, parking and arrival animation on one shared layout.
export const ROAD_SHIFT = MAP_HALF - 56;
export const PARK_Z = -22 - ROAD_SHIFT;
export const ROAD_END_Z = PARK_Z + 6;
export function roadCenter(z) {
  const t = Math.max(0, Math.min(1, (PARK_Z - z) / 36));
  return 1.1 - 7 * t * t;
}
export function accessRoadAt(column, row, margin = 0) {
  const x = (column - 32) * 2,
    z = (row - 32) * 2;
  if (z < -MAP_HALF || z > ROAD_END_Z) return false;
  const width = z < -MAP_HALF + 12 ? 8.3 : z > PARK_Z - 3 ? 5.6 : 4.5;
  return Math.abs(x - roadCenter(z)) < width + margin;
}
