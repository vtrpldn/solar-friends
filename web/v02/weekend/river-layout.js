import {terrainNoise} from './terrain-noise.js';
import { landParameters } from "./land-layout.js";
export function riverCenter(z, seed = 0) {
  if (!seed) return -31 + 5 * Math.sin(z * 0.07) + 1.8 * Math.sin(z * 0.14);
  const p = landParameters(seed);
  return (
    p.offset +
    p.bend * (terrainNoise(z/62,3.7,seed^0x39af)*2-1) +
    2*(terrainNoise(z/23,8.2,seed^0x715b)*2-1)
  );
}
export function riverWidth(z, seed = 0) {
  if (!seed)
    return (
      2.5 + 0.65 * Math.sin(z * 0.11) + 1.3 * Math.exp(-(((z - 13) / 9) ** 2))
    );
  const p = landParameters(seed);
  return (
    p.width +
    0.6 * terrainNoise(z/18,4.2,seed^0xa83f) +
    0.8 * terrainNoise(z/47,9.1,seed^0x734a)
  );
}
export function riverBankAt(column, row, margin = 0, seed = 0) {
  const z = (row - 32) * 2,
    x = (column - 32) * 2;
  return (
    Math.abs(x - riverCenter(z, seed)) <= riverWidth(z, seed) + 1.9 + margin
  );
}
export function riverAccess(seed = 0) {
  if (!seed) return { x: 22, z: 32 };
  return {
    x: Math.ceil(32 + (riverCenter(0, seed) + riverWidth(0, seed) + 3) / 2),
    z: 32,
  };
}
