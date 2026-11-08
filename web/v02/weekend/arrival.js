import { MAP_HALF } from "./map-size.js";
import { roadCenter, ROAD_SHIFT, PARK_Z, ROAD_END_Z } from "./road-layout.js";
export const ARRIVAL_SPOTS = [
  [30, 24.7],
  [30.8, 25.2],
  [31.7, 24.6],
  [32.6, 25.3],
  [33.3, 24.5],
].map(([x, z]) => [x, z - ROAD_SHIFT / 2]);
export const ARRIVAL_DURATION = 17;
export const PARK_TIME = 6;
const DRIVE_LENGTH = MAP_HALF + PARK_Z;
const smooth = (t) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
};
export function vehiclePose(elapsed, index) {
  const remaining = 1 - smooth((elapsed - index * 2) / PARK_TIME);
  const parkedX = index ? 3.2 : -1;
  return {
    x: roadCenter(PARK_Z - DRIVE_LENGTH * remaining) + parkedX - 1.1,
    z: PARK_Z - DRIVE_LENGTH * remaining,
    yaw: Math.atan2(14 * (DRIVE_LENGTH / 36) * remaining, 36),
  };
}
export function arrivalPose(elapsed, index) {
  const vehicle = index < 3 ? 0 : 1,
    seat = index < 3 ? index : index - 3;
  const car = vehiclePose(elapsed, vehicle);
  const start = PARK_TIME + vehicle * 2 + 0.5 + seat * 0.9;
  const progress = Math.max(0, Math.min(1, (elapsed - start) / 4));
  const side = seat % 2 ? -1 : 1,
    doorZ = PARK_Z + 0.3;
  const parkedX = vehicle ? 3.2 : -1;
  const exitX = parkedX + side * 1.15,
    walk = Math.min(1, progress * 1.4);
  const targetX = (ARRIVAL_SPOTS[index][0] - 32) * 2,
    targetZ = (ARRIVAL_SPOTS[index][1] - 32) * 2;
  // First step sideways through the door, then walk around the front bumper.
  const corner = { x: parkedX + side * 1.5, z: PARK_Z + 3.1 };
  const t = progress < 0.35 ? progress / 0.35 : (progress - 0.35) / 0.65;
  const from = progress < 0.35 ? { x: exitX, z: doorZ } : corner;
  const to = progress < 0.35 ? corner : { x: targetX, z: targetZ };
  return {
    car,
    visible: elapsed >= start,
    walking: progress < 1,
    x: from.x + (to.x - from.x) * t,
    z: from.z + (to.z - from.z) * t,
    y: Math.max(0, 0.3 * (1 - walk * 4)),
    yaw: Math.atan2(to.x - from.x, to.z - from.z),
  };
}

export function arrivalLaneAt(x, z) {
  if (z < PARK_Z - 40 || z > ROAD_END_Z + 3) return false;
  return Math.abs(x - roadCenter(z)) < 8;
}
