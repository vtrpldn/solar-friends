import * as THREE from "three";
import { box, cylinder, ball, beam } from "../workshop/models.js";
export const RESIDENT_IDS = [
  "resident",
  "iara",
  "bento",
  "luz",
  "caua",
  "nina",
];
// Identity changes only the visible meshes: joint lengths and interaction anchors stay shared.
const looks = {
  resident: { hat: true, hair: "short", outfit: "shirt", width: 1 },
  iara: { hat: true, hair: "braid", outfit: "overalls", width: 0.94 },
  bento: { hair: "curls", outfit: "vest", width: 1.08, beard: true },
  luz: { hair: "bun", outfit: "apron", width: 1 },
  caua: { hat: true, hair: "short", outfit: "vest", width: 1.04 },
  nina: { hair: "puffs", outfit: "overalls", width: 0.94 },
};
const palettes = new Map();
function joint(parent, name, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}
export function createResident(id = "resident") {
  const look = looks[id] || looks.resident;
  const root = new THREE.Group(),
    hips = joint(root, "hips", 0, 0.9),
    head = joint(hips, "head", 0, 0.59);
  const torso = cylinder(hips, 0.23, 0.24, 0.42, "shirt", 0, 0.2, 0, 6);
  torso.scale.z = 0.68;
  torso.scale.x = look.width;
  const clothes = joint(hips, "clothing");
  if (look.outfit === "overalls" || look.outfit === "apron") {
    const material = look.outfit === "apron" ? "plaster" : "trousers";
    box(clothes, 0.29, 0.28, 0.035, material, 0, 0.18, 0.16);
    for (const x of [-0.12, 0.12])
      box(clothes, 0.045, 0.19, 0.035, material, x, 0.34, 0.15);
    box(clothes, 0.14, 0.09, 0.015, "timberLight", 0, 0.17, 0.185);
  } else if (look.outfit === "vest") {
    for (const x of [-0.14, 0.14])
      box(clothes, 0.13, 0.32, 0.055, "earth", x, 0.22, 0.14);
  }
  cylinder(hips, 0.075, 0.08, 0.12, "skin", 0, 0.47, 0, 6);
  ball(head, 0.235, "skin", 0, 0, 0, [0.88, 1, 0.86], 1);
  ball(head, 0.238, "hair", 0, 0.08, -0.035, [0.88, 0.62, 0.86], 0);
  for (const s of [-1, 1]) {
    ball(head, 0.023, "hair", s * 0.075, 0.02, 0.177, [1, 1, 0.5], 0);
    ball(head, 0.046, "skin", s * 0.205, 0, -0.005, [0.6, 1, 0.65], 0);
  }
  ball(head, 0.043, "skin", 0, -0.03, 0.2, [0.8, 0.8, 1], 0);
  const hairstyle = joint(head, "hairstyle");
  if (look.hat) {
    const brim = id === "caua" ? 0.28 : 0.34;
    cylinder(hairstyle, brim, brim, 0.045, "earth", 0, 0.19, 0, 10);
    cylinder(hairstyle, 0.15, 0.19, 0.15, "earth", 0, 0.285, 0, 8);
    cylinder(
      hairstyle,
      0.19,
      0.195,
      0.045,
      id === "caua" ? "teal" : "timber",
      0,
      0.23,
      0,
      8,
    );
  }
  if (look.hair === "braid") {
    for (let i = 0; i < 3; i++)
      ball(
        hairstyle,
        0.085 - i * 0.012,
        "hair",
        0.14,
        -0.08 - i * 0.1,
        -0.12,
        [1, 1, 1],
        0,
      );
  }
  if (look.hair === "bun") {
    ball(hairstyle, 0.13, "hair", 0, 0.14, -0.2, [1, 1, 1], 0);
    cylinder(hairstyle, 0.218, 0.218, 0.055, "tile", 0, 0.13, -0.02, 8);
  }
  if (look.hair === "curls" || look.hair === "puffs") {
    for (const x of [-1, 1])
      ball(
        hairstyle,
        look.hair === "puffs" ? 0.135 : 0.12,
        "hair",
        x * (look.hair === "puffs" ? 0.23 : 0.14),
        look.hair === "puffs" ? 0.2 : 0.1,
        -0.065,
        [1, 1, 1],
        0,
      );
    ball(hairstyle, 0.14, "hair", 0, 0.19, -0.045, [1, 0.75, 1], 0);
  }
  if (look.beard)
    ball(hairstyle, 0.15, "hair", 0, -0.13, 0.07, [1, 0.7, 0.85], 0);
  const legs = [],
    arms = [];
  for (const s of [-1, 1]) {
    const hip = joint(hips, `hip-${s}`, s * 0.125),
      knee = joint(hip, `knee-${s}`, 0, -0.38);
    cylinder(hip, 0.09, 0.085, 0.38, "trousers", 0, -0.19, 0, 6);
    cylinder(knee, 0.085, 0.075, 0.42, "trousers", 0, -0.21, 0, 6);
    box(knee, 0.2, 0.13, 0.3, "timber", 0, -0.455, 0.055);
    legs.push({ hip, knee });
    const shoulder = joint(hips, `shoulder-${s}`, s * 0.26, 0.29),
      elbow = joint(shoulder, `elbow-${s}`, 0, -0.26);
    cylinder(shoulder, 0.08, 0.07, 0.26, "shirt", 0, -0.13, 0, 6);
    cylinder(elbow, 0.055, 0.05, 0.25, "skin", 0, -0.125, 0, 6);
    ball(elbow, 0.065, "skin", 0, -0.25, 0, [0.8, 1, 1], 0);
    arms.push({ shoulder, elbow });
  }
  const cargo = joint(hips, "carried-crate", 0, 0.14, 0.42);
  box(cargo, 0.55, 0.04, 0.4, "timber", 0, -0.15, 0);
  for (const z of [-0.19, 0.19])
    box(cargo, 0.55, 0.3, 0.035, "timberLight", 0, 0, z);
  for (const x of [-0.26, 0.26])
    box(cargo, 0.035, 0.3, 0.4, "timberLight", x, 0, 0);
  cargo.visible = false;
  const can = joint(hips, "watering-can", 0.26, 0.04, 0.5);
  cylinder(can, 0.13, 0.15, 0.25, "teal", 0, 0, 0, 8);
  beam(can, [0, -0.04, 0.08], [0, 0.05, 0.35], 0.04, "teal");
  can.visible = false;
  const stream = joint(can, "water");
  for (let i = 0; i < 4; i++)
    cylinder(
      stream,
      0.012,
      0.012,
      0.12,
      "glass",
      (i % 2) * 0.025 - 0.012,
      -0.15 - i * 0.12,
      0.35,
      4,
    );
  const joints = [
    hips,
    head,
    ...legs.flatMap((l) => [l.hip, l.knee]),
    ...arms.flatMap((a) => [a.shoulder, a.elbow]),
  ];
  const rig = { root, hips, head, legs, arms, cargo, can, stream, joints };
  root.rig = rig;
  root.name = id;
  const i = RESIDENT_IDS.indexOf(id) - 1;
  if (i >= 0) {
    const shirt = ["#d6af52", "#397c86", "#e6b987", "#7a954d", "#967caa"][i],
      skin = ["#bb8055", "#8d573a", "#bd8159", "#b77b4e", "#915a3c"][i];
    root.traverse((o) => {
      if (!o.isMesh) return;
      const hex = o.material.color.getHexString(),
        color = hex === "d3ad58" ? shirt : hex === "b87950" ? skin : null;
      if (color) {
        if (!palettes.has(color)) {
          const m = o.material.clone();
          m.color.set(color);
          palettes.set(color, m);
        }
        o.material = palettes.get(color);
      }
    });
  }
  poseResident(rig, "idle", 0);
  return root;
}
function reach(arm, y, z) {
  const dy = y - 0.29,
    d = Math.min(0.509, Math.max(0.02, Math.hypot(dy, z)));
  arm.shoulder.rotation.x =
    -Math.atan2(z, -dy) +
    Math.acos(
      THREE.MathUtils.clamp(
        (0.26 ** 2 + d * d - 0.25 ** 2) / (2 * 0.26 * d),
        -1,
        1,
      ),
    );
  arm.elbow.rotation.x =
    -Math.PI +
    Math.acos(
      THREE.MathUtils.clamp(
        (0.26 ** 2 + 0.25 ** 2 - d * d) / (2 * 0.26 * 0.25),
        -1,
        1,
      ),
    );
}
export function poseResident(rig, action, time, blend = 1) {
  const { hips, head, legs, arms, cargo, can, stream } = rig,
    phase = time * 8;
  const previous = [];
  if (blend < 1)
    for (const g of rig.joints)
      previous.push([g, g.position.clone(), g.quaternion.clone()]);
  hips.position.set(0, 0.9, 0);
  hips.rotation.set(0, 0, 0);
  head.rotation.set(0, 0, 0);
  for (const l of legs) {
    l.hip.rotation.set(0, 0, 0);
    l.knee.rotation.set(0, 0, 0);
  }
  for (const a of arms) {
    a.shoulder.rotation.set(0, 0, 0);
    a.elbow.rotation.set(0, 0, 0);
  }
  cargo.visible = action === "carry" || action === "carry-walk";
  can.visible = action === "water";
  if (action === "walk" || action === "carry-walk") {
    hips.position.y += 0.015 * (1 - Math.cos(phase * 2));
    hips.rotation.z = Math.sin(phase) * 0.025;
    head.rotation.z = -hips.rotation.z * 0.6;
    legs.forEach((l, i) => {
      const p = phase + i * Math.PI;
      l.hip.rotation.x = Math.sin(p) * 0.48;
      l.knee.rotation.x = Math.max(0, -Math.sin(p)) ** 2 * 0.65;
    });
    arms.forEach((a, i) => {
      a.shoulder.rotation.x = -Math.sin(phase + i * Math.PI) * 0.35;
      a.elbow.rotation.x = 0.12;
    });
  } else hips.position.y += Math.sin(time * 2) * 0.003;
  if (action === "sit") {
    hips.position.y = 0.62 + Math.sin(time * 2) * 0.003;
    legs.forEach((l) => {
      l.hip.rotation.x = -1.35;
      l.knee.rotation.x = 1.35;
    });
    arms.forEach((a) => reach(a, 0.12, 0.29));
  }
  if (action === "rest") {
    hips.position.y = 0.86 + Math.sin(time * 2) * 0.003;
    hips.rotation.z = -1.25;
    head.rotation.z = 0.15;
    legs.forEach((l) => {
      l.hip.rotation.z = -0.5;
      l.knee.rotation.z = 0.12;
    });
    arms.forEach((a) => {
      a.shoulder.rotation.z = 0.25;
      a.elbow.rotation.x = 0.25;
    });
  }
  if (["work", "wash", "water", "tend"].includes(action)) {
    hips.rotation.x = action === "tend" ? 0.55 : 0.12;
    head.rotation.x = 0.15;
    legs.forEach((l) => (l.hip.rotation.x = -hips.rotation.x));
    if (action === "tend") {
      hips.position.y = 0.68;
      hips.position.z = 0.25;
      legs.forEach((l) => {
        l.hip.rotation.x = -1.35;
        l.knee.rotation.x = 1.5;
      });
    }
    arms.forEach((a, i) =>
      reach(
        a,
        (action === "tend" ? -0.12 : 0.08) + Math.sin(time * 3 + i) * 0.045,
        0.34 + Math.cos(time * 3 + i) * 0.035,
      ),
    );
    if (action === "wash")
      arms.forEach((a, i) => (a.shoulder.rotation.z = i === 0 ? 0.25 : -0.25));
    if (action === "water") {
      can.rotation.x = 0.3 + Math.sin(time * 2) * 0.12;
      stream.scale.y = 0.85 + Math.sin(time * 10) * 0.15;
    }
  }
  if (action === "look" || action === "breathe") {
    head.rotation.y = Math.sin(time * 0.45) * 0.32;
    hips.rotation.z = Math.sin(time * 0.55) * 0.025;
    if (action === "breathe") arms.forEach((a) => (a.elbow.rotation.x = 0.25));
  }
  if (action === "chat") {
    head.rotation.x = Math.sin(time * 2) * 0.06;
    arms[0].shoulder.rotation.x = -0.3 + Math.sin(time * 1.5) * 0.12;
    arms[0].elbow.rotation.x = 0.65 + Math.sin(time * 2) * 0.16;
    head.rotation.y = Math.sin(time * 0.7) * 0.09;
  }
  if (action === "stretch") {
    const amount = 0.5 - 0.5 * Math.cos(time * 0.9);
    arms.forEach((a, i) => {
      a.shoulder.rotation.z = (i ? 1 : -1) * amount * 1.7;
      a.elbow.rotation.x = 0.25;
    });
    hips.rotation.z = Math.sin(time * 0.9) * 0.045;
  }
  if (cargo.visible) arms.forEach((a) => reach(a, 0.2, 0.36));
  const alpha = THREE.MathUtils.clamp(blend, 0, 1);
  for (const [g, p, q] of previous) {
    g.position.lerpVectors(p, g.position, alpha);
    g.quaternion.slerpQuaternions(q, g.quaternion.clone(), alpha);
  }
  rig.root.updateMatrixWorld(true);
}

// Capture the displayed pose once, then ease toward the live target over a fixed
// duration. This avoids frame-rate-dependent lag and supports interrupted changes.
export function animateResident(rig, action, time, dt) {
  if (rig.motion?.action !== action) {
    rig.motion = {
      action,
      elapsed: 0,
      from: rig.joints.map((j) => [j.position.clone(), j.quaternion.clone()]),
    };
  }
  const motion = rig.motion;
  motion.elapsed += Math.max(0, dt);
  poseResident(rig, action, time);
  const t = Math.min(1, motion.elapsed / 0.45);
  const weight = t * t * t * (t * (t * 6 - 15) + 10);
  if (t < 1)
    rig.joints.forEach((j, i) => {
      j.position.lerpVectors(motion.from[i][0], j.position, weight);
      j.quaternion.slerpQuaternions(
        motion.from[i][1],
        j.quaternion.clone(),
        weight,
      );
    });
  rig.root.updateMatrixWorld(true);
}
