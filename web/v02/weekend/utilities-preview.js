import {
  createWeekend,
  chooseCamp,
  PROJECTS,
  MATERIALS,
  requiredLoads,
  placementError,
  connectUtility,
} from "./simulation.js";
import { syncInfrastructure } from "./infrastructure.js";
// Isolated demonstration, never read from or persisted to a player's save.
export function createUtilitiesPreview() {
  const s = createWeekend();
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
  ];
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
  for (const [kind, from, to] of [
    ["power", ids.solar_farm, -1],
    ["irrigation", -1, ids.well],
  ]) {
    const error = connectUtility(s, kind, from, to);
    if (error) throw new Error(error);
  }
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
  sys.nodes[ids.house].charge = 3;
  sys.nodes[ids.well].water = [30, 40, 0, 0];
  sys.nodes[ids.eco_toilet].water[3] = 10;
  sys.nodes[ids.wetland].water[2] = 12;
  s.log = [
    "Utilities preview: connected solar, batteries, water treatment and production. This scene is not saved.",
  ];
  return s;
}
