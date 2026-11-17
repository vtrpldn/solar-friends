import { createSandbox, plan, placementError, PROJECTS, requiredLoads } from './simulation.js';
import { foundationPad } from './elevation.js';

// Isolated desktop fixture, never loaded from or autosaved over a village.
// The test validates the layout through plan(); the browser seeds those same
// sites directly so a visual inspection does not wait on dozens of path searches.
export function createScalePreview(validate = false) {
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
  for (const [key,x,z] of [
    ['house',50,50], ['home-family',54,50], ['home-shared',59,50],
    ['kitchen',50,55], ['workshop',56,55], ['warehouse',60,55],
    ['garden',50,60], ['greenhouse',54,60], ['goat_pasture',58,60], ['solar_farm',63,60],
    ['rain-barrel',46,50], ['wayfinding-sign',46,53], ['supply-5',46,56],
    ['orchard',50,64], ['grove',54,64],
  ]) place(key,x,z);
  for(let x=49;x<=64;x++) place('road',x,52);
  place('bridge',6,48);
  const legacy={id:s.nextId++,key:'bridge',x:5,z:39,rotation:0,siteVersion:0,
    work:PROJECTS.bridge.work,delivered:requiredLoads('bridge')};
  s.projects.push(legacy);
  if(validate) {
    const error=placementError(s,'bridge',legacy.x,legacy.z,legacy.id);
    if(error)throw new Error(`Scale preview legacy bridge: ${error}`);
  }
  s.people.forEach((r,i)=>{r.x=50+i;r.z=52;r.walk=[];r.target=null;});
  s.time=400;s.rain=false;s.rainSeen=true;s.rainResolved=true;
  s.log=['Physical-scale review · 2 m per tile. This scene never autosaves.'];
  return s;
}
