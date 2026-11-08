import * as THREE from "three";
import { box, beam } from "../workshop/models.js";
export function openingStorage(tarp = false) {
  const g = new THREE.Group();
  const w = tarp ? 1.4 : 3.2,
    d = 1.4;
  box(g, w, 0.12, d, "timberLight", 0, 0.3, 0);
  for (const x of [-w / 2 + 0.12, w / 2 - 0.12])
    for (const z of [-0.55, 0.55])
      box(g, 0.14, tarp ? 0.3 : 1.9, 0.14, "timber", x, tarp ? 0.15 : 0.95, z);
  for (const x of tarp ? [0] : [-1, 0, 1]) {
    box(g, 0.65, 0.55, 0.8, "timberLight", x, 0.62, 0);
    for (const y of [0.42, 0.65, 0.85])
      box(g, 0.68, 0.045, 0.035, "timber", x, y, 0.42);
  }
  if (tarp) {
    box(g, w + 0.1, 0.08, d + 0.1, "teal", 0, 0.96, 0);
    box(g, w + 0.1, 0.3, 0.06, "teal", 0, 0.82, 0.74);
  } else {
    const roof = box(g, w + 0.25, 0.09, d + 0.2, "stone", 0, 2, 0);
    roof.rotation.x = 0.1;
    for (let i = 0; i < 9; i++)
      box(
        g,
        0.025,
        0.035,
        d + 0.2,
        "plaster",
        -1.6 + i * 0.4,
        2.06,
        0,
      ).rotation.x = 0.1;
  }
  return g;
}

export function openingAssembly(id, stage) {
  const g = new THREE.Group(),
    tent = id === "canvas-tent-ochre",
    tarp = id === "tarp-covered-supplies";
  const width = tent ? 2.2 : tarp ? 1.4 : 3.2,
    depth = tent ? 2.6 : 1.4;
  if (!stage) {
    for (let i = 0; i < 3; i++)
      box(g, width * 0.7, 0.09, 0.12, "timberLight", 0, 0.08 + i * 0.09, 0);
    box(g, 0.65, 0.18, 0.5, tent || tarp ? "teal" : "stone", 0, 0.12, 0.6);
  } else if (tent) {
    for (const z of [-1.3, 1.3]) {
      beam(g, [-1.1, 0.05, z], [0, 1.5, z], 0.06);
      beam(g, [0, 1.5, z], [1.1, 0.05, z], 0.06);
    }
    beam(g, [0, 1.5, -1.3], [0, 1.5, 1.3], 0.06);
    box(g, 0.65, 0.18, 0.5, "teal", 0, 0.12, 0);
  } else {
    box(g, width, 0.12, depth, "timberLight", 0, 0.3, 0);
    for (const x of [-width / 2 + 0.12, width / 2 - 0.12])
      for (const z of [-0.55, 0.55])
        box(
          g,
          0.14,
          tarp ? 0.3 : 1.9,
          0.14,
          "timber",
          x,
          tarp ? 0.15 : 0.95,
          z,
        );
    box(g, 0.65, 0.5, 0.8, "timberLight", 0, 0.6, 0);
  }
  return g;
}
