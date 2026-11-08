import * as THREE from "three";
import { box, cylinder, ball, beam, clayRoof } from "../workshop/models.js";

// Human-scale scene dressing. Uses the same materials and low-segment primitives
// as the approved studies; no textures, simulation, or random house attachments.
const group = () => new THREE.Group();
function ring(g, radius, tube, material, x, y, z, horizontal = false) {
  const sample = box(g, 0.01, 0.01, 0.01, material);
  g.remove(sample);
  sample.geometry.dispose();
  const m = new THREE.Mesh(
    new THREE.TorusGeometry(radius, tube, 4, 12),
    sample.material,
  );
  m.position.set(x, y, z);
  if (horizontal) m.rotation.x = Math.PI / 2;
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  return m;
}
function bench(g, x = 0, z = 0, length = 1.6, back = true) {
  for (const dz of [-0.14, 0, 0.14])
    box(g, length, 0.09, 0.12, "timberLight", x, 0.48, z + dz);
  for (const dx of [-length * 0.36, length * 0.36]) {
    box(g, 0.1, 0.48, 0.1, "timber", x + dx, 0.24, z - 0.12);
    box(g, 0.1, 0.48, 0.1, "timber", x + dx, 0.24, z + 0.12);
    if (back) box(g, 0.08, 0.5, 0.08, "timber", x + dx, 0.7, z - 0.19);
  }
  if (back)
    for (const y of [0.73, 0.89])
      box(g, length, 0.12, 0.07, "timberLight", x, y, z - 0.19);
}
function barrel(g, x = 0, z = 0) {
  cylinder(g, 0.36, 0.32, 0.92, "teal", x, 0.46, z, 10);
  cylinder(g, 0.37, 0.37, 0.06, "stone", x, 0.95, z, 10);
  for (const y of [0.17, 0.75]) ring(g, 0.355, 0.025, "stone", x, y, z, true);
  beam(g, [x, 0.17, z + 0.32], [x, 0.17, z + 0.47], 0.045, "stone");
  box(g, 0.18, 0.035, 0.035, "teal", x, 0.25, z + 0.42);
}
function crate(g, x = 0, y = 0, z = 0) {
  box(g, 0.62, 0.06, 0.5, "timber", x, y + 0.03, z);
  for (const dx of [-0.28, 0.28])
    for (const dz of [-0.22, 0.22])
      box(g, 0.055, 0.48, 0.055, "timber", x + dx, y + 0.24, z + dz);
  for (const h of [0.12, 0.28, 0.43]) {
    for (const dz of [-0.23, 0.23])
      box(g, 0.62, 0.11, 0.04, "timberLight", x, y + h, z + dz);
    for (const dx of [-0.29, 0.29])
      box(g, 0.04, 0.11, 0.5, "timberLight", x + dx, y + h, z);
  }
}
function table(g, length = 1.7) {
  for (const z of [-0.32, -0.16, 0, 0.16, 0.32])
    box(g, length, 0.09, 0.14, "timberLight", 0, 0.8, z);
  for (const x of [-length * 0.35, length * 0.35])
    for (const z of [-0.25, 0.25])
      box(g, 0.09, 0.77, 0.09, "timber", x, 0.385, z);
}
const recipes = {
  "rain-barrel": () => {
    const g = group();
    barrel(g);
    beam(g, [-0.55, 0, -0.12], [-0.55, 1.45, -0.12], 0.06, "stone");
    beam(g, [-0.55, 1.45, -0.12], [0, 1.45, -0.12], 0.06, "stone");
    beam(g, [0, 1.45, -0.12], [0, 1, -0.12], 0.06, "stone");
    return g;
  },
  "watering-can": () => {
    const g = group();
    cylinder(g, 0.17, 0.2, 0.34, "teal", 0, 0.19, 0, 8);
    cylinder(g, 0.11, 0.11, 0.035, "hair", 0, 0.37, 0, 8);
    beam(g, [0.12, 0.15, 0], [0.43, 0.38, 0], 0.055, "teal");
    const rose = cylinder(g, 0.085, 0.06, 0.07, "stone", 0.45, 0.4, 0, 8);
    rose.rotation.z = -0.7;
    ring(g, 0.19, 0.025, "teal", -0.16, 0.24, 0);
    return g;
  },
  wheelbarrow: () => {
    const g = group();
    const tire = ring(g, 0.23, 0.065, "hair", 0, 0.3, 0.55);
    tire.rotation.y = Math.PI / 2;
    const hub = cylinder(g, 0.055, 0.055, 0.75, "stone", 0, 0.3, 0.55, 8);
    hub.rotation.z = Math.PI / 2;
    for (const x of [-0.32, 0.32]) {
      beam(g, [x, 0.36, 0.55], [x, 0.65, -0.85], 0.065, "teal");
      beam(g, [x, 0.04, -0.35], [x, 0.5, -0.35], 0.05, "teal");
      box(g, 0.09, 0.08, 0.3, "timber", x, 0.65, -0.8);
    }
    box(g, 0.7, 0.06, 0.8, "teal", 0, 0.52, 0.05);
    for (const x of [-0.36, 0.36]) {
      const m = box(g, 0.06, 0.32, 0.85, "teal", x, 0.67, 0.05);
      m.rotation.z = x > 0 ? -0.2 : 0.2;
    }
    box(g, 0.75, 0.3, 0.06, "teal", 0, 0.67, 0.45);
    box(g, 0.75, 0.3, 0.06, "teal", 0, 0.67, -0.35);
    return g;
  },
  "tool-rack": () => {
    const g = group();
    for (const x of [-0.65, 0.65])
      box(g, 0.1, 1.65, 0.1, "timber", x, 0.825, 0);
    for (const y of [0.6, 1.3]) box(g, 1.5, 0.1, 0.1, "timberLight", 0, y, 0);
    for (const [i, x] of [-0.48, 0, 0.48].entries()) {
      box(g, 0.055, 1.3, 0.055, "timberLight", x, 0.8, 0.12);
      if (i === 0) {
        const m = box(g, 0.25, 0.32, 0.04, "stone", x, 0.25, 0.12);
        m.rotation.z = 0.12;
      } else if (i === 1) {
        box(g, 0.42, 0.05, 0.08, "stone", x, 0.17, 0.12);
        for (let j = 0; j < 5; j++)
          box(g, 0.025, 0.14, 0.03, "stone", x - 0.18 + j * 0.09, 0.1, 0.15);
      } else box(g, 0.27, 0.06, 0.2, "stone", x, 0.19, 0.2);
    }
    return g;
  },
  "seedling-bench": () => {
    const g = group();
    table(g);
    for (const x of [-0.55, 0, 0.55])
      for (const z of [-0.2, 0.2]) {
        cylinder(g, 0.12, 0.08, 0.16, "tile", x, 0.94, z, 6);
        cylinder(g, 0.1, 0.1, 0.02, "earth", x, 1.03, z, 6);
        ball(g, 0.1, "leaf", x, 1.13, z, [1, 1.3, 1], 0);
      }
    box(g, 1.7, 0.08, 0.4, "timber", 0, 0.23, 0);
    crate(g, 0, 0.27, 0);
    return g;
  },
  woodpile: () => {
    const g = group();
    for (let row = 0; row < 3; row++)
      for (let i = 0; i < 4 - row; i++) {
        const x = (i - (3 - row) / 2) * 0.3,
          y = 0.17 + row * 0.26;
        const log = cylinder(g, 0.15, 0.15, 1.2, "timber", x, y, 0, 7);
        log.rotation.x = Math.PI / 2;
        const end = cylinder(g, 0.12, 0.12, 0.02, "timberLight", x, y, 0.61, 7);
        end.rotation.x = Math.PI / 2;
      }
    return g;
  },
  "picnic-table": () => {
    const g = group();
    // Open-sided canopy: corner posts keep the bench approaches clear.
    for (const x of [-1.55, 1.55]) for (const z of [-0.68, 0.68]) {
      box(g, 0.13, 2.35, 0.13, "timber", x, 1.175, z);
      beam(g, [x, 1.85, z], [x - Math.sign(x) * 0.42, 2.3, z], 0.09, "timberLight");
    }
    for (const z of [-0.68, 0.68]) box(g, 3.4, 0.15, 0.13, "timber", 0, 2.3, z);
    for (const x of [-1.55, 0, 1.55]) {
      box(g, 0.1, 0.12, 1.75, "timberLight", x, 2.34, 0);
      beam(g, [x, 2.35, -0.88], [x, 2.9, 0], 0.09, "timber");
      beam(g, [x, 2.9, 0], [x, 2.35, 0.88], 0.09, "timber");
    }
    const canopy = group();
    canopy.rotation.y = Math.PI / 2;
    clayRoof(canopy, { half: 0.94, depth: 3.7, eave: 2.4, rise: 0.55, ridgeHeight: 3.02 });
    canopy.scale.set(0.85, 1, 0.95);
    g.add(canopy);
    table(g, 2.1);
    bench(g, 0, -0.85, 2.1, false);
    bench(g, 0, 0.85, 2.1, false);
    for (const x of [-0.7, 0.7]) box(g, 0.12, 0.12, 2, "timber", x, 0.28, 0);
    return g;
  },
  "garden-bench": () => {
    const g = group();
    bench(g);
    return g;
  },
  clothesline: () => {
    const g = group();
    for (const x of [-1.35, 1.35]) {
      cylinder(g, 0.055, 0.07, 1.95, "timber", x, 0.975, 0, 6);
      box(g, 0.1, 0.08, 0.7, "timberLight", x, 1.85, 0);
    }
    for (const z of [-0.28, 0.28])
      beam(g, [-1.35, 1.85, z], [1.35, 1.85, z], 0.018, "earth");
    for (const [i, x] of [-0.85, -0.2, 0.5].entries()) {
      box(g, 0.45, 0.7, 0.025, ["plaster", "teal", "tile"][i], x, 1.48, -0.28);
      for (const dx of [-0.15, 0.15])
        box(g, 0.025, 0.075, 0.04, "timberLight", x + dx, 1.86, -0.28);
    }
    return g;
  },
  hammock: () => {
    const g = group();
    for (const x of [-1.4, 1.4]) {
      beam(g, [x, 0, 0], [x * 0.88, 1.55, 0], 0.11, "timber");
      box(g, 0.12, 0.08, 0.9, "timber", x, 0.04, 0);
    }
    const points = [],
      idx = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8,
        x = -1.2 + t * 2.4,
        y = 0.58 + Math.pow(t * 2 - 1, 2) * 0.83,
        w = Math.sin(Math.PI * t) * 0.42;
      points.push(x, y, -w, x, y, w);
      if (i < 8) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const sample = box(g, 0.01, 0.01, 0.01, "teal");
    g.remove(sample);
    sample.geometry.dispose();
    const material = sample.material.clone();
    material.side = THREE.DoubleSide;
    const cloth = new THREE.Mesh(geo, material);
    cloth.userData.ownedMaterial = true;
    cloth.castShadow = true;
    cloth.receiveShadow = true;
    g.add(cloth);
    for (const x of [-1.2, 1.2])
      beam(
        g,
        [x, 0.58 + 0.83, 0],
        [x > 0 ? 1.23 : -1.23, 1.55, 0],
        0.025,
        "earth",
      );
    return g;
  },
  bicycle: () => {
    const g = group();
    for (const x of [-0.58, 0.58]) {
      ring(g, 0.32, 0.035, "hair", x, 0.35, 0);
      ring(g, 0.28, 0.012, "stone", x, 0.35, 0);
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        beam(
          g,
          [x, 0.35, 0],
          [x + Math.cos(a) * 0.28, 0.35 + Math.sin(a) * 0.28, 0],
          0.012,
          "stone",
        );
      }
    }
    const a = [-0.58, 0.35, 0],
      b = [-0.2, 0.8, 0],
      c = [0.05, 0.35, 0],
      d = [0.4, 0.85, 0],
      e = [0.58, 0.35, 0];
    for (const [p, q] of [
      [a, b],
      [b, c],
      [c, a],
      [b, d],
      [d, c],
      [d, e],
    ])
      beam(g, p, q, 0.045, "teal");
    box(g, 0.28, 0.06, 0.18, "hair", -0.22, 0.86, 0);
    beam(g, d, [0.35, 1, 0], 0.035, "stone");
    box(g, 0.08, 0.04, 0.42, "hair", 0.35, 1, 0);
    beam(g, [0.05, 0.35, 0], [0.05, 0.35, 0.18], 0.035, "stone");
    box(g, 0.16, 0.04, 0.1, "hair", 0.05, 0.35, 0.2);
    beam(g, [0, 0.4, 0], [0.18, 0, 0.22], 0.025, "stone");
    return g;
  },
  "produce-crates": () => {
    const g = group();
    crate(g, -0.35, 0, 0);
    crate(g, 0.35, 0, 0);
    crate(g, -0.35, 0.5, 0);
    for (const x of [-0.48, -0.25])
      for (const z of [-0.12, 0.12])
        ball(g, 0.09, "tile", x, 1, z, [1, 1, 1], 0);
    return g;
  },
  "wayfinding-sign": () => {
    const g = group();
    cylinder(g, 0.055, 0.075, 1.65, "timber", 0, 0.825, 0, 6);
    box(g, 1, 0.23, 0.08, "teal", 0.16, 1.35, 0);
    box(g, 0.8, 0.2, 0.08, "timberLight", -0.14, 1.05, 0);
    for (const y of [1.35, 1.05]) box(g, 0.04, 0.04, 0.02, "stone", 0, y, 0.05);
    return g;
  },
  "wash-station": () => {
    const g = group();
    for (const x of [-0.55, 0.55])
      for (const z of [-0.3, 0.3]) box(g, 0.1, 0.8, 0.1, "timber", x, 0.4, z);
    box(g, 1.25, 0.1, 0.8, "timberLight", 0, 0.83, 0);
    cylinder(g, 0.29, 0.25, 0.07, "stone", -0.1, 0.915, 0, 10);
    cylinder(g, 0.25, 0.25, 0.015, "teal", -0.1, 0.96, 0, 10);
    ring(g, 0.29, 0.035, "stone", -0.1, 0.99, 0, true);
    beam(g, [0.35, 0.9, -0.2], [0.35, 1.25, -0.2], 0.045, "stone");
    beam(g, [0.35, 1.25, -0.2], [0.05, 1.25, -0.2], 0.045, "stone");
    box(g, 0.12, 0.055, 0.08, "plaster", -0.5, 0.92, 0.15);
    return g;
  },
  "farm-gate": () => {
    const g = group();
    for (const x of [-0.9, 0.9]) box(g, 0.12, 1.2, 0.12, "timber", x, 0.6, 0);
    for (const y of [0.35, 0.65, 0.95])
      box(g, 1.65, 0.1, 0.08, "timberLight", 0, y, 0);
    beam(g, [-0.8, 0.3, 0], [0.8, 1, 0], 0.09, "timber");
    box(g, 0.16, 0.05, 0.06, "stone", 0.75, 1, 0.07);
    return g;
  },
  "fire-circle": () => {
    const g = group();
    cylinder(g, 0.58, 0.58, 0.04, "earth", 0, 0.02, 0, 12);
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 5;
      ball(
        g,
        0.16,
        "stone",
        Math.sin(a) * 0.65,
        0.13,
        Math.cos(a) * 0.65,
        [1.2, 0.8, 1],
        0,
      );
    }
    for (const a of [-0.5, 0.5]) {
      const log = cylinder(g, 0.075, 0.075, 0.75, "timber", 0, 0.12, 0, 6);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = a;
    }
    return g;
  },
};
const metadata = [
  [
    "rain-barrel",
    "Rainwater barrel",
    [1, 1],
    "A compact collection barrel with an inlet pipe, lid, reinforcing bands and tap.",
  ],
  [
    "watering-can",
    "Watering can",
    [1, 1],
    "A hand-sized garden can with a loop handle and sprinkler rose.",
  ],
  [
    "wheelbarrow",
    "Wheelbarrow",
    [1, 1],
    "A single-wheel barrow for soil, harvests and construction materials.",
  ],
  [
    "tool-rack",
    "Garden tool rack",
    [1, 1],
    "Shovel, rake and hoe stored on a simple timber rack.",
  ],
  [
    "seedling-bench",
    "Seedling bench",
    [1, 1],
    "Potted seedlings above a shaded storage shelf.",
  ],
  [
    "woodpile",
    "Seasoned firewood",
    [1, 1],
    "Stacked logs with visible cut ends.",
  ],
  [
    "picnic-table",
    "Picnic table",
    [2, 1],
    "A shared table and two benches under an open timber canopy with clay roof tiles.",
  ],
  [
    "garden-bench",
    "Garden bench",
    [1, 1],
    "A small slatted bench for a path, house or shady tree.",
  ],
  [
    "clothesline",
    "Clothesline",
    [2, 1],
    "Two timber posts, twin lines and pegged laundry.",
  ],
  [
    "hammock",
    "Hammock",
    [2, 1],
    "A curved fabric hammock on a freestanding timber support.",
  ],
  [
    "bicycle",
    "Bicycle",
    [1, 1],
    "A simple utility bicycle with spoked wheels, pedals and a stand.",
  ],
  [
    "produce-crates",
    "Produce crates",
    [1, 1],
    "Stackable slatted crates with a small harvest.",
  ],
  [
    "wayfinding-sign",
    "Wayfinding sign",
    [1, 1],
    "Two blank directional boards; labels can be added by future gameplay.",
  ],
  [
    "wash-station",
    "Outdoor wash station",
    [1, 1],
    "A waist-height basin and tap for a shared outdoor workspace.",
  ],
  [
    "farm-gate",
    "Farm gate",
    [1, 1],
    "A braced timber gate for paths and planted areas.",
  ],
  [
    "fire-circle",
    "Fire circle",
    [1, 1],
    "An unlit stone ring with firewood; no fire or cooking simulation.",
  ],
];
export const PROPS = metadata.map(([id, name, footprint, description]) => ({
  id,
  name,
  footprint,
  description,
  category: "Props",
  type: "Props",
  revision: 1,
  legacy: [],
  build: recipes[id],
}));
