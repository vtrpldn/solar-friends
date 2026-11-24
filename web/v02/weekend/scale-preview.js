import {HOME_DESIGNS} from '../library/home-designs.js';
import { createSandbox, plan, placementError, PROJECTS, requiredLoads } from './simulation.js';
import { isBuildOption } from './build-categories.js';
import { foundationPad } from './elevation.js';
import { ensureCultivation } from './cultivation.js';

// Isolated desktop fixture, never loaded from or autosaved over a village.
// The test validates the layout through plan(); the browser seeds those same
// sites directly so a visual inspection does not wait on dozens of path searches.
export function createScalePreview(validate = false, collection = 'village') {
  const s = createSandbox(42);
  function place(key,x,z) {
    if(validate) {
      const error=plan(s,key,x,z);
      if(error)throw new Error(`Scale preview ${key}: ${error}`);
    } else {
      const def=PROJECTS[key];
      if(!['road','bridge'].includes(key)) {
        const pad=foundationPad(x,z,...def.size,s.elevationSeed,s.terrainPads);
        if(!pad)throw new Error(`Scale preview ${key}: incompatible foundation`);
        s.terrainPads.push(pad);
      }
      s.projects.push({id:s.nextId++,key,x,z,rotation:0,
        work:def.work,delivered:requiredLoads(key),...(key==='bridge'?{siteVersion:1}:key==='field'?{fieldSize:[...def.size]}:{})});
    }
    // Demonstration paths are already built, like the surrounding buildings.
    s.projects.at(-1).work=PROJECTS[key].work;
  }
  if (collection === 'dream') {
    let x = 28, z = 19, depth = 0;
    for (const [key, def] of Object.entries(PROJECTS)) {
      if (!isBuildOption(key, def) || key === 'bridge') continue;
      const [width, length] = def.size;
      if (x + width > 92) {
        x = 28;
        z += depth + 2;
        depth = 0;
      }
      place(key, x, z);
      x += width + 2;
      depth = Math.max(depth, length);
    }
    place('bridge', 6, 48);
    s.time = 400;
    s.log = ['Dream lighting preview · All build catalog models. This scene never autosaves.'];
    return s;
  }
  if (collection === 'farm') {
    // Every bed state side by side: one field column per stage, a garden and
    // a greenhouse, with a house for scale.
    const add = (key, x, z, extra = {}) => {
      const def = PROJECTS[key];
      if (key !== 'field') {
        const pad = foundationPad(x, z, ...def.size, s.elevationSeed, s.terrainPads);
        if (pad) s.terrainPads.push(pad);
      }
      const p = {id: s.nextId++, key, x, z, rotation: 0, work: def.work, delivered: requiredLoads(key), ...extra};
      s.projects.push(p);
      return ensureCultivation(s, p)?.beds || [];
    };
    const grow = (b, crop, growth, extra = {}) => Object.assign(b, {crop, growth, moisture: .7,
      stage: growth >= 1 ? 'harvestable' : 'growing', ...(growth >= 1 ? {ripeAt: 0} : {}), ...extra});
    // Columns run along x; five beds per column.
    const columns = [
      b => {}, b => Object.assign(b, {stage: 'prepared', moisture: .2}), b => Object.assign(b, {stage: 'prepared', moisture: .7}),
      b => grow(b, 'greens', .2), b => grow(b, 'greens', .6), b => grow(b, 'greens', 1),
      b => grow(b, 'beans', .2), b => grow(b, 'beans', .6), b => grow(b, 'beans', 1),
      b => grow(b, 'corn', .2), b => grow(b, 'corn', .6), b => grow(b, 'corn', 1),
      b => grow(b, 'corn', .8, {stage: 'failed', droughtDamage: .9, moisture: .05}),
      b => Object.assign(b, {stage: 'harvested', cover: .8, residueKg: 1, moisture: .5}),
    ];
    add('field', 44, 50, {fieldSize: [columns.length, 6]}).forEach((b, i) => columns[Math.floor(i / 5)](b));
    add('field', 62, 50, {fieldSize: [10, 6]}).forEach((b, i) => grow(b, ['corn', 'beans', 'greens'][Math.floor(i / 15) % 3] || 'greens', 1));
    add('garden', 46, 60).forEach((b, i) => grow(b, ['greens', 'beans', 'corn', 'greens'][i], [1, .6, 1, .2][i]));
    add('greenhouse', 52, 60).forEach((b, i) => grow(b, ['greens', 'beans'][i], 1));
    add('house', 60, 60);
    s.people.forEach((r, i) => { r.x = 50 + i; r.z = 57; r.walk = []; r.target = null; });
    s.time = 400; s.rain = false; s.rainSeen = true; s.rainResolved = true;
    s.log = ['Farm look preview · every bed state. This scene never autosaves.'];
    return s;
  }
  if (collection === 'lived') {
    // A small settled village: homes turn their doors to a shared square,
    // with food, animals and workshops behind them.
    const village = [
      ['square',56,48], ['fire-circle',62,54], ['picnic-table',53,54], ['groundwater-well',62,45],
      ['kitchen',55,39], ['house',47,40], ['home-ochre',63,38],
      ['home-garden',46,48,1], ['adobe-gable',43,54,1],
      ['home-studio',66,48,3], ['home-courtyard',68,53,3],
      ['home-lane',52,58,2], ['home-cottage',58,59,2], ['adobe-veranda',64,61,2],
      ['garden',37,43], ['garden',31,45], ['greenhouse',36,52], ['orchard',38,62], ['compost',33,60],
      ['coop',74,43], ['goat_pasture',79,50], ['eco_toilet',76,59], ['workshop',72,35], ['warehouse',46,32],
      ['solar_farm',71,67], ['clothesline',50,46], ['hammock',70,60], ['woodpile',53,44],
      ['rain-barrel',52,41], ['garden-bench',59,54], ['wash-station',74,57], ['tool-rack',71,40],
    ];
    for (const [key, x, z, rotation = 0] of village) {
      const def = PROJECTS[key], [w, d] = rotation % 2 ? [def.size[1], def.size[0]] : def.size;
      const pad = foundationPad(x, z, w, d, s.elevationSeed, s.terrainPads);
      if (pad) s.terrainPads.push(pad);
      else if (w * d > 4) throw new Error(`Lived preview ${key}: incompatible foundation`);
      s.projects.push({id: s.nextId++, key, x, z, rotation, work: def.work, delivered: requiredLoads(key),
        ...(key === 'field' ? {fieldSize: [...def.size]} : {})});
    }
    place('bridge', 6, 48);
    s.people.forEach((r, i) => { r.x = 55 + i * 1.7; r.z = 53.5 + (i % 2); r.walk = []; r.target = null; });
    s.time = 400; s.rain = false; s.rainSeen = true; s.rainResolved = true;
    s.log = ['Lived-in look preview · swept yards, worn paths and hard light. This scene never autosaves.'];
    return s;
  }
  const sites = collection==='new-homes' ? HOME_DESIGNS.map((d,i)=>[d.id,35+(i%5)*12,i<5?43:57]) : collection==='sites' ? [
    ['solar_farm',44,44],['picnic-table',54,44],['eco_toilet',60,44],
    ['supply-0',67,43],['home-shared',54,55],
  ] : collection==='homes' ? [
    ['home-cottage',35,44],['home-longhouse',85,44],
    ['house',44,43],['home-gable',54,43],['adobe-gable',64,43],['home-family',74,43],
    ['home-veranda',44,55],['adobe-veranda',54,55],['home-courtyard',64,55],['home-shared',76,55],
  ] : [
    ['house',44,44], ['home-family',54,44], ['home-shared',66,44],
    ['kitchen',44,55], ['workshop',56,55], ['warehouse',66,55],
    ['garden',44,65], ['greenhouse',52,65], ['goat_pasture',60,65], ['solar_farm',72,65],
    ['rain-barrel',40,44], ['wayfinding-sign',40,47], ['supply-5',40,50],
    ['orchard',44,77], ['grove',54,77],
  ];
  // Lay the comparison streets first: plan() then validates each house against
  // the finished road layout instead of rechecking ten houses per road tile.
  if(collection==='new-homes')for(const z of [51,65])for(let x=35;x<=93;x++)place('road',x,z);
  for(const [key,x,z] of sites)place(key,x,z);
  if(collection!=='new-homes')for(let x=42;x<=(collection==='homes'?83:74);x++)place('road',x,51);
  if(collection==='homes')for(let x=42;x<=83;x++)place('road',x,63);
  place('bridge',6,48);
  const legacy={id:s.nextId++,key:'bridge',x:5,z:39,rotation:0,siteVersion:0,
    work:PROJECTS.bridge.work,delivered:requiredLoads('bridge')};
  s.projects.push(legacy);
  if(validate) {
    const error=placementError(s,'bridge',legacy.x,legacy.z,legacy.id);
    if(error)throw new Error(`Scale preview legacy bridge: ${error}`);
  }
  s.people.forEach((r,i)=>{r.x=46+i;r.z=51;r.walk=[];r.target=null;});
  s.time=400;s.rain=false;s.rainSeen=true;s.rainResolved=true;
  s.log=['Physical-scale review · 2 m per tile. This scene never autosaves.'];
  return s;
}
