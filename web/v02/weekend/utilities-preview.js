import {
  createWeekend,
  chooseCamp,
  PROJECTS,
  MATERIALS,
  requiredLoads,
  placementError,
  connectUtility,
  queueProduction,
} from "./simulation.js";
import { syncInfrastructure } from "./infrastructure.js";
// Isolated demonstration, never read from or persisted to a player's save.
export function createUtilitiesPreview(interactions = false, landSeed = 0) {
  const s = createWeekend(landSeed);
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
    ["well", 32, 39],
    ["workshop", 36, 39],
    ["warehouse", 40, 39],
    ["garden", 41, 35],
    ["eco_toilet", 41, 30],
    ["banana_treatment", 43, 30],
    ["wetland", 37, 30],
    ["house", 30, 30],
    ["streetlight", 30, 37],
    ["fire-circle", 33, 35],
  ];
  if (interactions)
    rows.push(
      ["goat_pasture", 44, 35],
      ["coop", 44, 39],
      ["wash-station", 34, 42],
      ["shed", 36, 43],
      ["square", 40, 44],
    );
  const ids = {};
  for (const [key, x, z] of rows) {
    const error = placementError(s, key, x, z);
    if (error) throw new Error(`${key}: ${error}`);
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
