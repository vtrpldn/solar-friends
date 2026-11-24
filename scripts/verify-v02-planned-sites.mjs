import assert from "node:assert/strict";
import * as THREE from "three";
import { createPlannedSites, plannedSiteState } from "../web/v02/weekend/planned-sites.js";
import { createSandbox, plan, placementError, planRoadLine, moveProject, cancelProject, footprint, requiredLoads, PROJECTS } from "../web/v02/weekend/simulation.js";
import { ASSETS } from "../web/v02/library/catalog.js";

// States are told apart by physical cues, not only by colour.
const def = { work: 100 };
assert.equal(plannedSiteState({ work: 100, delivered: 4 }, def, 4), null, "finished buildings carry no site markers");
assert.equal(plannedSiteState({ work: 0, delivered: 0, natural: true }, def, 4), null);
const waiting = plannedSiteState({ work: 0, delivered: 0 }, def, 4);
assert.deepEqual([waiting.state, waiting.tiers, waiting.pennant, waiting.sawhorse, waiting.ghost], ["waiting", 0, true, false, 1]);
const arriving = plannedSiteState({ work: 0, delivered: 1 }, def, 4);
assert.deepEqual([arriving.state, arriving.tiers], ["waiting", 1], "the pallet fills as loads arrive");
const supplied = plannedSiteState({ work: 0, delivered: 4 }, def, 4);
assert.deepEqual([supplied.state, supplied.tiers, supplied.pennant], ["supplied", 3, true]);
const building = plannedSiteState({ work: 30, delivered: 4 }, def, 4);
assert.deepEqual([building.state, building.pennant, building.sawhorse], ["building", false, true]);
assert(building.ghost > 0 && building.ghost < 1 && building.tiers < 3, "ghost and stack recede as the structure rises");
assert.equal(plannedSiteState({ work: 70, delivered: 4 }, def, 4).ghost, 0, "the real frame replaces the ghost");

const assets = new Set(ASSETS.map((a) => a.id));
let models = 0;
const layer = (s) => createPlannedSites({
  world: (x, z) => new THREE.Vector3((x - 32) * 2, 0, (z - 32) * 2), footprint, definitions: PROJECTS, loads: requiredLoads,
  hasStages: (asset) => assets.has(`${asset}-construction-0`),
  model: () => { models++; return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)); },
});
const parts = (sites) => Object.fromEntries(sites.group.children.map((child) => [child.isGroup ? "ghosts" : child.material.isMeshBasicMaterial ? "chalk" : "solid", child]));
const vertices = (mesh) => mesh.visible ? mesh.geometry.getAttribute("position").count : 0;

const s = createSandbox(42);
s.instantBuild = false;
const sites = layer(s);
assert.equal(sites.sync(s), true);
assert.equal(sites.sites().length, 0, "an empty village has no markers");
assert.equal(vertices(parts(sites).chalk), 0);

// Every placeable type gets a marked site, including rotated ones.
// A sample across homes, services, fields-with-work, 1×1 props and paths keeps this check quick.
const keys = ["gathering", "shelter", "toilet", "home-studio", "home-ranch", "kitchen", "garden", "goat-pasture-empty",
  "rain-barrel", "garden-bench", "streetlight", "wayfinding-sign", "hammock", "fire-circle", "volleyball-court", "road"];
for (const key of keys) assert(PROJECTS[key], `unknown project ${key}`);
let placed = 0;
const taken = [], unplaced = [];
for (const key of keys) {
  const rotation = placed % 2, [w, d] = footprint({ key, rotation });
  let done = false;
  for (let x = 34; x <= 112 && !done; x += 2) for (let z = 34; z <= 112 && !done; z += 2) {
    if (taken.some((t) => x < t.x + t.w + 2 && x + w + 2 > t.x && z < t.z + t.d + 2 && z + d + 2 > t.z)) continue;
    if (placementError(s, key, x, z, null, rotation)) continue;
    done = plan(s, key, x, z, rotation) === "";
    if (done) taken.push({ x, z, w, d });
  }
  if (done) placed++; else unplaced.push(key);
}
assert.equal(placed, keys.length, `no site found for ${unplaced.join(', ')}`);
assert.equal(sites.sync(s), true);
assert.equal(sites.sites().length, placed);
const { chalk, solid, ghosts } = parts(sites);
assert(vertices(chalk) > 0 && vertices(solid) > 0);
assert.equal(sites.group.children.length, 3, "markers stay merged however many sites exist");
assert(models <= new Set(keys.map((key) => PROJECTS[key].asset)).size, "ghost geometry is built once per building type");
const before = models;
assert.equal(sites.sync(s), false, "an unchanged village rebuilds nothing");
assert.equal(models, before);

