import { createSandbox, plan, placementError, PROJECTS, requiredLoads } from './simulation.js';

// Isolated desktop review fixture. game.js skips save loading and autosaving.
export function createScalePreview() {
  const s = createSandbox(42);
  for (const [key, x, z] of [
    ['house',50,50], ['home-family',54,50], ['home-shared',59,50],
    ['kitchen',50,55], ['workshop',56,55], ['warehouse',60,55],
    ['garden',50,60], ['greenhouse',54,60], ['goat_pasture',58,60], ['solar_farm',63,60],
    ['rain-barrel',46,50], ['wayfinding-sign',46,53], ['supply-5',46,56],
    ['orchard',50,64], ['grove',54,64],
  ]) {
    const error=plan(s,key,x,z);
    if(error) throw new Error(`Scale preview ${key}: ${error}`);
  }
  for(let x=49;x<=64;x++) {
    const error=plan(s,'road',x,52);
    if(error) throw new Error(`Scale preview road: ${error}`);
    s.projects.at(-1).work=PROJECTS.road.work;
  }
  for(let z=34;z<60;z++) {
    let found=false;
    for(let x=6;x<24;x++) if(!placementError(s,'bridge',x,z)) {
      const error=plan(s,'bridge',x,z);
      if(error) throw new Error(error);
      found=true;break;
    }
    if(found)break;
  }
  const legacy={id:s.nextId++,key:'bridge',x:5,z:39,rotation:0,siteVersion:0,
    work:PROJECTS.bridge.work,delivered:requiredLoads('bridge')};
  s.projects.push(legacy);
  const legacyError=placementError(s,'bridge',legacy.x,legacy.z,legacy.id);
  if(legacyError)throw new Error(`Scale preview legacy bridge: ${legacyError}`);
  s.people.forEach((r,i)=>{r.x=50+i;r.z=52;r.walk=[];r.target=null;});
  s.time=400;s.rain=false;s.rainSeen=true;s.rainResolved=true;
  s.log=['Physical-scale review · 2 m per tile. This scene never autosaves.'];
  return s;
}
