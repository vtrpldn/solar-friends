// Seed zero preserves the original plot for old saves and reproducible dev scenes.
export function freshLandSeed() {
  const value = new Uint32Array(1);
  globalThis.crypto.getRandomValues(value);
  return value[0] || 1;
}
export function landRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function landParameters(seed = 0) {
  const random = landRandom(seed);
  return {
    offset: -37 + random() * 7,
    bend: 3 + random() * 3,
    phase: random() * Math.PI * 2,
    frequency: 0.045 + random() * 0.025,
    width: 2.1 + random() * 0.9,
  };
}
