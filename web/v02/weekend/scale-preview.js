import { createSandbox, plan, placementError, PROJECTS, requiredLoads } from './simulation.js';
import { foundationPad } from './elevation.js';

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
        work:def.work,delivered:requiredLoads(key),...(key==='bridge'?{siteVersion:1}:{})});
    }
    // Demonstration paths are already built, like the surrounding buildings.
    s.projects.at(-1).work=PROJECTS[key].work;
  }
  const sites = collection==='homes' ? [
    ['house',44,43],['home-gable',54,43],['adobe-gable',64,43],['home-family',74,43],
    ['home-veranda',44,55],['adobe-veranda',54,55],['home-courtyard',64,55],['home-shared',76,55],
  ] : [
    ['house',44,44], ['home-family',54,44], ['home-shared',66,44],
    ['kitchen',44,55], ['workshop',56,55], ['warehouse',66,55],
    ['garden',44,65], ['greenhouse',52,65], ['goat_pasture',60,65], ['solar_farm',72,65],
    ['rain-barrel',40,44], ['wayfinding-sign',40,47], ['supply-5',40,50],
    ['orchard',44,77], ['grove',54,77],
  ];
  for(const [key,x,z] of sites)place(key,x,z);
  for(let x=42;x<=(collection==='homes'?83:74);x++) place('road',x,51);
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
