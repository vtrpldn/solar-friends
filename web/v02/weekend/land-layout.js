import {settingsFor,richnessFactor,waterFactor} from './world-settings.js';
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
    offset: -65 + random() * 29,
    bend: 4 + random() * 10,
    phase: random() * Math.PI * 2,
    frequency: 0.045 + random() * 0.025,
    width: (2.1 + random() * 1.3)*Math.sqrt(waterFactor(settingsFor(seed).water)),
    hillHeight: (4 + random() * 5)*({gentle:.35,rolling:1,rugged:1.7}[settingsFor(seed).landscape]),
    hillScaleX: .025 + random() * .065,
    hillScaleZ: .025 + random() * .065,
    ridge: .5 + random() * 3,
  };
}

// Regional geology is repeatable for a saved map and varies between plots.
export function resourceRichness(seed,x,z,kind='stone') {
  if(!seed)return 1;
  const salt={stone:0x91af,earth:0x7c32}[kind]||0x91af;
  const random=landRandom((seed ^ salt ^ Math.imul(Math.floor(x/12),73856093) ^ Math.imul(Math.floor(z/12),19349663))>>>0);
  return (.6+random()*1.4)*richnessFactor(settingsFor(seed).resources);
}
export function depositCapacity(seed,p,recipe) {
  if(!recipe.deposit)return 0;
  const kind=Object.keys(recipe.output)[0],batch=recipe.output[kind];
  return Math.round((p.natural?recipe.deposit*8:recipe.deposit)*resourceRichness(seed,p.x,p.z,kind)/batch)*batch;
}
