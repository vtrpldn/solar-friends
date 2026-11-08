export function roadCenter(z) {
  const t = Math.max(0, Math.min(1, (-22 - z) / 36));
  return 1.1 - 7 * t * t;
}
export function accessRoadAt(column, row, margin = 0) {
  const x = (column - 32) * 2,
    z = (row - 32) * 2;
  if (z < -64 || z > -16) return false;
  return Math.abs(x - roadCenter(z)) < (z > -25 ? 5.6 : 4.5) + margin;
}
