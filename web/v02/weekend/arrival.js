export const ARRIVAL_SPOTS = [
  [30, 24.7],
  [30.8, 25.2],
  [31.7, 24.6],
  [32.6, 25.3],
  [33.3, 24.5],
];
export const ARRIVAL_DURATION = 15;
export const PARK_TIME = 6;
const smooth = (t) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
};
export function arrivalPose(elapsed, index) {
  const drive = smooth(elapsed / PARK_TIME),
    remaining = 1 - drive;
  const car = {
    x: -7 * remaining * remaining,
    z: -22 - 36 * remaining,
    yaw: Math.atan2(14 * remaining, 36),
  };
  const start = PARK_TIME + 0.5 + index * 0.85,
    progress = Math.max(0, Math.min(1, (elapsed - start) / 4));
  const side = index % 2 ? -1 : 1,
    doorZ = index < 2 ? -21.5 : -22.7;
  const exitX = side * 1.32,
    walk = Math.min(1, progress * 1.4);
  const targetX = (ARRIVAL_SPOTS[index][0] - 32) * 2,
    targetZ = (ARRIVAL_SPOTS[index][1] - 32) * 2;
  // First step sideways through the door, then walk around the front bumper.
  const corner = { x: side * 1.7, z: -18.9 };
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
  if (z < -62 || z > -18) return false;
  const t = Math.max(0, Math.min(1, (-22 - z) / 36));
  return Math.abs(x + 7 * t * t) < 4.5;
}
