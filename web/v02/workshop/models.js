import * as THREE from "three";
export const CELL = 2;
export const PALETTE = {
  plaster: "#e8d8ab",
  timber: "#936039",
  timberLight: "#b4834e",
  tile: "#b95532",
  tileLight: "#bf633b",
  tileDark: "#a84f30",
  teal: "#397c72",
  glass: "#334f4e",
  leaf: "#68883c",
  leafLight: "#91a74c",
  leafDark: "#3d632f",
  earth: "#b68a59",
  stone: "#ac9e7e",
  skin: "#b87950",
  shirt: "#d3ad58",
  trousers: "#496e62",
  hair: "#3a2a23",
};
const materials = Object.fromEntries(
  Object.entries(PALETTE).map(([k, color]) => [
    k,
    new THREE.MeshStandardMaterial({
      color,
      roughness: 1,
      metalness: 0,
      flatShading: true,
    }),
  ]),
);
function mesh(g, geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, materials[material]);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}
function box(g, w, h, d, m, x = 0, y = 0, z = 0) {
  return mesh(g, new THREE.BoxGeometry(w, h, d), m, x, y, z);
}
function cylinder(g, r1, r2, h, m, x = 0, y = 0, z = 0, n = 10) {
  return mesh(g, new THREE.CylinderGeometry(r1, r2, h, n), m, x, y, z);
}
function ball(g, r, m, x, y, z, s = [1, 1, 1], detail = 1) {
  const a = mesh(g, new THREE.IcosahedronGeometry(r, detail), m, x, y, z);
  a.scale.set(...s);
  return a;
}
function beam(g, a, b, width, material = "timber") {
  const start = new THREE.Vector3(...a),
    end = new THREE.Vector3(...b);
  const m = box(g, width, start.distanceTo(end), width, material);
  m.position.copy(start.add(end).multiplyScalar(0.5));
  m.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(...b).sub(new THREE.Vector3(...a)).normalize(),
  );
  return m;
}
function roof(g, width, depth, eave, rise) {
  const half = width / 2,
    angle = Math.atan2(rise, half),
    length = Math.hypot(half, rise);
  for (const sign of [-1, 1]) {
    const slope = new THREE.Group();
    slope.position.set((sign * half) / 2, eave + rise / 2, 0);
    slope.rotation.z = -sign * angle;
    g.add(slope);
    box(slope, length, 0.1, depth, "timber", 0, -0.04, 0);
    const rows = Math.ceil(length / 0.4),
      columns = Math.ceil(depth / 0.26);
    for (let i = 0; i < rows; i++)
      for (let j = 0; j < columns; j++) {
        // Barrel tiles run down the actual roof plane; no sprite-space distortion.
        const geo = new THREE.CylinderGeometry(
          0.13,
          0.115,
          length / rows + 0.035,
          8,
          1,
          true,
          0,
          Math.PI,
        );
        const tile = mesh(
          slope,
          geo,
          ["tile", "tileLight", "tileDark"][
            (i * 7 + j * 3) % 11 < 7 ? 0 : ((i + j) % 2) + 1
          ],
          -length / 2 + ((i + 0.5) * length) / rows,
          0.055,
          -depth / 2 + ((j + 0.5) * depth) / columns,
        );
        tile.rotation.z = Math.PI / 2;
      }
    box(slope, length, 0.15, 0.11, "timberLight", 0, -0.045, depth / 2);
    box(slope, length, 0.15, 0.11, "timberLight", 0, -0.045, -depth / 2);
  }
  for (let z = -depth / 2 + 0.12; z < depth / 2; z += 0.25) {
    const cap = cylinder(
      g,
      0.145,
      0.145,
      0.27,
      "tileLight",
      0,
      eave + rise + 0.08,
      z,
      10,
    );
    cap.rotation.x = Math.PI / 2;
  }
}
function gable(g, width, depth, eave, rise) {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, 0);
  s.lineTo(width / 2, 0);
  s.lineTo(0, rise);
  s.closePath();
  const a = mesh(
    g,
    new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }),
    "plaster",
    0,
    eave,
    -depth / 2,
  );
  return a;
}
function windowOn(g, x, y, z, rotation = 0) {
  const w = new THREE.Group();
  w.position.set(x, y, z);
  w.rotation.y = rotation;
  g.add(w);
  box(w, 0.86, 0.95, 0.07, "timber");
  box(w, 0.71, 0.8, 0.1, "glass", 0, 0, 0.03);
  for (const side of [-1, 1]) {
    box(w, 0.29, 0.8, 0.1, "teal", side * 0.25, 0, 0.09);
    for (let i = 0; i < 5; i++)
      box(
        w,
        0.28,
        0.025,
        0.025,
        "timberLight",
        side * 0.25,
        -0.3 + i * 0.15,
        0.15,
      );
  }
  box(w, 1.02, 0.1, 0.2, "timberLight", 0, -0.5, 0.04);
}
function houseStudy01() {
  const g = new THREE.Group();
  box(g, 3.6, 2.6, 3.6, "plaster", 0, 1.3, 0);
  gable(g, 3.6, 3.6, 2.6, 0.95);
  roof(g, 4, 4, 2.6, 1.05);
  box(g, 0.98, 2.15, 0.1, "timber", -0.65, 1.075, 1.82);
  box(g, 0.83, 2.06, 0.12, "teal", -0.65, 1.03, 1.89);
  for (let i = 0; i < 5; i++)
    box(g, 0.018, 2.03, 0.015, "timber", -0.98 + i * 0.165, 1.03, 1.96);
  ball(g, 0.035, "tileLight", -0.36, 1.05, 1.98);
  windowOn(g, 0.82, 1.55, 1.82);
  windowOn(g, 1.82, 1.5, 0, Math.PI / 2);
  windowOn(g, -1.82, 1.5, 0.15, -Math.PI / 2);
  windowOn(g, 0, 1.5, -1.82, Math.PI);
  for (let side of [-1, 1])
    for (let i = 0; i < 4; i++)
      box(
        g,
        0.36,
        0.13,
        0.018,
        "tile",
        side * 1.55 + (i % 2) * 0.06,
        0.15 + i * 0.18,
        1.81,
      );
  box(g, 1.14, 0.08, 0.2, "stone", -0.65, 0.04, 1.9);
  return g;
}
// House-only direction study. The other props keep the original shared kit.
function house() {
  const g = new THREE.Group();
  box(g, 3.5, 2.4, 3.5, "plaster", 0, 1.2, 0);
  gable(g, 3.5, 3.5, 2.4, 1.1);
  const half = 2,
    rise = 1.12,
    angle = Math.atan2(rise, half),
    length = Math.hypot(half, rise);
  for (const side of [-1, 1]) {
    const slope = new THREE.Group();
    slope.position.set(side, 2.4 + rise / 2, 0);
    slope.rotation.z = -side * angle;
    g.add(slope);
    box(slope, length, 0.16, 4, "tile", 0, 0, 0);
    // A few broad, three-sided barrel channels replace hundreds of tiny tiles.
    for (let col = 0; col < 8; col++) {
      const channel = mesh(
        slope,
        new THREE.CylinderGeometry(0.24, 0.24, length, 3, 1, false, 0, Math.PI),
        col % 4 === 0 ? "tileLight" : "tile",
        0,
        0.08,
        -1.75 + col * 0.5,
      );
      channel.rotation.z = Math.PI / 2;
    }
    box(slope, length, 0.2, 0.16, "tileLight", 0, 0.01, 2);
    box(slope, length, 0.2, 0.16, "tileLight", 0, 0.01, -2);
    box(slope, 0.14, 0.22, 4.15, "tileDark", (side * length) / 2, -0.04, 0);
  }
  const ridge = cylinder(g, 0.18, 0.18, 4.16, "tileLight", 0, 3.61, 0, 5);
  ridge.rotation.x = Math.PI / 2;
  // A broad arched entrance and a few chunky joinery details read at game scale.
  function arch(width, height, depth, material, x, y, z) {
    const r = width / 2,
      shape = new THREE.Shape();
    shape.moveTo(-r, 0);
    shape.lineTo(r, 0);
    shape.lineTo(r, height - r);
    for (let i = 1; i <= 6; i++) {
      const a = (i * Math.PI) / 6;
      shape.lineTo(Math.cos(a) * r, height - r + Math.sin(a) * r);
    }
    shape.closePath();
    return mesh(
      g,
      new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }),
      material,
      x,
      y,
      z,
    );
  }
  arch(1.16, 2.18, 0.12, "timberLight", -0.62, 0, 1.76);
  arch(0.94, 2.07, 0.13, "teal", -0.62, 0, 1.89);
  box(g, 0.88, 0.1, 0.04, "timberLight", -0.62, 0.45, 2.035);
  cylinder(
    g,
    0.045,
    0.045,
    0.05,
    "tileLight",
    -0.31,
    1.05,
    2.06,
    6,
  ).rotation.x = Math.PI / 2;
  box(g, 1.24, 0.09, 0.3, "stone", -0.62, 0.045, 1.88);
  function friendlyWindow(x, z, rotation) {
    const w = new THREE.Group();
    w.position.set(x, 1.38, z);
    w.rotation.y = rotation;
    g.add(w);
    box(w, 1.0, 1.0, 0.1, "timberLight");
    box(w, 0.78, 0.76, 0.12, "glass", 0, 0, 0.08);
    box(w, 0.065, 0.76, 0.05, "timberLight", 0, 0, 0.16);
    box(w, 0.78, 0.065, 0.05, "timberLight", 0, 0, 0.16);
    for (const side of [-1, 1]) {
      box(w, 0.25, 0.88, 0.12, "teal", side * 0.61, 0, 0.09);
      box(w, 0.27, 0.09, 0.04, "timberLight", side * 0.61, -0.24, 0.17);
    }
    box(w, 1.48, 0.15, 0.3, "timberLight", 0, -0.52, 0.08);
  }
  friendlyWindow(0.88, 1.78, 0);
  friendlyWindow(1.78, 0.1, Math.PI / 2);
  friendlyWindow(-1.78, 0, -Math.PI / 2);
  friendlyWindow(0, -1.78, Math.PI);
  // One small lived-in detail; no plot-sized platform or decorative clutter.
  cylinder(g, 0.24, 0.17, 0.36, "tile", 1.38, 0.18, 1.77, 6);
  cylinder(g, 0.26, 0.26, 0.09, "tileLight", 1.38, 0.34, 1.77, 6);
  for (let i = 0; i < 5; i++) {
    const a = i * 2.4;
    const leaf = ball(
      g,
      0.18,
      i % 2 ? "leaf" : "leafLight",
      1.38 + Math.cos(a) * 0.14,
      0.53,
      1.77 + Math.sin(a) * 0.12,
      [0.6, 1.5, 0.6],
      0,
    );
    leaf.rotation.z = Math.cos(a) * 0.5;
  }
  return g;
}
function shed() {
  const g = new THREE.Group();
  for (const x of [-1.75, 1.75])
    for (const z of [-0.75, 0.75]) {
      box(g, 0.17, 2.35, 0.17, "timber", x, 1.175, z);
      beam(g, [x, 1.75, z], [x - Math.sign(x) * 0.5, 2.28, z], 0.1);
    }
  box(g, 3.65, 0.18, 0.16, "timber", 0, 2.28, 0.75);
  box(g, 3.65, 0.18, 0.16, "timber", 0, 2.28, -0.75);
  roof(g, 4, 2, 2.4, 0.6);
  for (let i = 0; i < 10; i++)
    box(
      g,
      0.32,
      1.05,
      0.07,
      i % 3 ? "timber" : "timberLight",
      -1.6 + i * 0.355,
      0.7,
      -0.76,
    );
  box(g, 2.8, 0.12, 0.48, "timberLight", 0, 0.48, -0.42);
  for (const x of [-1.1, 1.1])
    box(g, 0.12, 0.43, 0.32, "timber", x, 0.215, -0.42);
  return g;
}
function tree() {
  const g = new THREE.Group();
  cylinder(g, 0.16, 0.31, 2.6, "timber", 0, 1.3, 0, 9);
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    beam(
      g,
      [0, 1.5 + i * 0.14, 0],
      [Math.cos(a) * 1.1, 3.1 + i * 0.12, Math.sin(a) * 1.1],
      0.15,
    );
    beam(g, [0, 0.18, 0], [Math.cos(a) * 0.65, 0.09, Math.sin(a) * 0.65], 0.12);
  }
  const clusters = [
    [0, 3.95, 0, 1.15],
    [-1, 3.25, 0.3, 0.96],
    [1, 3.45, 0.4, 1.02],
    [0.3, 3.25, -1, 0.98],
    [-0.6, 3.7, -0.7, 0.94],
    [0.3, 3.4, 1.1, 0.92],
  ];
  clusters.forEach(([x, y, z, r], i) => {
    ball(g, r, ["leaf", "leafLight", "leafDark"][i % 3], x, y, z, [1, 0.82, 1]);
    for (let j = 0; j < 7; j++) {
      const a = j * 2.399 + i;
      ball(
        g,
        r * 0.36,
        j % 3 ? "leaf" : "leafLight",
        x + Math.cos(a) * r * 0.76,
        y + 0.2 + Math.sin(j * 1.3) * 0.35,
        z + Math.sin(a) * r * 0.76,
        [1, 0.8, 1],
        0,
      );
    }
  });
  return g;
}
function road() {
  const g = new THREE.Group();
  box(g, 2, 0.035, 2, "earth", 0, 0.0175, 0);
  for (let i = 0; i < 40; i++) {
    const x = (((i * 37) % 97) / 97) * 1.92 - 0.96,
      z = (((i * 53) % 89) / 89) * 1.92 - 0.96;
    const m = ball(
      g,
      0.026 + (i % 3) * 0.012,
      i % 3 ? "earth" : "stone",
      x,
      0.042,
      z,
      [1, 0.25, 0.7],
      0,
    );
    m.rotation.y = i;
  }
  return g;
}
function resident() {
  const g = new THREE.Group();
  for (const x of [-0.13, 0.13]) {
    box(g, 0.17, 0.12, 0.31, "timber", x, 0.06, 0.045);
    cylinder(g, 0.085, 0.075, 0.66, "trousers", x, 0.43, 0);
  }
  const torso = cylinder(g, 0.19, 0.25, 0.48, "shirt", 0, 1.0, 0, 10);
  torso.scale.z = 0.65;
  cylinder(g, 0.068, 0.08, 0.13, "skin", 0, 1.31, 0);
  ball(g, 0.195, "skin", 0, 1.51, 0, [0.86, 1.05, 0.87], 2);
  ball(g, 0.197, "hair", 0, 1.59, -0.035, [0.87, 0.64, 0.83], 1);
  for (const x of [-1, 1]) {
    beam(g, [x * 0.2, 1.2, 0], [x * 0.28, 0.94, 0.02], 0.15, "shirt");
    beam(g, [x * 0.28, 0.94, 0.02], [x * 0.3, 0.74, 0.08], 0.1, "skin");
    ball(g, 0.065, "skin", x * 0.3, 0.72, 0.08, [0.7, 1, 1]);
    ball(g, 0.016, "hair", x * 0.061, 1.54, 0.158, [1, 1, 0.5]);
  }
  ball(g, 0.035, "skin", 0, 1.49, 0.17, [0.7, 0.8, 1]);
  cylinder(g, 0.33, 0.33, 0.035, "earth", 0, 1.67, 0, 20);
  cylinder(g, 0.15, 0.19, 0.17, "earth", 0, 1.755, 0, 16);
  cylinder(g, 0.192, 0.195, 0.04, "timber", 0, 1.7, 0, 16);
  return g;
}
export const ASSETS = [
  {
    id: "house",
    name: "Limewashed house",
    revision: 2,
    type: "Home",
    footprint: [2, 2],
    description:
      "House study 02: broad faceted terracotta, a welcoming arched door, generous shutters and a little doorstep plant.",
    build: house,
  },
  {
    id: "shed",
    name: "Open timber shed",
    type: "Shelter",
    footprint: [2, 1],
    description:
      "Open sides, structural braces and a shaded bench. Shares the house’s roof and timber kit.",
    build: shed,
  },
  {
    id: "tree",
    name: "Shade tree",
    type: "Vegetation",
    footprint: [2, 2],
    description:
      "Branch-supported foliage clusters and visible root contact. A generic canopy study, not a botanical species.",
    build: tree,
  },
  {
    id: "road",
    name: "Earth path",
    type: "Ground",
    footprint: [1, 1],
    description:
      "A seamless 2 × 2 m packed-earth tile. Its edges meet the grid without a surrounding platform.",
    build: road,
  },
  {
    id: "resident",
    name: "Resident scale study",
    type: "Human scale",
    footprint: [1, 1],
    description:
      "An authored standing figure, 1.70 m to the head and 1.84 m with hat. A proportion study, not a character creator.",
    build: resident,
  },
];
export function createAsset(id) {
  const def = ASSETS.find((a) => a.id === id);
  if (!def) throw new Error(`Unknown asset ${id}`);
  const g = def.build();
  g.name = id;
  g.userData = { id, footprint: def.footprint, revision: def.revision || 1 };
  g.updateMatrixWorld(true);
  return g;
}
export function disposeModel(model) {
  model.traverse((o) => {
    o.geometry?.dispose();
  });
}
