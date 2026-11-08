import assert from "node:assert/strict";
import * as THREE from "three";
import {
  createResident,
  poseResident,
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
import { placementPosition } from "../web/v02/land/layout.js";
import { footprint } from "../web/v02/land/editor.js";
for (const id of RESIDENT_IDS) {
  const a = createResident(id);
  const neutral = new THREE.Box3().setFromObject(a, true);
  assert(Math.abs(neutral.max.y - 1.85) < 0.01, id);
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
