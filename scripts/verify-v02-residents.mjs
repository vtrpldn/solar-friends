import assert from "node:assert/strict";
import * as THREE from "three";
import {
  createResident,
  poseResident,
  animateResident,
  RESIDENT_IDS,
} from "../web/v02/residents/rig.js";
import {
  INTERACTIONS,
  interactionSlots,
  worldAnchor,
  navigation,
  findRoute,
} from "../web/v02/residents/interactions.js";
import { ResidentDirector } from "../web/v02/residents/director.js";
import { createAsset } from "../web/v02/library/catalog.js";
import { placementPosition } from "../web/v02/land/layout.js";
import { footprint } from "../web/v02/land/editor.js";
for (const id of RESIDENT_IDS) {
  const a = createResident(id);
  const neutral = new THREE.Box3().setFromObject(a, true);
  assert(neutral.max.y >= 1.72 && neutral.max.y <= 1.86, `${id}: consistent adult scale`);
  for (const action of [
    "idle",
    "walk",
    "sit",
    "rest",
    "water",
    "tend",
    "work",
    "wash",
    "carry",
    "carry-walk",
  ])
    for (let t = 0; t < 3; t += 0.1) {
      poseResident(a.rig, action, t);
      a.traverse((o) => {
        for (const n of o.matrixWorld.elements)
          assert(Number.isFinite(n), `${id} ${action}`);
      });
    }
  a.toJSON();
  const catalog = createAsset(id);
  assert(!catalog.getObjectByName("carried-crate"), `${id}: no hidden cargo in static preview`);
  assert(!catalog.getObjectByName("watering-can"), `${id}: no hidden can in static preview`);
  const previewBounds = new THREE.Box3().setFromObject(catalog, true);
  assert(Math.abs(previewBounds.max.y - neutral.max.y) < 0.02, `${id}: shared preview scale`);
}
let cases = 0;
for (const asset of Object.keys(INTERACTIONS))
  for (const rotation of [0, 90, 180, 270])
    for (const [action] of INTERACTIONS[asset]) {
      const target = {
          id: "target",
          asset,
          column: 30,
          row: 30,
          rotation,
          label: asset,
        },
        record = {
          id: "actor",
          asset: "iara",
          column: 25,
          row: 25,
          rotation: 0,
        };
      const actor = createResident("iara");
      actor.userData.placement = record;
      actor.position.set(
        ...placementPosition(record.column, record.row, [1, 1]),
      );
      const home = actor.position.clone();
      const director = new ResidentDirector([actor], [record, target]);
      director.start("actor", target, action, true);
      for (let i = 0; i < 900; i++) director.tick(1 / 60);
      assert.equal(
        director.task.phase,
        action === "carry" ? "holding" : "action",
        `${asset} ${rotation}`,
      );
      if (action !== "carry") {
        const at = director.task.slot.at;
        assert(
          Math.hypot(actor.position.x - at[0], actor.position.z - at[1]) < 1e-6,
        );
        assert(Math.abs(actor.rotation.y - director.task.slot.yaw) < 1e-6);
      }
      director.stop();
      assert(actor.position.equals(home));
      assert(!actor.rig.cargo.visible);
      cases++;
    }
const target = {
  id: "bench",
  asset: "garden-bench",
  column: 30,
  row: 30,
  rotation: 0,
};
const blocked = {
  id: "block",
  asset: "house",
  column: 30,
  row: 31,
  rotation: 0,
};
const a = createResident();
a.userData.placement = {
  id: "actor",
  asset: "resident",
  column: 20,
  row: 20,
  rotation: 0,
};
a.position.set(-23, 0, -23);
assert.throws(
  () =>
    new ResidentDirector([a], [target, blocked, a.userData.placement]).start(
      "actor",
      target,
      "sit",
      true,
    ),
  /No clear approach/,
);
const nav = { blocked: new Set(), key: (x, z) => z * 128 + x };
for (let z = 0; z < 128; z++) if (z !== 70) nav.blocked.add(nav.key(64, z));
const route = findRoute([-5, 0], [5, 0], nav);
assert(route);
assert(route.some(([x, z]) => z === 6.5));
for (const [x, z] of route)
  assert(!nav.blocked.has(nav.key(Math.floor(x + 64), Math.floor(z + 64))));
nav.blocked.add(nav.key(64, 70));
assert.equal(findRoute([-5, 0], [5, 0], nav), null);
assert.equal(findRoute([70, 0], [0, 0], nav), null);
const garden = { id: "g", asset: "garden", column: 30, row: 30, rotation: 0 };
const surrounding = [];
for (let x = 28; x <= 32; x += 2)
  for (let z = 28; z <= 32; z += 2)
    surrounding.push({ ...garden, id: `g${x}-${z}`, column: x, row: z });
assert.equal(
  interactionSlots(
    surrounding.find((r) => r.column === 30 && r.row === 30),
    surrounding,
  ).length,
  0,
);
console.log(
  `PASS: six serializable rigs, ten finite poses, ${cases} rotated prop/action rehearsals, carrying return, stop reset, blocked approaches, route detours and inaccessible joined-garden interior.`,
);
// Exercise a full trip from the authored placement, not just nearby rehearsals.
const walker = createResident("bento");
walker.userData.placement = {
  id: "walker",
  asset: "bento",
  column: 23,
  row: 25,
  rotation: 0,
};
walker.position.set(...placementPosition(23, 25, [1, 1]));
const trip = new ResidentDirector(
  [walker],
  [walker.userData.placement, target],
);
trip.start("walker", target, "sit", false);
const beforeWalk = walker.position.clone();
trip.tick(0.1);
assert(walker.position.distanceTo(beforeWalk) > 0);
const legPose = walker.rig.legs[0].hip.rotation.x;
trip.tick(0.1);
assert.notEqual(walker.rig.legs[0].hip.rotation.x, legPose);
for (let i = 0; i < 2400; i++) trip.tick(1 / 60);
assert.equal(trip.task.phase, "action");
for (const id of RESIDENT_IDS) {
  const model = createResident(id);
  let triangles = 0;
  model.traverseVisible((o) => {
    if (o.isMesh)
      triangles +=
        (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
  });
  assert(triangles <= 800, `${id}: resident detail budget`);
}
console.log(
  "PASS: full-distance walking arrival, changing gait and visible resident geometry budget.",
);

// The same transition must reach the same pose at different rendering rates.
function transitionAt(fps, seconds) {
  const model = createResident("iara");
  for (let frame = 1; frame <= Math.round(fps * seconds); frame++)
    animateResident(model.rig, "sit", frame / fps, 1 / fps);
  return model;
}
for (const seconds of [0.2, 0.5, 1]) {
  const reference = transitionAt(60, seconds);
  for (const fps of [30, 120]) {
    const candidate = transitionAt(fps, seconds);
    candidate.rig.joints.forEach((joint, i) => {
      assert(joint.position.distanceTo(reference.rig.joints[i].position) < 1e-9);
      assert(joint.quaternion.angleTo(reference.rig.joints[i].quaternion) < 1e-7);
    });
  }
}
const interrupted = transitionAt(60, 0.2);
const before = interrupted.rig.joints.map(j => [j.position.clone(), j.quaternion.clone()]);
animateResident(interrupted.rig, "walk", 0, 0);
interrupted.rig.joints.forEach((j, i) => {
  assert(j.position.distanceTo(before[i][0]) < 1e-9, "interrupted transition must not snap");
  assert(j.quaternion.angleTo(before[i][1]) < 1e-7);
});
console.log("PASS: matching transitions at 30/60/120 Hz and continuous interrupted poses.");
