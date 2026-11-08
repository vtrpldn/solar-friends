import * as THREE from "three";
import { box, cylinder, ball, beam, clayRoof } from "../workshop/models.js";
function bench(g, x, z, width = 1.5) {
  box(g, width, 0.13, 0.42, "timberLight", x, 0.5, z);
  for (const dx of [-width * 0.35, width * 0.35])
    box(g, 0.12, 0.5, 0.35, "timber", x + dx, 0.25, z);
}
function table(g, x, z, width = 1.5) {
  box(g, width, 0.12, 0.7, "timberLight", x, 0.85, z);
  for (const dx of [-width * 0.35, width * 0.35])
    for (const dz of [-0.24, 0.24])
      box(g, 0.1, 0.8, 0.1, "timber", x + dx, 0.4, z + dz);
}
function roof(g, w, d) {
  for (const x of [-w / 2 + 0.25, w / 2 - 0.25])
    for (const z of [-d / 2 + 0.25, d / 2 - 0.25])
      box(g, 0.16, 2.4, 0.16, "timber", x, 1.2, z);
  clayRoof(g, {
    half: w / 2,
    depth: d,
    eave: 2.4,
    rise: 0.8,
    ridgeHeight: 3.28,
  });
}
function board(g, x, z) {
  box(g, 1.25, 0.8, 0.09, "teal", x, 1.5, z);
  for (const dx of [-0.65, 0.65])
    box(g, 0.08, 2, 0.1, "timberLight", x + dx, 1, z);
  for (let i = 0; i < 3; i++)
    box(
      g,
      0.72 - i * 0.13,
      0.025,
      0.02,
      "plaster",
      x - 0.12,
      1.7 - i * 0.17,
      z + 0.06,
    );
}
export function createCommunity(id) {
  const g = new THREE.Group();
  if (id === "reading-room") {
    box(g, 3.2, 2.25, 0.16, "plaster", 0, 1.125, -1.35);
    box(g, 0.16, 2.25, 2.7, "plaster", -1.52, 1.125, 0);
    roof(g, 3.6, 3.4);
    for (const y of [0.5, 1, 1.5]) {
      box(g, 2.5, 0.1, 0.35, "timberLight", 0, y, -1.05);
      for (let i = 0; i < 10; i++)
        box(
          g,
          0.12,
          0.27 + (i % 3) * 0.06,
          0.22,
          ["teal", "tile", "leaf", "plaster"][i % 4],
          -1.1 + i * 0.23,
          y + 0.21,
          -1.05,
        );
    }
    bench(g, -0.7, 0.65, 1.1);
    table(g, 0.65, 0.45, 0.75);
    bench(g, 0.65, 1.1, 0.8);
  } else if (id === "outdoor-classroom") {
    roof(g, 5.4, 3.5);
    board(g, 0, -1.35);
    for (const x of [-1.5, 1.5]) {
      table(g, x, 0.1, 1.5);
      bench(g, x, 0.8, 1.5);
      box(g, 0.35, 0.025, 0.25, "plaster", x, 0.93, 0.1);
    }
  } else if (id === "community-hall") {
    box(g, 5.2, 2.25, 0.16, "plaster", 0, 1.125, -1.4);
    box(g, 0.16, 2.25, 2.8, "plaster", -2.52, 1.125, 0);
    roof(g, 5.6, 3.5);
    table(g, 0, 0.1, 3);
    bench(g, 0, 0.85, 3);
    bench(g, 0, -0.65, 3);
    board(g, 1.6, -1.28);
    for (const x of [-2, 2]) {
      cylinder(g, 0.2, 0.16, 0.32, "tile", x, 0.16, 1.3);
      ball(g, 0.28, "leaf", x, 0.55, 1.3, [1, 1.1, 1], 0);
    }
  } else if (id === "exercise-garden") {
    for (const x of [-0.9, 0.2]) {
      for (const z of [-1, 1]) box(g, 0.13, 1.1, 0.13, "timber", x, 0.55, z);
      beam(g, [x, 1.1, -1], [x, 1.1, 1], 0.12, "timberLight");
    }
    for (let i = 0; i < 4; i++)
      cylinder(
        g,
        0.24,
        0.27,
        0.2 + i * 0.06,
        "timberLight",
        1.15,
        0.1 + i * 0.03,
        -1.2 + i * 0.75,
        8,
      );
    bench(g, -0.6, 1.55, 1.5);
  } else if (id === "volleyball-court") {
    box(g, 7.3, 0.035, 5.3, "earth", 0, 0.02, 0);
    for (const x of [-3.35, 3.35])
      box(g, 0.055, 0.02, 4.8, "plaster", x, 0.05, 0);
    for (const z of [-2.4, 2.4])
      box(g, 6.7, 0.02, 0.055, "plaster", 0, 0.05, z);
    for (const z of [-2.5, 2.5])
      cylinder(g, 0.07, 0.09, 1.9, "timber", 0, 0.95, z);
    for (let i = 0; i < 13; i++)
      beam(
        g,
        [0, 0.95, -2.4 + i * 0.4],
        [0, 1.8, -2.4 + i * 0.4],
        0.018,
        "plaster",
      );
    for (const y of [0.95, 1.23, 1.52, 1.8])
      beam(g, [0, y, -2.4], [0, y, 2.4], 0.018, "plaster");
    ball(g, 0.16, "plaster", 1.3, 0.18, 0.7, [1, 1, 1], 1);
    bench(g, -2.5, 2.75, 1.5);
  }
  return g;
}