// The lime line follows the real rotated footprint.
const home = s.projects.find((p) => PROJECTS[p.key].size[0] !== PROJECTS[p.key].size[1] && p.rotation === 1);
assert(home, "a rotated oblong site is planned");
const [w, d] = footprint(home);
const one = createSandbox(42); one.instantBuild = false;
assert.equal(plan(one, home.key, home.x, home.z, 1), "");
const single = layer(one); single.sync(one);
const box = new THREE.Box3().setFromBufferAttribute(parts(single).chalk.geometry.getAttribute("position"));
assert(Math.abs(box.max.x - box.min.x - (w * 2 + .26)) < 1e-3 && Math.abs(box.max.z - box.min.z - (d * 2 + .26)) < 1e-3, "outline matches the rotated footprint");

// Unstaged props stay hidden until work starts, so a planned bench is not mistaken for a built one.
const bench = one.projects.at(-1);
assert.equal(plan(one, "garden-bench", home.x + 12, home.z), "");
const prop = one.projects.at(-1);
assert.equal(single.hidesModel(prop, PROJECTS[prop.key]), true);
assert.equal(single.hidesModel(bench, PROJECTS[bench.key]), false, "staged buildings keep their groundwork model");
prop.work = 1;
assert.equal(single.hidesModel(prop, PROJECTS[prop.key]), false);
prop.work = 0;

// Markers never intercept picking.
const ray = new THREE.Raycaster(new THREE.Vector3(0, 50, 0), new THREE.Vector3(0, -1, 0));
single.sync(one);
single.group.updateMatrixWorld(true);
ray.set(new THREE.Vector3((home.x + (w - 1) / 2 - 32) * 2, 50, (home.z + (d - 1) / 2 - 32) * 2), new THREE.Vector3(0, -1, 0));
assert.equal(ray.intersectObject(single.group, true).length, 0, "site markers do not block clicks");

// Relocation marks the reserved destination; cancelling clears the site.
assert.equal(moveProject(one, prop.id, prop.x + 4, prop.z + 4), "");
assert.equal(single.sync(one), true);
assert.equal(single.sites().find((site) => site.id === prop.id).moving, true);
delete prop.removal;
assert.equal(cancelProject(one, prop.id), "");
assert.equal(single.sync(one), true);
assert(!single.sites().some((site) => site.id === prop.id), "a cancelled plan leaves no markers");

// Dozens of planned road tiles share one outline and no per-tile objects.
const roads = createSandbox(42);
assert.equal(planRoadLine(roads, { x: 50, z: 30 }, { x: 50, z: 90 }), "");
const run = layer(roads); run.sync(roads);
assert.equal(vertices(parts(run).chalk), (61 * 2 + 2) * 6, "a road run is outlined once, without lines between its tiles");
assert.equal(parts(run).ghosts.children.length, 0);
let started = performance.now();
for (let i = 0; i < 600; i++) run.sync(roads);
const perFrame = (performance.now() - started) / 600;
assert(perFrame < 0.5, `unchanged sync cost ${perFrame.toFixed(3)}ms per frame with 61 planned tiles`);
started = performance.now();
for (let i = 0; i < 600; i++) sites.sync(s);
assert((performance.now() - started) / 600 < 0.5, "unchanged sync stays cheap with a full catalog of blueprints");
assert.equal(ghosts.children.length % 2, 0);
console.log(`PASS: planned-site states, ${placed} sampled catalog types marked, rotated outline, hidden unstaged props, click-through, relocation, cancellation and merged road runs`);
