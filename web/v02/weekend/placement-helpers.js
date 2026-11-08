export function roadLine(from, to) {
  if (!from || (from.x !== to.x && from.z !== to.z)) return null;
  const length = Math.abs(to.x - from.x) + Math.abs(to.z - from.z);
  if (length > 127) return null;
  return Array.from({ length: length + 1 }, (_, i) => ({
    x: from.x + Math.sign(to.x - from.x) * i,
    z: from.z + Math.sign(to.z - from.z) * i,
  }));
}
