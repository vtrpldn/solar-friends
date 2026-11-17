import {
  createWeekend,
  chooseCamp,
  PROJECTS,
  MATERIALS,
  requiredLoads,
  placementError,
  connectUtility,
  queueProduction,
  enableFastNavigation,
} from "./simulation.js";
import { syncInfrastructure } from "./infrastructure.js";
// Isolated demonstration, never read from or persisted to a player's save.
export function createUtilitiesPreview(interactions = false, landSeed = 0) {
  const s = createWeekend(landSeed);
  enableFastNavigation(s);
  s.arrivalElapsed = 17;
  chooseCamp(s, "clearing");
  s.time = 1100;
  s.money = 3000;
  s.wood = 60;
  for (const id of Object.keys(MATERIALS))
    if (id !== "wood") s.materials[id] = 20;
  s.materials.electrical = 40;
  s.materials.plumbing = 40;
  const rows = [
    ["solar_farm", 27, 39],
    ["well", 33, 39],
    ["workshop", 38, 39],
    ["warehouse", 45, 39],
    ["garden", 45, 31],
    ["eco_toilet", 39, 30],
    ["banana_treatment", 43, 25],
    ["wetland", 34, 30],
    ["house", 27, 30],
    ["streetlight", 30, 37],
    ["fire-circle", 33, 36],
  ];
  if (interactions)
    rows.push(
      ["goat_pasture", 53, 31],
      ["coop", 53, 40],
      ["wash-station", 34, 44],
      ["shed", 38, 46],
      ["square", 44, 47],
    );
  const ids = {};
  for (const [key, anchorX, anchorZ] of rows) {
    let spot;
    for(let radius=0;radius<=16&&!spot;radius++){
      const candidates=[];
      for(let dz=-radius;dz<=radius;dz++)for(let dx=-radius;dx<=radius;dx++)
        if(Math.max(Math.abs(dx),Math.abs(dz))===radius)candidates.push({x:anchorX+dx,z:anchorZ+dz});
      spot=candidates.sort((a,b)=>Math.hypot(a.x-anchorX,a.z-anchorZ)-Math.hypot(b.x-anchorX,b.z-anchorZ))
        .find(p=>!placementError(s,key,p.x,p.z));
    }
    if(!spot)throw new Error(`${key}: no legal preview site near its anchor`);
    const {x,z}=spot;
    const id = s.nextId++;
    ids[key] = id;
    s.projects.push({
      id,
      key,
      x,
      z,
      work: PROJECTS[key].work,
      delivered: requiredLoads(key),
    });
  }
  const sys = syncInfrastructure(s, PROJECTS);
  for (const key of ["well", "workshop", "streetlight", "eco_toilet"]) {
    const error = connectUtility(s, "power", ids.solar_farm, ids[key]);
    if (error) throw new Error(error);
  }
  for (const [kind, from, to] of [
    ["fresh", ids.well, 0],
    ["irrigation", ids.well, ids.garden],
    ["sewage", ids.eco_toilet, ids.banana_treatment],
  ]) {
    const error = connectUtility(s, kind, from, to);
    if (error) throw new Error(error);
  }
  for (const link of sys.links) link.work = link.required;
  sys.nodes[ids.solar_farm].charge = 24;
  s.projects.find(p=>p.id===ids.house).solarUpgrade=true;
  syncInfrastructure(s,PROJECTS);
  sys.nodes[ids.house].charge = 3;
  sys.nodes[ids.well].water = [30, 40, 0, 0];
  sys.nodes[ids.eco_toilet].water[3] = 10;
  sys.nodes[ids.wetland].water[2] = 12;
  if (interactions) {
    s.time = 0;
    s.rainSeen = true;
    s.rainResolved = true;
    for (const key of ["goat_pasture", "coop", "wash-station"])
      sys.nodes[ids[key]].water[0] = sys.nodes[ids[key]].capacity[0];
    s.people[0].energy = 10;
    s.people[1].energy = 10;
    s.people[2].work = 60;
    for (const [key, recipe] of [
      ["goat_pasture", "milk"],
      ["coop", "eggs"],
    ]) {
      const error = queueProduction(s, ids[key], recipe);
      if (error) throw new Error(error);
    }
  }
  s.log = [
    "Utilities preview: connected solar, batteries, water treatment and production. This scene is not saved.",
  ];
  return s;
}
