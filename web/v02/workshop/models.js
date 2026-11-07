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
// Approved house roof language shared without changing the reference geometry.
function clayRoof(
  g,
  { half = 2, depth = 4, eave = 2.4, rise = 1.12, ridgeHeight = 3.78 } = {},
) {
  const angle = Math.atan2(rise, half),
    length = Math.hypot(half, rise);
  for (const side of [-1, 1]) {
    const slope = new THREE.Group();
    slope.position.set((side * half) / 2, eave + rise / 2, 0);
    slope.rotation.z = -side * angle;
    g.add(slope);
    box(slope, length, 0.16, depth, "tile", 0, 0, 0);
    // Four overlapping courses of hollow, softly faceted clay barrel tiles.
    const course = length / 4;
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < depth / 0.5; col++) {
        const shell = new THREE.Shape();
        for (let i = 0; i <= 6; i++) {
          const a = (i * Math.PI) / 6;
          const x = Math.cos(a) * 0.245,
            y = Math.sin(a) * 0.245;
          if (i === 0) shell.moveTo(x, y);
          else shell.lineTo(x, y);
        }
        for (let i = 6; i >= 0; i--) {
          const a = (i * Math.PI) / 6;
          shell.lineTo(Math.cos(a) * 0.195, Math.sin(a) * 0.195);
        }
        shell.closePath();
        const tileLength = course + 0.075;
        const geo = new THREE.ExtrudeGeometry(shell, {
          depth: tileLength,
          bevelEnabled: false,
        });
        geo.translate(0, 0, -tileLength / 2);
        const tile = mesh(
          slope,
          geo,
          (row * 3 + col) % 7 === 0 ? "tileLight" : "tile",
          side * (length / 2 - (row + 0.5) * course),
          0.09 + row * 0.025,
          -depth / 2 + 0.25 + col * 0.5,
        );
        tile.rotation.y = (side * Math.PI) / 2;
      }
    }
    box(slope, length, 0.2, 0.16, "tileLight", 0, 0.01, depth / 2);
    box(slope, length, 0.2, 0.16, "tileLight", 0, 0.01, -depth / 2);
    box(
      slope,
      0.14,
      0.22,
      depth + 0.15,
      "tileDark",
      (side * length) / 2,
      -0.04,
      0,
    );
  }
  const ridge = cylinder(
    g,
    0.25,
    0.25,
    depth + 0.16,
    "tileLight",
    0,
    ridgeHeight,
    0,
    6,
  );
  ridge.rotation.x = Math.PI / 2;
}
// Approved house reference: preserve its silhouette and material assignments.
function house() {
  const g = new THREE.Group();
  box(g, 3.5, 2.4, 3.5, "plaster", 0, 1.2, 0);
  gable(g, 3.5, 3.5, 2.4, 1.1);
  clayRoof(g);
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
function shedStudy01() {
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
function treeStudy01() {
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
function roadStudy01() {
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
function residentStudy01() {
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
// Study 02 carries the approved house language across the reference kit.
function shed() {
  const g = new THREE.Group();
  for (const x of [-1.72, 1.72])
    for (const z of [-0.72, 0.72]) {
      box(g, 0.23, 2.25, 0.23, "timber", x, 1.125, z);
      beam(
        g,
        [x, 1.67, z],
        [x - Math.sign(x) * 0.53, 2.2, z],
        0.16,
        "timberLight",
      );
    }
  for (const z of [-0.72, 0.72])
    box(g, 3.7, 0.22, 0.22, "timberLight", 0, 2.2, z);
  clayRoof(g, { depth: 2, eave: 2.3, rise: 0.85, ridgeHeight: 3.41 });
  for (let i = 0; i < 7; i++)
    box(
      g,
      0.45,
      0.88,
      0.1,
      i % 3 === 0 ? "timberLight" : "timber",
      -1.47 + i * 0.49,
      0.73,
      -0.73,
    );
  for (const z of [-0.28, -0.54])
    box(g, 2.9, 0.14, 0.24, "timberLight", 0, 0.48, z);
  for (const x of [-1.1, 1.1])
    box(g, 0.2, 0.41, 0.38, "timber", x, 0.205, -0.41);
  box(g, 2.8, 0.13, 0.12, "timber", 0, 0.24, -0.41);
  return g;
}
function tree() {
  const g = new THREE.Group();
  function bough(a, b, r1, r2) {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...b);
    const trunk = cylinder(
      g,
      r2,
      r1,
      start.distanceTo(end),
      "timber",
      0,
      0,
      0,
      6,
    );
    trunk.position.copy(start.clone().add(end).multiplyScalar(0.5));
    trunk.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      end.sub(start).normalize(),
    );
  }
  bough([0, 0.3, 0], [0.12, 2.5, 0.02], 0.3, 0.19);
  cylinder(g, 0.3, 0.43, 0.46, "timber", 0, 0.23, 0, 6);
  bough([0.08, 1.8, 0], [-0.9, 3.2, 0.2], 0.17, 0.09);
  bough([0.1, 2.1, 0], [1, 3.4, 0.25], 0.17, 0.09);
  bough([0.1, 2.2, 0], [0.1, 3.5, -0.9], 0.16, 0.08);
  const clusters = [
    [-0.9, 3.2, 0.2, 1.05],
    [0.95, 3.4, 0.25, 1.08],
    [0.1, 3.45, -0.9, 1.08],
    [-0.15, 4.02, -0.05, 1.16],
    [0.1, 3.25, 1.02, 0.95],
    [-0.8, 3.7, -0.65, 0.82],
  ];
  clusters.forEach(([x, y, z, r], i) =>
    ball(
      g,
      r,
      i === 3 ? "leafLight" : i === 2 ? "leafDark" : "leaf",
      x,
      y,
      z,
      [1, 0.84, 1],
      1,
    ),
  );
  for (const [x, y, z] of [
    [-1.3, 3.55, 0.3],
    [0.65, 4.22, 0.28],
    [-0.1, 3.6, 1.5],
  ])
    ball(g, 0.42, "leafLight", x, y, z, [1, 0.6, 0.9], 0);
  return g;
}
function road() {
  const g = new THREE.Group();
  box(g, 2, 0.025, 2, "earth", 0, 0.0125, 0);
  // Broad, quiet marks and a handful of low-sided stones replace pixel-sized grit.
  for (const [x, z, r] of [
    [-0.55, -0.48, 0.33],
    [0.43, 0.38, 0.42],
    [-0.17, 0.12, 0.29],
  ]) {
    const patch = cylinder(g, r, r, 0.003, "earth", x, 0.027, z, 6);
    patch.scale.z = 0.62;
    patch.material = materials.earth.clone();
    patch.material.color.offsetHSL(0, -0.02, 0.025);
    patch.userData.ownedMaterial = true;
  }
  for (const [x, z, r] of [
    [-0.8, 0.63, 0.09],
    [0.71, -0.58, 0.08],
    [0.64, 0.72, 0.065],
    [-0.66, -0.78, 0.06],
    [0.2, -0.5, 0.055],
  ])
    ball(g, r, "stone", x, 0.032, z, [1, 0.28, 0.75], 0);
  return g;
}
function resident() {
  const g = new THREE.Group();
  for (const x of [-0.125, 0.125]) {
    const boot = box(g, 0.2, 0.13, 0.3, "timber", x, 0.065, 0.055);
    cylinder(g, 0.09, 0.085, 0.6, "trousers", x, 0.42, 0, 6);
  }
  const body = cylinder(g, 0.23, 0.24, 0.5, "shirt", 0, 0.98, 0, 6);
  body.scale.z = 0.68;
  cylinder(g, 0.075, 0.08, 0.12, "skin", 0, 1.27, 0, 6);
  ball(g, 0.235, "skin", 0, 1.49, 0, [0.88, 1, 0.86], 1);
  ball(g, 0.238, "hair", 0, 1.57, -0.035, [0.88, 0.62, 0.86], 0);
  for (const side of [-1, 1]) {
    beam(g, [side * 0.23, 1.17, 0], [side * 0.3, 0.95, 0.015], 0.16, "shirt");
    beam(g, [side * 0.3, 0.95, 0.015], [side * 0.3, 0.76, 0.07], 0.11, "skin");
    ball(g, 0.07, "skin", side * 0.3, 0.73, 0.07, [0.8, 1, 1], 0);
    ball(g, 0.023, "hair", side * 0.075, 1.51, 0.177, [1, 1, 0.5], 0);
    ball(g, 0.046, "skin", side * 0.205, 1.49, -0.005, [0.6, 1, 0.65], 0);
  }
  ball(g, 0.043, "skin", 0, 1.46, 0.2, [0.8, 0.8, 1], 0);
  cylinder(g, 0.34, 0.34, 0.045, "earth", 0, 1.68, 0, 10);
  cylinder(g, 0.15, 0.19, 0.15, "earth", 0, 1.775, 0, 8);
  cylinder(g, 0.19, 0.195, 0.045, "timber", 0, 1.72, 0, 8);
  return g;
}
export const ASSETS = [
  {
    id: "house",
    name: "Limewashed house",
    revision: 3,
    type: "Home",
    footprint: [2, 2],
    description:
      "House study 03: chunky overlapping clay barrel tiles, a welcoming arched door, generous shutters and a little doorstep plant.",
    build: house,
  },
  {
    id: "shed",
    revision: 2,
    name: "Open timber shed",
    type: "Shelter",
    footprint: [2, 1],
    description:
      "Chunky timber framing, broad bench planks and the same overlapping clay tiles as the approved house.",
    build: shed,
  },
  {
    id: "tree",
    revision: 2,
    name: "Shade tree",
    type: "Vegetation",
    footprint: [2, 2],
    description:
      "Broad faceted canopy masses, a tapered branching trunk and restrained leaf accents. A generic shade-tree study.",
    build: tree,
  },
  {
    id: "road",
    revision: 2,
    name: "Earth path",
    type: "Ground",
    footprint: [1, 1],
    description:
      "Quiet packed earth with broad tonal patches and a few chunky stones. Exact 2 × 2 m edges join without a surrounding platform.",
    build: road,
  },
  {
    id: "resident",
    revision: 2,
    name: "Resident scale study",
    type: "Human scale",
    footprint: [1, 1],
    description:
      "A friendly faceted scale figure with simpler clothes, sturdy shoes and a broad straw hat. About 1.72 m to the head, 1.85 m with hat.",
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
    if (o.userData.ownedMaterial) o.material.dispose();
  });
}

// Shared construction language; approved study recipes remain unchanged.
export { box, cylinder, ball, beam, clayRoof, mesh };
