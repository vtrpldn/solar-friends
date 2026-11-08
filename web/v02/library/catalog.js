import { createResident, RESIDENT_IDS } from "../residents/rig.js";
import * as THREE from "three";
import { PROPS } from "./props.js";
import {
  ASSETS as STUDIES,
  createAsset as createStudy,
  box,
  cylinder,
  ball,
  beam,
  clayRoof,
  gable,
} from "../workshop/models.js";
export { disposeModel, PALETTE, CELL } from "../workshop/models.js";
const group = () => new THREE.Group();
const colors = new Map();
function color(object, hex, opacity = 1) {
  const key = hex + ":" + opacity;
  if (!colors.has(key))
    colors.set(
      key,
      new THREE.MeshStandardMaterial({
        color: hex,
        roughness: opacity < 1 ? 0.16 : 0.95,
        side: opacity < 1 ? THREE.DoubleSide : THREE.FrontSide,
        flatShading: true,
        transparent: opacity < 1,
        opacity,
        depthWrite: opacity === 1,
      }),
    );
  object.material = colors.get(key);
  if (opacity < 1) object.castShadow = false;
  return object;
}
function block(g, w, h, d, hex, x = 0, y = h / 2, z = 0) {
  return color(box(g, w, h, d, "plaster", x, y, z), hex);
}
function foliage(g, x, y, z, r = 1, hex = "#68883c", scale = [1, 1, 1]) {
  return color(ball(g, r, "leaf", x, y, z, scale, 0), hex);
}
function leaf(g, x, y, z, angle, length = 1, hex = "#68883c") {
  const geo = new THREE.BufferGeometry();
  const w = length * 0.24;
  geo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        0,
        0,
        0,
        -w,
        0,
        length * 0.45,
        0,
        length * 0.16,
        length * 0.5,
        0,
        0,
        0,
        0,
        length * 0.16,
        length * 0.5,
        w,
        0,
        length * 0.45,
        -w,
        0,
        length * 0.45,
        0,
        -length * 0.12,
        length,
        0,
        length * 0.16,
        length * 0.5,
        0,
        length * 0.16,
        length * 0.5,
        0,
        -length * 0.12,
        length,
        w,
        0,
        length * 0.45,
      ],
      3,
    ),
  );
  geo.computeVertexNormals();
  const m = color(new THREE.Mesh(geo), hex);
  m.material.side = THREE.DoubleSide;
  m.position.set(x, y, z);
  m.rotation.y = angle;
  m.castShadow = true;
  g.add(m);
  return m;
}

// Broad banana blades have a curved midrib and tapered sides, not four flat facets.
function bananaLeaf(g, y, angle, length, hex) {
  const points = [],
    indices = [];
  for (let i = 0; i <= 4; i++) {
    const t = i / 4,
      width = Math.sin(Math.PI * t) * length * 0.21;
    const rise = Math.sin(Math.PI * t) * length * 0.22 - t * t * length * 0.26;
    points.push(
      -width,
      rise - width * 0.22,
      t * length,
      0,
      rise,
      t * length,
      width,
      rise - width * 0.22,
      t * length,
    );
    if (i < 4)
      for (let side = 0; side < 2; side++) {
        const a = i * 3 + side;
        indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
      }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(points, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const blade = color(new THREE.Mesh(geometry), hex);
  blade.material.side = THREE.DoubleSide;
  blade.position.y = y;
  blade.rotation.y = angle;
  blade.castShadow = true;
  g.add(blade);
}
function plant(kind, stage = 2) {
  const g = group(),
    s = [0.28, 0.62, 1][stage];
  if (["fern", "bromeliad", "macambira"].includes(kind)) {
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4;
      const f = leaf(
        g,
        0,
        0.12,
        0,
        a,
        (kind === "bromeliad" ? 0.45 : 0.7) * s,
        i % 2 ? "#91a74c" : "#68883c",
      );
      f.rotation.x = -0.35;
      if (kind === "fern")
        for (let j = 1; j < 4; j++)
          for (const side of [-1, 1])
            leaf(
              g,
              Math.sin(a) * j * 0.12,
              0.15 + j * 0.025,
              Math.cos(a) * j * 0.12,
              a + side * 0.85,
              0.2 * s,
              "#68883c",
            );
    }
    if (kind === "bromeliad") {
      cylinder(g, 0.035, 0.035, 0.45, "leaf", 0, 0.225, 0, 5);
      foliage(g, 0, 0.5, 0, 0.12, "#bf633b", [0.5, 1, 0.5]);
    }
    return g;
  }
  if (kind === "lettuce")
    for (let i = 0; i < 7; i++)
      foliage(
        g,
        Math.cos(i) * 0.19 * s,
        0.18 * s,
        Math.sin(i) * 0.19 * s,
        0.25 * s,
        i % 2 ? "#91a74c" : "#68883c",
        [1, 0.7, 1],
      );
  else if (kind === "grass" || kind === "fodder" || kind === "reed")
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4;
      beam(
        g,
        [0, 0, 0],
        [
          Math.sin(a) * 0.4 * s,
          ((kind === "reed" ? 1.1 : 0.5) + (i % 3) * 0.18) * s,
          Math.cos(a) * 0.4 * s,
        ],
        0.045,
        "leafLight",
      );
    }
  else {
    const h =
      ({
        maize: 1.9,
        cassava: 1.5,
        tomato: 1,
        beans: 1.3,
        banana: 2.8,
        reed: 1.4,
        fern: 0.5,
        bromeliad: 0.45,
        macambira: 0.55,
      }[kind] || 0.8) * s;
    cylinder(
      g,
      kind === "banana" ? 0.1 : 0.025,
      kind === "banana" ? 0.18 : 0.04,
      h,
      "leaf",
      0,
      h / 2,
      0,
      6,
    );
    for (let i = 0; i < (kind === "banana" ? 7 : 6); i++) {
      const a = i * 2.4,
        y = h * (kind === "banana" ? 0.75 + (i % 3) * 0.08 : 0.32 + i * 0.105);
      if (kind === "banana")
        bananaLeaf(g, y, a, 1.5 * s, i % 2 ? "#91a74c" : "#68883c");
      else leaf(g, 0, y, 0, a, 0.5 * s, i % 2 ? "#91a74c" : "#68883c");
    }
    if (kind === "tomato" || kind === "beans")
      for (let i = 0; i < 4; i++)
        foliage(
          g,
          Math.sin(i * 2.4) * 0.2 * s,
          (0.3 + i * 0.16) * s,
          Math.cos(i * 2.4) * 0.2 * s,
          0.22 * s,
          i % 2 ? "#91a74c" : "#68883c",
          [1, 0.8, 1],
        );
    if (kind === "beans" && stage === 2)
      for (let i = 0; i < 4; i++)
        cylinder(
          g,
          0.025,
          0.025,
          0.22,
          "leafLight",
          Math.sin(i) * 0.25,
          0.5 + i * 0.12,
          Math.cos(i) * 0.25,
          5,
        );
    if (stage === 2 && kind === "tomato")
      for (let i = 0; i < 5; i++)
        foliage(
          g,
          Math.sin(i * 2.4) * 0.25,
          0.35 + i * 0.1,
          Math.cos(i * 2.4) * 0.25,
          0.09,
          "#c85b38",
        );
    if (stage === 2 && kind === "maize")
      for (const x of [-0.09, 0.09])
        color(cylinder(g, 0.05, 0.07, 0.3, "shirt", x, 1.1, 0, 6), "#d9af4f");
    if (kind === "bromeliad")
      color(cylinder(g, 0.03, 0.08, 0.35, "tile", 0, 0.45, 0, 5), "#c85b38");
  }
  return g;
}
function limb(g, a, b, base, tip, hex = "#936039") {
  const start = new THREE.Vector3(...a),
    end = new THREE.Vector3(...b),
    v = end.clone().sub(start);
  const m = color(
    cylinder(g, tip, base, v.length(), "timber", 0, 0, 0, 7),
    hex,
  );
  m.position.copy(start.add(end).multiplyScalar(0.5));
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize());
  return m;
}
function tree(kind) {
  const g = group();
  if (kind === "jucara") {
    limb(g, [0, 0, 0], [0.12, 4.5, 0], 0.15, 0.095, "#9d9974");
    for (let y = 0.3; y < 4; y += 0.35)
      color(
        cylinder(
          g,
          0.15 - y * 0.01,
          0.15 - y * 0.01,
          0.025,
          "stone",
          y * 0.025,
          y,
          0,
          10,
        ),
        "#bbb391",
      );
    limb(g, [0.1, 3.8, 0], [0.12, 4.65, 0], 0.13, 0.09, "#54834b");
    for (let i = 0; i < 9; i++) {
      const a = (i * Math.PI * 2) / 9,
        len = 1.9 + (i % 2) * 0.2;
      const direction = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      let previous = [0.12, 4.6, 0];
      for (let j = 1; j <= 6; j++) {
        const t = j / 6,
          y = 4.6 + Math.sin(t * Math.PI) * 0.4 - t * 0.55;
        const point = [0.12 + direction.x * t * len, y, direction.z * t * len];
        limb(g, previous, point, 0.025, 0.015, "#526f38");
        previous = point;
        for (const side of [-1, 1]) {
          const f = leaf(
            g,
            ...point,
            a + side * 1.15,
            0.65 * Math.sin(t * Math.PI) + 0.12,
            "#4c7d42",
          );
          f.rotation.x = 0.25;
        }
      }
    }
    for (let i = 0; i < 9; i++)
      foliage(
        g,
        0.12 + Math.sin(i) * 0.19,
        4.05 - (i % 3) * 0.1,
        Math.cos(i) * 0.18,
        0.065,
        "#424d35",
      );
    return g;
  }
  if (kind === "embauba") {
    limb(g, [0, 0, 0], [0, 3.8, 0], 0.2, 0.11, "#b1b19a");
    for (let y = 0.3; y < 3.5; y += 0.4)
      cylinder(g, 0.19 - y * 0.02, 0.19 - y * 0.02, 0.025, "stone", 0, y, 0, 8);
    for (let i = 0; i < 5; i++) {
      const a = i * 2.4,
        x = Math.sin(a) * 1.2,
        z = Math.cos(a) * 1.2,
        y = 3.3 + (i % 3) * 0.38;
      limb(g, [0, 2.3 + i * 0.12, 0], [x, y, z], 0.1, 0.04, "#b1b19a");
      for (let n = 0; n < 3; n++) {
        const c = a + n * 2.1,
          cx = x + Math.sin(c) * 0.3,
          cz = z + Math.cos(c) * 0.3;
        limb(g, [x, y, z], [cx, y + 0.25, cz], 0.025, 0.015, "#a9b48a");
        for (let l = 0; l < 7; l++)
          leaf(
            g,
            cx,
            y + 0.25,
            cz,
            (l * Math.PI * 2) / 7,
            0.48,
            n % 2 ? "#a8b98b" : "#7f9d6c",
          );
      }
    }
    return g;
  }
  if (kind === "mandacaru") {
    cylinder(g, 0.18, 0.25, 2.7, "leaf", 0, 1.35, 0, 8);
    for (const [x, h, y] of [
      [-0.65, 1.0, 1.0],
      [0.65, 1.5, 0.85],
      [0.3, 0.7, 1.7],
    ]) {
      limb(g, [0, y, 0], [x, y + 0.15, 0], 0.14, 0.12, "#638c61");
      cylinder(g, 0.1, 0.13, h, "leaf", x, y + 0.15 + h / 2, 0, 8);
      foliage(g, x, y + 0.15 + h, 0, 0.1, "#68883c", [1, 0.7, 1]);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      limb(
        g,
        [Math.sin(a) * 0.22, 0.1, Math.cos(a) * 0.22],
        [Math.sin(a) * 0.18, 2.6, Math.cos(a) * 0.18],
        0.018,
        0.014,
        "#91a174",
      );
    }
    return g;
  }
  const specs = {
    jequitiba: [6.8, 2.0, "#55773b"],
    pau_brasil: [4.8, 1.6, "#608443"],
    pequi: [3.6, 1.7, "#7f9142"],
    barbatimao: [3.3, 1.4, "#718747"],
    umbuzeiro: [3.5, 2.2, "#77974a"],
    jurema: [3.5, 1.8, "#81926a"],
    orchard: [2.7, 1.0, "#73913f"],
    timber: [5.6, 1.4, "#658543"],
  };
  const [h, r, c] = specs[kind] || specs.orchard;
  const crooked = ["pequi", "barbatimao", "umbuzeiro"].includes(kind),
    fine = kind === "jurema",
    tall = kind === "jequitiba" || kind === "timber";
  const fork = tall ? h * 0.65 : crooked ? h * 0.3 : h * 0.42,
    bark = kind === "pau_brasil" ? "#9a614a" : fine ? "#67513d" : "#8d6846";
  limb(
    g,
    [0, 0, 0],
    [crooked ? 0.22 : 0, fork * 0.5, 0.08],
    tall ? 0.38 : 0.28,
    0.22,
    bark,
  );
  limb(
    g,
    [crooked ? 0.22 : 0, fork * 0.5, 0.08],
    [crooked ? -0.1 : 0, fork, 0],
    0.22,
    0.16,
    bark,
  );
  if (tall)
    for (let i = 0; i < 5; i++) {
      const a = i * 1.256;
      limb(
        g,
        [Math.sin(a) * 0.55, 0.04, Math.cos(a) * 0.55],
        [0, 1, 0],
        0.13,
        0.07,
        bark,
      );
    }
  const count = fine ? 9 : kind === "umbuzeiro" ? 8 : 6;
  for (let i = 0; i < count; i++) {
    const a = i * 2.4,
      x = Math.sin(a) * r * 0.7,
      z = Math.cos(a) * r * 0.7,
      y =
        kind === "umbuzeiro"
          ? h * 0.7 + (i % 2) * 0.12
          : h * 0.72 + (i % 3) * 0.18;
    const elbow = [x * 0.5, fork + (y - fork) * 0.5, z * 0.45];
    limb(g, [0, fork, 0], elbow, 0.13, 0.08, bark);
    limb(g, elbow, [x, y, z], 0.08, 0.035, bark);
    if (fine) {
      for (let j = 0; j < 3; j++) {
        const xx = x + Math.sin(j * 2.1) * 0.35,
          zz = z + Math.cos(j * 2.1) * 0.35;
        limb(g, [x, y - 0.3, z], [xx, y, zz], 0.035, 0.015, bark);
        color(ball(g, 0.44, "leaf", xx, y, zz, [1.15, 0.38, 0.8], 0), c);
      }
    } else
      color(
        ball(
          g,
          r * (kind === "umbuzeiro" ? 0.57 : 0.49),
          "leaf",
          x,
          y,
          z,
          [1, kind === "umbuzeiro" ? 0.58 : 0.85, 1],
          1,
        ),
        i % 3 === 0 ? "#89a354" : c,
      );
  }
  if (kind === "jequitiba")
    color(ball(g, 1.15, "leaf", 0, h - 0.6, 0, [1, 0.65, 1], 1), c);
  if (kind === "orchard" || kind === "pequi")
    for (let i = 0; i < 9; i++)
      foliage(
        g,
        Math.sin(i * 2.4) * r * 0.8,
        h * 0.69 + (i % 3) * 0.12,
        Math.cos(i * 2.4) * r * 0.8,
        0.09,
        kind === "orchard" ? "#d9a343" : "#9ca93e",
      );
  if (kind === "pau_brasil")
    for (let i = 0; i < 10; i++)
      foliage(
        g,
        Math.sin(i) * 1.35,
        h * 0.78 + (i % 2) * 0.2,
        Math.cos(i) * 1.35,
        0.1,
        "#d2b65b",
      );
  return g;
}
function fence(g, w, d, gate = false) {
  for (const x of [-w / 2, w / 2])
    for (const z of [-d / 2, d / 2])
      box(g, 0.13, 0.85, 0.13, "timber", x, 0.425, z);
  for (const y of [0.35, 0.65]) {
    for (const x of [-w / 2, w / 2])
      box(g, 0.08, 0.09, d, "timberLight", x, y, 0);
    box(g, w, 0.09, 0.08, "timberLight", 0, y, -d / 2);
    if (!gate) box(g, w, 0.09, 0.08, "timberLight", 0, y, d / 2);
  }
}
function bed(g, w = 3.5, d = 3.5) {
  block(g, w, 0.09, d, "#936b43", 0, 0.045);
  for (const x of [-w / 2, w / 2])
    box(g, 0.1, 0.18, d, "timberLight", x, 0.09, 0);
  for (const z of [-d / 2, d / 2])
    box(g, w, 0.18, 0.1, "timberLight", 0, 0.09, z);
}
function planted(g, kind, w = 3, d = 3, stage = 2) {
  for (let x = -w / 2 + 0.35; x < w / 2; x += 0.7)
    for (let z = -d / 2 + 0.35; z < d / 2; z += 0.7) {
      const p = plant(kind, stage);
      p.position.set(x, 0.1, z);
      g.add(p);
    }
}
function table(g, x = 0, z = 0, w = 1.6) {
  box(g, w, 0.16, 0.85, "timberLight", x, 0.9, z);
  for (const a of [-1, 1])
    for (const b of [-1, 1])
      box(
        g,
        0.12,
        0.85,
        0.12,
        "timber",
        x + a * (w / 2 - 0.12),
        0.425,
        z + b * 0.3,
      );
}
function panel(g, x = 0, z = 0) {
  const p = group();
  p.name = "solar-panel";
  p.position.set(x, 1.2, z);
  p.rotation.x = -0.38;
  g.add(p);
  block(p, 1.65, 0.1, 2, "#d1d3c3", 0, 0);
  block(p, 1.5, 0.03, 1.85, "#365c73", 0, 0.07);
  for (let i = -2; i <= 2; i++)
    block(p, 0.015, 0.012, 1.85, "#8aafa9", i * 0.25, 0.09);
  for (let i = -2; i <= 2; i++)
    block(p, 1.5, 0.012, 0.015, "#8aafa9", 0, 0.09, i * 0.3);
  for (const dx of [-0.65, 0.65])
    box(g, 0.1, 1.15, 0.1, "teal", x + dx, 0.575, z);
}
function doorway(g, x, z, adobe = false) {
  const shape = new THREE.Shape();
  shape.moveTo(-0.49, 0);
  shape.lineTo(0.49, 0);
  shape.lineTo(0.49, 1.55);
  shape.absarc(0, 1.55, 0.49, 0, Math.PI, false);
  shape.lineTo(-0.49, 0);
  const surround = color(
    new THREE.Mesh(
      new THREE.ExtrudeGeometry(shape, { depth: 0.13, bevelEnabled: false }),
    ),
    adobe ? "#cca67a" : "#b4834e",
  );
  surround.position.set(x, 0, z);
  surround.castShadow = true;
  g.add(surround);
  const door = surround.clone();
  door.geometry = surround.geometry.clone();
  door.material = surround.material;
  door.scale.set(0.8, 0.94, 1);
  door.position.set(x, 0.025, z + 0.1);
  color(door, "#397c72");
  g.add(door);
  box(g, 0.78, 0.08, 0.06, "timberLight", x, 0.45, z + 0.25);
  foliage(g, x + 0.27, 1, z + 0.27, 0.035, "#c6a45d");
  box(g, 1.15, 0.1, 0.35, "stone", x, 0.05, z + 0.14);
}
function framedWindow(g, x, y, z, rotation = 0) {
  const w = group();
  w.position.set(x, y, z);
  w.rotation.y = rotation;
  g.add(w);
  box(w, 0.88, 0.95, 0.1, "timberLight");
  box(w, 0.68, 0.74, 0.11, "glass", 0, 0, 0.06);
  for (const side of [-1, 1]) {
    box(w, 0.24, 0.85, 0.1, "teal", side * 0.53, 0, 0.08);
    box(w, 0.25, 0.07, 0.04, "timberLight", side * 0.53, -0.22, 0.15);
  }
  box(w, 0.06, 0.74, 0.06, "timberLight", 0, 0, 0.15);
  box(w, 0.7, 0.06, 0.06, "timberLight", 0, 0, 0.15);
  box(w, 1.3, 0.12, 0.26, "timberLight", 0, -0.5, 0.08);
}
function cabin(kind) {
  const g = group(),
    adobe = kind.startsWith("adobe"),
    veranda = kind.includes("veranda"),
    terrace = kind.includes("courtyard");
  const recessed = veranda || terrace,
    depth = recessed ? 2.55 : 3.35,
    center = recessed ? -0.4 : 0,
    front = center + depth / 2;
  block(g, 3.4, 2.4, depth, adobe ? "#bd9069" : "#e8d8ab", 0, 1.2, center);
  const gab = gable(g, 3.4, depth, 2.4, 1.0);
  gab.position.z += center;
  color(gab, adobe ? "#bd9069" : "#e8d8ab");
  clayRoof(g, {
    half: 1.95,
    depth: 3.9,
    eave: 2.4,
    rise: 1.05,
    ridgeHeight: 3.7,
  });
  doorway(g, -0.65, front + 0.01, adobe);
  framedWindow(g, 0.85, 1.4, front + 0.04);
  framedWindow(g, 1.72, 1.4, -0.35, Math.PI / 2);
  framedWindow(g, -1.72, 1.4, -0.35, -Math.PI / 2);
  framedWindow(g, 0, 1.4, center - depth / 2 - 0.03, Math.PI);
  for (const x of [-1.67, 1.67])
    for (const z of [center - depth / 2, front]) {
      if (adobe) {
        for (let y = 0.2; y < 2.4; y += 0.38)
          block(g, 0.28, 0.16, 0.08, "#a77350", x, y, z + 0.045);
      } else box(g, 0.1, 2.4, 0.1, "plaster", x, 1.2, z);
    }
  // All porch architecture lives inside the same four-metre square.
  if (recessed) {
    box(g, 3.4, 0.1, 0.95, "earth", 0, 0.05, 1.35);
    if (veranda) {
      for (const x of [-1.52, 1.52]) {
        box(g, 0.16, 2.4, 0.16, "timber", x, 1.2, 1.68);
        beam(
          g,
          [x, 1.9, 1.68],
          [x - Math.sign(x) * 0.4, 2.34, 1.68],
          0.1,
          "timberLight",
        );
      }
      box(g, 3.25, 0.15, 0.15, "timber", 0, 2.32, 1.68);
    } else {
      box(g, 0.12, 0.55, 0.9, "plaster", 1.6, 0.275, 1.35);
      box(g, 0.22, 0.08, 1, "tile", 1.6, 0.59, 1.35);
    }
  }
  for (let i = 0; i < 3; i++)
    box(
      g,
      0.5 - i * 0.1,
      0.055,
      0.06,
      "teal",
      0,
      2.73 + i * 0.12,
      front + 0.05,
    );
  cylinder(g, 0.2, 0.14, 0.32, "tile", 1.28, 0.16, recessed ? 1.5 : 1.76, 7);
  const p = plant("bromeliad");
  p.scale.setScalar(0.55);
  p.position.set(1.28, 0.32, recessed ? 1.5 : 1.76);
  g.add(p);
  return g;
}
function goat() {
  const g = group();
  const coat = "#d8c6a3",
    dark = "#695744";
  color(ball(g, 0.48, "plaster", 0, 0.67, 0, [1.25, 0.65, 0.5], 1), coat);
  color(ball(g, 0.25, "plaster", 0.35, 0.8, 0, [0.65, 1.25, 0.78], 1), coat);
  color(ball(g, 0.21, "plaster", 0.52, 1.04, 0, [1, 0.95, 0.68], 1), coat);
  color(
    ball(g, 0.13, "plaster", 0.7, 0.97, 0, [1.05, 0.62, 0.8], 1),
    "#bea984",
  );
  for (const x of [-0.33, 0.31])
    for (const z of [-0.18, 0.18]) {
      beam(
        g,
        [x, 0.65, z],
        [x + (x < 0 ? -0.025 : 0.03), 0.32, z],
        0.075,
        "plaster",
      );
      beam(
        g,
        [x + (x < 0 ? -0.025 : 0.03), 0.32, z],
        [x, 0.08, z],
        0.055,
        "plaster",
      );
      block(g, 0.1, 0.09, 0.085, dark, x, 0.045, z);
    }
  for (const sign of [-1, 1]) {
    const ear = color(
      ball(g, 0.12, "plaster", 0.44, 1.06, sign * 0.22, [1.05, 0.32, 1.5], 0),
      coat,
    );
    ear.rotation.x = sign * 0.2;
    foliage(g, 0.63, 1.08, sign * 0.12, 0.021, "#302b26");
    beam(
      g,
      [0.45, 1.17, sign * 0.09],
      [0.39, 1.32, sign * 0.1],
      0.045,
      "stone",
    );
    beam(
      g,
      [0.39, 1.32, sign * 0.1],
      [0.27, 1.37, sign * 0.11],
      0.025,
      "stone",
    );
  }
  color(ball(g, 0.07, "plaster", 0.62, 0.84, 0, [0.6, 1.5, 0.5], 0), dark);
  beam(g, [-0.52, 0.76, 0], [-0.64, 0.91, 0], 0.07, "plaster");
  return g;
}
function chicken(variant = 0) {
  const g = group(),
    c = ["#eadfc1", "#c89a49", "#946143"][variant];
  foliage(g, 0, 0.29, 0, 0.25, c, [0.8, 1, 1.15]);
  foliage(g, 0, 0.52, 0.18, 0.12, c);
  foliage(g, 0, 0.65, 0.18, 0.06, "#bb4f38", [0.7, 1, 1]);
  for (const x of [-0.09, 0.09]) foliage(g, x, 0.55, 0.23, 0.018, "#3a2a23");
  foliage(g, 0, 0.39, -0.23, 0.16, c, [0.6, 1.2, 0.65]);
  block(g, 0.08, 0.06, 0.14, "#d6a34b", 0, 0.5, 0.3);
  for (const x of [-0.09, 0.09])
    beam(g, [x, 0.02, 0], [x, 0.19, 0], 0.025, "earth");
  return g;
}
function building(id) {
  const g = group();
  if (id === "greenhouse") {
    for (const x of [-1.7, 1.7])
      for (const z of [-1.7, 0, 1.7]) {
        box(g, 0.1, 2.45, 0.1, "timberLight", x, 1.225, z);
        beam(g, [x, 2.45, z], [0, 3.5, z], 0.1, "timberLight");
      }
    for (const x of [-1.7, 1.7])
      for (const y of [0.2, 1.2, 2.4])
        box(g, 0.1, 0.09, 3.4, "timberLight", x, y, 0);
    for (const x of [-0.5, 0.5])
      box(g, 0.11, 2.15, 0.1, "timberLight", x, 1.075, 1.7);
    box(g, 1.1, 0.1, 0.1, "timberLight", 0, 2.15, 1.7);
    color(box(g, 0.9, 2, 0.03, "glass", 0, 1.05, 1.7), "#69aab5", 0.35);
    for (const z of [-1.7, 1.7]) {
      for (const x of [-1.1, 1.1])
        color(box(g, 1.1, 2.3, 0.025, "glass", x, 1.2, z), "#69aab5", 0.35);
      if (z < 0)
        color(box(g, 1.1, 2.3, 0.025, "glass", 0, 1.2, z), "#69aab5", 0.35);
      const triangle = gable(g, 3.4, 0.018, 2.45, 1.05);
      triangle.position.z = z;
      color(triangle, "#83bdc9", 0.36);
    }
    for (const x of [-1.71, 1.71])
      for (const z of [-0.8, 0.8]) {
        const reflection = color(
          box(g, 0.012, 0.65, 0.045, "plaster", x, 1.65, z),
          "#d7eeeb",
          0.75,
        );
        reflection.rotation.x = 0.45;
      }
    for (const x of [-1.05, 1.05]) {
      block(g, 0.8, 0.15, 3, "#936b43", x, 0.075);
      for (const side of [-1, 1])
        box(g, 0.06, 0.2, 3, "timberLight", x + side * 0.4, 0.1, 0);
    }
    beam(g, [0, 3.5, -1.7], [0, 3.5, 1.7], 0.12, "timberLight");
    for (const x of [-1.7, 1.7])
      color(box(g, 0.025, 2.3, 3.4, "glass", x, 1.2, 0), "#69aab5", 0.35);
    for (const sign of [-1, 1]) {
      const p = color(
        box(g, 2, 0.03, 3.4, "glass", sign * 0.85, 2.975, 0),
        "#83bdc9",
        0.36,
      );
      p.rotation.z = -sign * Math.atan2(1.05, 1.7);
    }
    for (const x of [-1.05, 1.05])
      for (const z of [-1.1, -0.3, 0.5, 1.2]) {
        const p = plant("tomato");
        p.position.set(x, 0.06, z);
        g.add(p);
      }
    return g;
  }
  if (id === "garden") {
    bed(g);
    planted(g, "lettuce");
    return g;
  }
  if (id === "grove" || id === "banana_treatment") {
    if (id === "banana_treatment") bed(g, 3.5, 3.5);
    for (const [x, z] of [
      [-0.8, 0.6],
      [0.8, -0.6],
    ]) {
      const p = plant("banana");
      p.position.set(x, 0, z);
      g.add(p);
    }
    if (id === "banana_treatment")
      cylinder(g, 0.1, 0.1, 0.4, "teal", 1.5, 0.2, 1.5);
    return g;
  }
  if (id === "orchard") {
    for (const x of [-1.1, 1.1]) {
      const t = tree("orchard");
      t.position.x = x;
      g.add(t);
    }
    return g;
  }
  if (id === "well") {
    color(cylinder(g, 1.73, 1.73, 1.2, "plaster", 0, 0.6, 0, 24), "#e9e3cf");
    color(cylinder(g, 0.18, 1.78, 0.38, "plaster", 0, 1.39, 0, 24), "#eee8d7");
    for (let i = 0; i < 18; i++) {
      const a = (i * Math.PI) / 9;
      beam(
        g,
        [Math.sin(a) * 1.735, 0.05, Math.cos(a) * 1.735],
        [Math.sin(a) * 1.735, 1.16, Math.cos(a) * 1.735],
        0.018,
        "stone",
      );
    }
    color(
      cylinder(g, 1.745, 1.745, 0.045, "plaster", 0, 0.6, 0, 24),
      "#d1caba",
    );
    cylinder(g, 0.28, 0.28, 0.06, "teal", 0.55, 1.48, 0.4, 12);
    box(g, 0.22, 0.06, 0.06, "timber", 0.55, 1.54, 0.4);
    beam(g, [-1.7, 1.2, -0.3], [-1.88, 1.2, -0.3], 0.11, "teal");
    beam(g, [-1.88, 0.15, -0.3], [-1.88, 1.65, -0.3], 0.11, "teal");
    cylinder(g, 0.085, 0.1, 0.8, "teal", 1.6, 0.4, 0.9, 8);
    beam(g, [1.6, 0.75, 0.9], [1.95, 0.75, 0.9], 0.065, "teal");
    beam(g, [1.6, 0.85, 0.9], [1.4, 1.05, 0.9], 0.06, "timber");
    box(g, 0.45, 0.14, 0.4, "stone", 1.6, 0.07, 1.35);
    return g;
  }
  if (id === "solar_farm") {
    for (const z of [-0.95, 0.95]) {
      for (const x of [-1.85, 0, 1.85]) {
        const rack = group();
        panel(rack);
        rack.scale.z = 0.82;
        rack.position.set(x, 0, z);
        g.add(rack);
        for (const side of [-0.65, 0.65])
          beam(
            g,
            [x + side, 0.1, z - 0.6],
            [x + side, 1.38, z + 0.6],
            0.07,
            "teal",
          );
      }
      for (const offset of [-0.55, 0.55])
        box(g, 5.45, 0.1, 0.09, "stone", 0, 0.78, z + offset);
    }
    block(g, 0.4, 0.6, 0.2, "#397c72", 2.68, 0.3, 0);
    for (const z of [-0.9, 0.9])
      beam(g, [2.5, 0.2, z], [2.5, 0.2, 0], 0.035, "hair");
    return g;
  }
  if (id === "streetlight") {
    cylinder(g, 0.055, 0.11, 3.5, "teal", 0, 1.75, 0, 8);
    beam(g, [0, 3.4, 0], [0.55, 3.4, 0], 0.1, "teal");
    block(g, 0.42, 0.18, 0.42, "#f5d68b", 0.55, 3.25);
    box(g, 0.55, 0.08, 0.55, "teal", 0.55, 3.4, 0);
    return g;
  }
  if (id === "compost") {
    for (const x of [-1.85, 0, 1.85]) {
      const bin = group();
      bin.position.x = x;
      bin.name = "compost-bin";
      g.add(bin);
      for (const side of [-0.82, 0.82])
        for (const z of [-0.78, 0.78])
          box(bin, 0.12, 1.1, 0.12, "timber", side, 0.55, z);
      for (let y = 0.13; y < 1.1; y += 0.22) {
        for (const side of [-0.82, 0.82])
          box(bin, 0.1, 0.15, 1.6, "timberLight", side, y, 0);
        box(bin, 1.64, 0.15, 0.1, "timberLight", 0, y, -0.78);
        if (y < 0.7) box(bin, 1.64, 0.15, 0.1, "timberLight", 0, y, 0.78);
      }
      foliage(
        bin,
        0,
        0.28,
        0,
        0.75,
        x < 0 ? "#7e873d" : x === 0 ? "#98774c" : "#594a36",
        [1, 0.48, 0.95],
      );
      for (let i = 0; i < 7; i++)
        foliage(
          bin,
          Math.sin(i) * 0.45,
          0.45,
          Math.cos(i) * 0.45,
          0.13,
          x < 0 ? "#8fa44e" : x === 0 ? "#af8c55" : "#66533a",
          [1, 0.35, 1],
        );
    }
    return g;
  }
  if (id === "square") {
    const mosaic = color(
      cylinder(g, 0.65, 0.65, 0.035, "earth", 0, 0.018, 0, 16),
      "#d5b684",
    );
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      const tile = box(
        g,
        0.19,
        0.035,
        0.19,
        i % 2 ? "tile" : "teal",
        Math.sin(a) * 0.48,
        0.045,
        Math.cos(a) * 0.48,
      );
      tile.rotation.y = a;
    }
    for (const [x, z, angle] of [
      [0, -1.35, 0],
      [-1.35, 0.2, Math.PI / 2],
      [1.35, 0.2, -Math.PI / 2],
    ]) {
      const bench = group();
      bench.position.set(x, 0, z);
      bench.rotation.y = angle;
      g.add(bench);
      for (const zz of [-0.16, 0, 0.16])
        box(bench, 1.65, 0.09, 0.13, "timberLight", 0, 0.48, zz);
      for (const y of [0.76, 0.94])
        box(bench, 1.65, 0.14, 0.07, "timberLight", 0, y, -0.24);
      for (const xx of [-0.65, 0.65]) {
        box(bench, 0.12, 0.96, 0.12, "timber", xx, 0.48, -0.23);
        box(bench, 0.12, 0.43, 0.12, "timber", xx, 0.215, 0.2);
      }
    }
    for (const x of [-1.45, 1.45]) {
      cylinder(g, 0.25, 0.2, 0.35, "tile", x, 0.175, 1.45, 8);
      const p = plant("bromeliad");
      p.position.set(x, 0.35, 1.45);
      g.add(p);
    }
    for (const x of [-0.45, 0.45])
      box(g, 0.09, 1.4, 0.09, "timber", x, 0.7, 1.6);
    box(g, 1.1, 0.6, 0.12, "timberLight", 0, 1.16, 1.6);
    for (const x of [-0.28, 0, 0.28])
      block(g, 0.2, 0.32, 0.025, "#ece1ba", x, 1.16, 1.68);
    return g;
  }
  if (id === "apiary") {
    for (const x of [-0.65, 0.65]) {
      box(g, 0.1, 0.7, 0.1, "timber", x, 0.35, 0);
      box(g, 0.65, 0.55, 0.55, "timberLight", x, 0.95, 0);
      box(g, 0.8, 0.1, 0.7, "tile", x, 1.27, 0);
      block(g, 0.1, 0.08, 0.025, "#3a2a23", x, 0.95, 0.285);
    }
    return g;
  }
  if (id === "goat_pasture" || id === "goat-pasture-empty") {
    fence(g, 5.5, 3.5, true);
    const shelter = createStudy("shed");
    shelter.scale.setScalar(0.55);
    shelter.position.set(-1.25, 0, -0.8);
    g.add(shelter);
    if (id === "goat_pasture") {
      for (const x of [-0.8, 1.2]) {
        const a = goat();
        a.position.set(x, 0, 0.8);
        g.add(a);
      }
    }
    return g;
  }
  if (id === "wetland") {
    bed(g);
    block(g, 3.3, 0.025, 3.3, "#6c9384", 0, 0.11);
    planted(g, "reed");
    return g;
  }
  if (id === "biodigester") {
    const dome = color(
      new THREE.Mesh(
        new THREE.SphereGeometry(1.3, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2),
      ),
      "#6d9270",
    );
    dome.scale.y = 0.7;
    dome.castShadow = true;
    g.add(dome);
    cylinder(g, 0.3, 0.3, 0.3, "teal", 0, 1.2, 0);
    for (const x of [-1.4, 1.4]) {
      beam(g, [x, 0.35, 0], [x, 0.35, 1], 0.12, "teal");
      cylinder(g, 0.35, 0.35, 0.5, "stone", x, 0.25, 1);
    }
    return g;
  }
  if (id === "hydro") {
    for (const x of [-1.15, 1.15])
      for (const z of [-0.9, 0.9]) {
        box(g, 0.32, 0.65, 0.32, "stone", x, 0.325, z);
        box(g, 0.14, 0.65, 0.14, "timber", x, 0.85, z);
      }
    for (let i = 0; i < 8; i++)
      box(g, 2.6, 0.12, 0.24, "timberLight", 0, 0.7, -0.87 + i * 0.25);
    const wheel = group();
    wheel.position.set(0, 1.05, 1.2);
    wheel.name = "waterwheel";
    g.add(wheel);
    for (const z of [-0.23, 0.23]) {
      const rim = color(
        new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.06, 5, 16)),
        "#936039",
      );
      rim.position.z = z;
      rim.castShadow = true;
      wheel.add(rim);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        beam(
          wheel,
          [0, 0, z],
          [Math.cos(a) * 0.82, Math.sin(a) * 0.82, z],
          0.065,
          "timberLight",
        );
      }
    }
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      const paddle = box(
        wheel,
        0.18,
        0.3,
        0.58,
        "timberLight",
        Math.cos(a) * 0.84,
        Math.sin(a) * 0.84,
        0,
      );
      paddle.rotation.z = a;
    }
    const axle = cylinder(g, 0.1, 0.1, 2.2, "stone", 0, 1.05, 0.4, 10);
    axle.rotation.x = Math.PI / 2;
    const motor = cylinder(g, 0.28, 0.28, 0.7, "teal", 0, 1.09, -0.55, 12);
    motor.rotation.x = Math.PI / 2;
    for (const z of [-0.8, -0.65, -0.5, -0.35]) {
      const rib = cylinder(g, 0.3, 0.3, 0.045, "teal", 0, 1.09, z, 12);
      rib.rotation.x = Math.PI / 2;
    }
    block(g, 0.42, 0.6, 0.25, "#397c72", 0.85, 1.03, -0.55);
    block(g, 0.24, 0.19, 0.02, "#dbd1a1", 0.85, 1.16, -0.41);
    beam(g, [0.2, 0.86, -0.4], [0.65, 0.86, -0.4], 0.055, "hair");
    for (const x of [-1.15, 1.15]) {
      box(g, 0.1, 1.1, 0.1, "timber", x, 1.24, -0.9);
      beam(g, [x, 1.75, -0.9], [x, 1.35, 0], 0.07, "timber");
    }
    box(g, 2.5, 0.08, 0.1, "timberLight", 0, 1.8, -0.9);
    return g;
  }
  if (id === "eco_toilet") {
    block(g, 1.5, 2.35, 1.5, "#dfc99b");
    gable(g, 1.5, 1.5, 2.35, 0.36);
    block(g, 0.75, 1.9, 0.08, "#397c72", 0, 0.95, 0.79);
    clayRoof(g, {
      half: 0.95,
      depth: 1.9,
      eave: 2.35,
      rise: 0.45,
      ridgeHeight: 3.05,
    });
    cylinder(g, 0.07, 0.07, 3, "teal", 0.82, 1.5, -0.5);
    return g;
  }
  if (id === "coop") {
    for (const x of [-0.65, 0.65])
      for (const z of [-0.55, 0.55])
        box(g, 0.12, 0.65, 0.12, "timber", x, 0.325, z);
    block(g, 1.5, 1.2, 1.4, "#d5bc85", 0, 1.15);
    gable(g, 1.5, 1.4, 1.75, 0.36);
    block(g, 0.45, 0.6, 0.06, "#397c72", 0, 1, 0.73);
    clayRoof(g, {
      half: 0.95,
      depth: 1.8,
      eave: 1.8,
      rise: 0.45,
      ridgeHeight: 2.5,
    });
    const ramp = box(g, 0.5, 0.06, 1.2, "timberLight", 0, 0.38, 1.2);
    ramp.rotation.x = 0.55;
    return g;
  }
  if (id === "workshop") {
    block(g, 3.4, 2.2, 2.8, "#bd965c");
    box(g, 1.85, 1.92, 0.06, "hair", -0.25, 0.96, 1.43);
    for (const x of [-1.45, 0.95]) {
      box(g, 0.65, 1.95, 0.12, "teal", x, 0.98, 1.5);
      for (const y of [0.3, 1.5])
        box(g, 0.7, 0.1, 0.04, "timberLight", x, y, 1.59);
    }
    gable(g, 3.4, 2.8, 2.2, 0.7);
    clayRoof(g, {
      half: 1.9,
      depth: 3.2,
      eave: 2.2,
      rise: 0.8,
      ridgeHeight: 3.25,
    });
    table(g, -0.2, 1.15, 1.7);
    box(g, 0.6, 0.08, 0.14, "stone", -0.1, 1.02, 1.28);
    box(g, 0.12, 0.12, 0.22, "timber", 0.26, 1.03, 1.28);
    framedWindow(g, 1.73, 1.3, -0.3, Math.PI / 2);
    for (let i = 0; i < 4; i++)
      box(
        g,
        0.15,
        1.45 + i * 0.1,
        0.12,
        "timberLight",
        -1.5 + i * 0.18,
        0.75,
        -1.5,
      );
    box(g, 0.9, 0.3, 0.1, "timber", 0, 2.02, 1.5);
    box(g, 0.4, 0.06, 0.06, "stone", 0, 2.02, 1.57);
    return g;
  }
  if (id === "kitchen") {
    block(g, 3.25, 1.0, 0.3, "#d8bd90", 0, 0.5, -1.45);
    block(g, 0.25, 2.3, 2.9, "#e8d8ab", -1.55, 1.15, 0);
    for (const x of [-1.45, 1.45])
      box(g, 0.15, 2.3, 0.15, "timber", x, 1.15, 1.35);
    clayRoof(g, {
      half: 1.8,
      depth: 3.2,
      eave: 2.3,
      rise: 0.65,
      ridgeHeight: 3.2,
    });
    block(g, 1.2, 0.85, 1.2, "#bc815c", -0.85, 0.425, -0.3);
    color(ball(g, 0.65, "tile", -0.85, 1.02, -0.3, [1, 0.85, 1], 1), "#ba704c");
    box(g, 0.5, 0.35, 0.05, "hair", -0.85, 0.94, 0.31);
    block(g, 0.36, 3.1, 0.36, "#b57551", -1.05, 2.4, -0.8);
    box(g, 0.48, 0.12, 0.48, "tile", -1.05, 4.0, -0.8);
    block(g, 1.4, 0.9, 0.75, "#e8d8ab", 0.7, 0.45, -0.9);
    box(g, 1.5, 0.12, 0.85, "stone", 0.7, 0.95, -0.9);
    block(g, 0.45, 0.025, 0.4, "#397c72", 0.6, 1.02, -0.9);
    beam(g, [0.6, 1.02, -1.2], [0.6, 1.3, -1.2], 0.045, "stone");
    cylinder(g, 0.18, 0.14, 0.2, "tile", 1.1, 1.13, -0.9);
    table(g, 0.45, 1.1, 1.9);
    cylinder(g, 0.23, 0.16, 0.1, "plaster", 0.3, 1.03, 1.12);
    return g;
  }
  if (id === "warehouse") {
    for (const x of [-1.7, 1.7]) {
      box(g, 0.15, 2.25, 3.2, "timberLight", x, 1.125, 0);
      for (const z of [-1.55, 1.55])
        box(g, 0.2, 2.3, 0.2, "timber", x, 1.15, z);
    }
    box(g, 3.4, 2.25, 0.12, "timberLight", 0, 1.125, -1.55);
    gable(g, 3.4, 3.2, 2.25, 0.7);
    clayRoof(g, {
      half: 1.9,
      depth: 3.6,
      eave: 2.25,
      rise: 0.8,
      ridgeHeight: 3.3,
    });
    for (const x of [-1, 0.1, 1]) {
      box(g, 0.7, 0.6, 0.65, "timberLight", x, 0.3, -0.65);
      box(g, 0.5, 0.5, 0.5, "earth", x, 0.85, -0.65);
    }
    for (const x of [-1.3, 1.3]) box(g, 0.65, 2.1, 0.12, "teal", x, 1.05, 1.65);
  }
  return g;
}
function supply(id) {
  const g = group();
  if (id === 0) {
    const t = tree("timber");
    t.position.set(-1, 0, -0.9);
    g.add(t);
    for (let i = 0; i < 5; i++) {
      const m = cylinder(
        g,
        0.17,
        0.17,
        1.8,
        "timberLight",
        (i % 3) * 0.4 - 0.4,
        0.18 + Math.floor(i / 3) * 0.32,
        0.6,
        7,
      );
      m.rotation.z = Math.PI / 2;
    }
    table(g, 1, 0.1, 1);
    box(g, 0.8, 0.08, 0.17, "stone", 1, 1.01, 0.1);
    box(g, 0.16, 0.12, 0.24, "timber", 1.43, 1.01, 0.1);
    for (let i = 0; i < 7; i++)
      box(g, 0.04, 0.06, 0.025, "stone", 0.65 + i * 0.1, 0.99, 0.2);
  }
  if (id === 1)
    for (let i = 0; i < 9; i++) {
      const x = Math.sin(i * 2.4) * 0.6,
        z = Math.cos(i * 2.4) * 0.6,
        h = 2.5 + (i % 3) * 0.35;
      cylinder(g, 0.055, 0.07, h, "leaf", x, h / 2, z, 6);
      for (let y = 0.4; y < h; y += 0.5)
        cylinder(g, 0.08, 0.08, 0.035, "leafLight", x, y, z, 6);
      leaf(g, x, h - 0.2, z, i, 0.65);
    }
  if (id === 2) {
    foliage(g, 0, 0.35, 0, 1, "#b57d50", [1, 0.4, 0.8]);
    for (let i = 0; i < 5; i++)
      block(
        g,
        0.5,
        0.15,
        0.25,
        "#ba865b",
        (i % 2) * 0.55 - 0.5,
        0.075 + Math.floor(i / 2) * 0.15,
        0.8,
      );
  }
  if (id === 3)
    for (let i = 0; i < 5; i++)
      foliage(
        g,
        Math.sin(i) * 0.65,
        0.31 + (i % 2) * 0.18,
        Math.cos(i) * 0.6,
        0.5,
        "#a4a38f",
        [1, 0.7, 1],
      );
  if (id === 4) {
    block(g, 0.8, 1.8, 0.12, "#397c72", -0.5, 0.9, -0.4);
    for (const y of [0.5, 1.3]) {
      block(g, 0.58, 0.5, 0.03, "#30695e", -0.5, y, -0.32);
    }
    foliage(g, -0.19, 0.9, -0.3, 0.035, "#d2b16b");
    for (const x of [0.05, 0.65])
      box(g, 0.07, 1.05, 0.07, "plaster", x, 1.15, -0.35);
    for (const y of [0.65, 1.15, 1.65])
      box(g, 0.67, 0.07, 0.07, "plaster", 0.35, y, -0.35);
    block(g, 0.5, 0.85, 0.02, "#73918a", 0.35, 1.15, -0.38);
    for (let row = 0; row < 4; row++)
      for (let col = 0; col < 3; col++) {
        const tile = color(
          new THREE.Mesh(
            new THREE.CylinderGeometry(
              0.14,
              0.14,
              0.6,
              6,
              1,
              true,
              -Math.PI / 2,
              Math.PI,
            ),
          ),
          "#b95532",
        );
        tile.rotation.x = -Math.PI / 2;
        tile.position.set(-0.25 + col * 0.24, 0.13 + row * 0.09, 0.5);
        tile.material.side = THREE.DoubleSide;
        tile.castShadow = true;
        g.add(tile);
      }
    box(g, 0.6, 0.5, 0.6, "timberLight", 0.7, 0.25, 0);
    for (const y of [0.12, 0.35])
      box(g, 0.64, 0.045, 0.64, "timber", 0.7, y, 0);
  }
  if (id === 5) {
    table(g, 0, 0, 2);
    box(g, 0.6, 0.5, 0.55, "timberLight", 0.4, 1.23, 0);
    for (const y of [1.05, 1.4]) box(g, 0.64, 0.04, 0.59, "timber", 0.4, y, 0);
    const solar = group();
    panel(solar);
    solar.scale.setScalar(0.33);
    solar.position.set(-0.5, 0.98, 0);
    g.add(solar);
    box(g, 0.4, 0.05, 0.07, "stone", 0, 1.02, 0.3);
    box(g, 0.12, 0.06, 0.12, "timber", 0.23, 1.02, 0.3);
  }
  if (id === 6) {
    block(g, 0.65, 0.65, 0.4, "#48665b");
    for (const x of [-0.2, 0.2]) block(g, 0.1, 0.1, 0.1, "#b7a979", x, 0.7);
    block(g, 0.3, 0.22, 0.015, "#d5bc85", 0, 0.4, 0.21);
  }
  return g;
}
function detail(i) {
  const g = group();
  if (i < 4) {
    for (let n = 0; n < 4; n++) {
      const p = plant(["fern", "bromeliad", "fern", "grass"][i]);
      p.position.set(Math.sin(n) * 0.35, 0, Math.cos(n) * 0.35);
      g.add(p);
      if (i === 2)
        foliage(
          g,
          Math.sin(n) * 0.35,
          0.45,
          Math.cos(n) * 0.35,
          0.06,
          "#e4c778",
        );
    }
  } else if (i === 5) {
    for (let n = 0; n < 5; n++) {
      const x = Math.sin(n) * 0.35,
        z = Math.cos(n) * 0.35,
        h = 0.3 + n * 0.08;
      const crystal = color(
        cylinder(g, 0.07, 0.15, h, "stone", x, h / 2, z, 5),
        "#ded8bd",
      );
      const tip = color(
        new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.16, 5)),
        "#eee6cb",
      );
      tip.position.set(x, h + 0.08, z);
      tip.castShadow = true;
      g.add(tip);
    }
  } else if (i === 6) {
    for (let n = 0; n < 5; n++)
      foliage(
        g,
        Math.sin(n) * 0.4,
        0.08 + (n % 2) * 0.1,
        Math.cos(n) * 0.35,
        0.4,
        n % 2 ? "#ad7653" : "#bd956b",
        [1, 0.3, 0.8],
      );
  } else
    for (let n = 0; n < 4; n++) {
      const x = Math.sin(n) * 0.45,
        z = Math.cos(n) * 0.45;
      color(
        ball(
          g,
          0.34,
          "stone",
          x,
          0.18,
          z,
          [1, i === 7 ? 0.5 : 0.9, 1],
          i === 7 ? 1 : 0,
        ),
        i === 7 ? "#929b82" : "#93988d",
      );
      if (i === 7) foliage(g, x, 0.3, z, 0.18, "#71854d", [1, 0.12, 1]);
    }
  if (i === 3)
    g.traverse((o) => {
      if (o.isMesh) color(o, "#b39f64");
    });
  return g;
}
export const ASSETS = STUDIES.map((a) => ({
  ...a,
  category: {
    house: "Homes",
    shed: "Buildings",
    tree: "Vegetation",
    road: "Terrain",
    resident: "Residents",
  }[a.id],
  legacy: [],
}));
function add(id, name, category, footprint, build, legacy = []) {
  ASSETS.push({
    id,
    name,
    category,
    type: category,
    footprint,
    build,
    revision: 1,
    description: `${name} · hand-built low-poly 3D study in the shared warm clay, timber and foliage palette.`,
    legacy,
  });
}
const names = {
  orchard: "Fruit orchard",
  goat_pasture: "Goat pasture",
  apiary: "Stingless bee apiary",
  hydro: "River generator",
  eco_toilet: "Ecological toilet",
  banana_treatment: "Banana treatment bed",
  wetland: "Reed bed",
  biodigester: "Biodigester",
  warehouse: "Storage house",
  solar_farm: "Solar farm",
  streetlight: "Street light",
  kitchen: "Community kitchen",
  grove: "Banana grove",
  garden: "Vegetable garden",
  greenhouse: "Greenhouse",
  well: "Cistern",
  compost: "Compost station",
  square: "Community square",
  workshop: "Workshop",
  coop: "Chicken coop",
};
const oldId = (k) =>
  ({
    home: "village-atlas-isometric.png-0",
    kitchen: "village-atlas-isometric.png-1",
    grove: "village-atlas-isometric.png-3",
    garden: "garden-simple",
    well: "cistern",
  })[k] || k;
ASSETS.find((a) => a.id === "house").legacy = [
  oldId("home"),
  oldId("home") + "-night",
];
ASSETS.find((a) => a.id === "shed").legacy = ["shed", "shed-night"];
for (const [id, name] of Object.entries(names)) {
  const fp =
    id === "compost"
      ? [3, 1]
      : id === "goat_pasture" || id === "solar_farm"
        ? [3, 2]
        : ["apiary", "streetlight", "eco_toilet"].includes(id)
          ? [1, 1]
          : [2, 2];
  add(id, name, "Buildings", fp, () => building(id), [
    oldId(id),
    oldId(id) + "-night",
  ]);
}
for (const [id, name] of Object.entries({
  "home-veranda": "Veranda house",
  "home-gable": "Gabled house",
  "home-courtyard": "Terrace house",
  "adobe-gable": "Adobe gabled house",
  "adobe-veranda": "Adobe veranda house",
}))
  add(id, name, "Homes", [2, 2], () => cabin(id), [id, id + "-night"]);
add(
  "goat-pasture-empty",
  "Empty goat pasture",
  "Buildings",
  [3, 2],
  () => building("goat-pasture-empty"),
  ["goat-pasture-empty"],
);
for (const [i, id] of [
  "jequitiba",
  "jucara",
  "embauba",
  "pau_brasil",
].entries())
  add(
    id,
    ["Jequitibá-rosa", "Juçara", "Embaúba", "Pau-brasil"][i],
    "Vegetation",
    [2, 2],
    () => tree(id),
    [`forest-${i}`],
  );
for (const [i, id] of [
  "pequi",
  "barbatimao",
  "bunchgrass",
  "campo",
  "umbuzeiro",
  "jurema",
  "mandacaru",
  "macambira",
].entries())
  add(
    id,
    [
      "Pequi",
      "Barbatimão",
      "Cerrado bunchgrass",
      "Campo shrub",
      "Umbuzeiro",
      "Jurema-preta",
      "Mandacaru",
      "Macambira",
    ][i],
    "Vegetation",
    [
      i === 2 || i === 3 || i === 7 ? 1 : 2,
      i === 2 || i === 3 || i === 7 ? 1 : 2,
    ],
    () =>
      id === "bunchgrass"
        ? plant("grass")
        : id === "macambira"
          ? plant("macambira")
          : id === "campo"
            ? (() => {
                const g = group();
                for (let i = 0; i < 5; i++)
                  foliage(
                    g,
                    Math.sin(i) * 0.25,
                    0.3,
                    Math.cos(i) * 0.25,
                    0.32,
                    i % 2 ? "#91a74c" : "#68883c",
                  );
                return g;
              })()
            : tree(id),
    [`regional-nature-${i}`],
  );
for (const [i, name] of [
  "Forest ferns",
  "Bromeliads",
  "Meadow wildflowers",
  "Dry grasses",
  "Granite outcrop",
  "Quartz stones",
  "Clay and ironstone",
  "Mossy river stones",
].entries())
  add(
    `landscape-${i}`,
    name,
    i < 4 ? "Vegetation" : "Geology",
    [1, 1],
    () => detail(i),
    [`landscape-${i}`],
  );
for (const [i, name] of [
  "Meadow",
  "Red earth",
  "Cerrado ground",
  "Caatinga ground",
].entries())
  add(
    `ground-${i}`,
    name,
    "Terrain",
    [1, 1],
    () => {
      const g = group();
      block(g, 2, 0.012, 2, ["#a9b983", "#b88556", "#b2a46e", "#c8b788"][i]);
      return g;
    },
    [i < 2 ? `terrain-${i}` : `regional-ground-${i - 2}`],
  );
for (const [i, name] of [
  "Managed timber",
  "Bamboo stand",
  "Building earth",
  "Stone deposit",
  "Salvage clearing",
  "Camp receiving bench",
  "Recovered battery",
].entries())
  add(
    `supply-${i}`,
    name,
    "Supplies",
    i === 0 ? [3, 3] : [1, 1],
    () => supply(i),
    [i < 6 ? `economy-${i}` : "recovered-battery"],
  );
for (const [i, id] of [
  "lettuce",
  "beans",
  "tomato",
  "maize",
  "cassava",
  "fodder",
].entries())
  for (let stage = 0; stage < 3; stage++)
    add(
      `${id}-${stage}`,
      `${["Lettuce", "Beans", "Tomatoes", "Maize", "Cassava", "Fodder grass"][i]} · ${["seedling", "growing", "harvestable"][stage]}`,
      "Crops",
      [1, 1],
      () => plant(id, stage),
      [`${i < 3 ? "crop" : "field-crop"}-${i % 3}-${stage}`],
    );
for (const [i, id] of ["iara", "bento", "luz", "caua", "nina"].entries())
  add(
    id,
    ["Iara", "Bento", "Luz", "Cauã", "Nina"][i],
    "Residents",
    [1, 1],
    () => createResident(id),
    [`portrait-${i}`, id, `${id}-idle`, `${id}-activities`],
  );
for (let i = 0; i < 3; i++)
  add(
    `hen-${i}`,
    `${["Cream", "Ochre", "Brown"][i]} chicken`,
    "Animals",
    [1, 1],
    () => chicken(i),
    [`hen-${i}`],
  );
add("goat", "Goat", "Animals", [1, 1], goat);
ASSETS.push(...PROPS);
// A connected section keeps its own origin and selection footprint. Only its
// exposed perimeter is drawn; editable neighbors provide the rest of the area.
export function createConnectedAsset(id, connection) {
  if (!connection) return createAsset(id);
  const g = group(),
    def = ASSETS.find((a) => a.id === id);
  const [w, d] = def.footprint.map((n) => n * 2);
  if (id === "garden") {
    block(g, w, 0.08, d, "#936b43", 0, 0.04);
    for (let x = -w / 2 + 0.4; x < w / 2; x += 0.8)
      for (let z = -d / 2 + 0.4; z < d / 2; z += 0.8) {
        const crop = plant("lettuce");
        crop.position.set(x, 0.08, z);
        g.add(crop);
      }
    for (const [a, b] of connection.edges) {
      const edge = beam(
        g,
        [a[0], 0.11, a[1]],
        [b[0], 0.11, b[1]],
        0.1,
        "timberLight",
      );
      edge.name = "outer-border";
    }
  } else if (id === "solar_farm") {
    for (let z = -d / 2 + 1; z < d / 2; z += 2) {
      for (let x = -w / 2 + 1; x < w / 2; x += 2) {
        const rack = group();
        panel(rack);
        rack.scale.z = 0.82;
        rack.position.set(x, 0, z);
        g.add(rack);
        for (const side of [-0.65, 0.65])
          beam(
            g,
            [x + side, 0.1, z - 0.6],
            [x + side, 1.38, z + 0.6],
            0.07,
            "teal",
          );
      }
      for (const offset of [-0.55, 0.55])
        box(g, w, 0.1, 0.09, "stone", 0, 0.78, z + offset);
      box(g, w, 0.025, 0.025, "hair", 0, 0.25, z);
    }
    // One control cabinet serves the connected array, rather than one per tile.
    if (connection.leader) {
      const cabinet = block(
        g,
        0.4,
        0.6,
        0.2,
        "#397c72",
        -w / 2 + 0.25,
        0.3,
        -d / 2 + 0.2,
      );
      cabinet.name = "shared-inverter";
    }
  } else if (id === "orchard") {
    for (const x of [-1, 1]) {
      const t = tree("orchard");
      t.position.set(x, 0, 0);
      g.add(t);
      color(
        cylinder(g, 0.65, 0.65, 0.025, "earth", x, 0.013, 0, 10),
        "#9c8152",
      );
    }
    // A single low perimeter fence defines the expanded orchard; no interior fences.
    const posts = new Set();
    for (const [a, b] of connection.edges) {
      for (const y of [0.3, 0.58]) {
        const rail = beam(
          g,
          [a[0], y, a[1]],
          [b[0], y, b[1]],
          0.065,
          "timberLight",
        );
        rail.name = "outer-fence";
      }
      for (const p of [a, b])
        if (!posts.has(p.join(","))) {
          posts.add(p.join(","));
          box(g, 0.09, 0.75, 0.09, "timber", p[0], 0.375, p[1]);
        }
    }
  } else return createAsset(id);
  g.name = id;
  g.userData = { id, footprint: def.footprint, connection };
  return g;
}
export function createAsset(id) {
  const def = ASSETS.find((a) => a.id === id);
  if (!def) throw new Error(`Unknown asset ${id}`);
  const g = RESIDENT_IDS.includes(id) ? createResident(id) : def.build();
  if (g.rig) {
    // Static catalog previews omit rehearsal-only tools before material batching.
    for (const tool of [g.rig.cargo, g.rig.can]) {
      tool.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
      tool.removeFromParent();
    }
    delete g.rig;
  }
  const bounds = new THREE.Box3().setFromObject(g, true);
  if (bounds.min.y < 0)
    for (const child of g.children) child.position.y -= bounds.min.y;
  g.name = id;
  g.userData = { id, footprint: def.footprint, revision: def.revision || 1 };
  g.updateMatrixWorld(true);
  return g;
}
const revised = new Set([
  "home-veranda",
  "home-gable",
  "home-courtyard",
  "adobe-gable",
  "adobe-veranda",
  "goat",
  "goat_pasture",
  "solar_farm",
  "compost",
  "square",
  "workshop",
  "kitchen",
  "greenhouse",
  "hydro",
  "well",
  "jequitiba",
  "jucara",
  "embauba",
  "pau_brasil",
  "pequi",
  "barbatimao",
  "umbuzeiro",
  "jurema",
  "mandacaru",
  "orchard",
  "supply-0",
]);
for (const a of ASSETS) if (revised.has(a.id)) a.revision = 2;
const descriptions = {
  well: "Brazilian plate-built rainwater cistern: a broad whitewashed reservoir, shallow cover, access hatch and external plumbing.",
  solar_farm:
    "Six solar modules on two rows of braced racks, with shared rails, wiring and an inverter. Occupies 3 × 2 cells.",
  compost:
    "Three side-by-side slatted bins for fresh material, active compost and finished compost. Occupies 3 × 1 cells.",
  square:
    "A gathering circle with timber benches, a small tile mosaic, flowering pots and a community noticeboard. No pergola.",
  workshop:
    "An enclosed carpentry shop with wide turquoise doors, a workbench, tools, timber stock and shuttered side windows.",
  kitchen:
    "An open masonry kitchen with a clay oven, tall chimney, preparation counter, sink and serving table.",
  greenhouse:
    "Blue-green glazed walls, roof and gables with visible pane reflections. Raised beds flank a central aisle.",
  hydro:
    "A braced river platform with an open-spoke paddle wheel, axle, finned generator and electrical cabinet.",
  goat: "A compact goat with jointed legs, cloven-looking dark hooves, a connected neck and muzzle, sideways ears, swept horns and a little beard.",
  jequitiba:
    "Jequitibá-rosa: a tall straight trunk, flared roots and a high, broad crown. Stylized to the village scale.",
  jucara:
    "Juçara: a slender ringed trunk, green crownshaft and arching pinnate fronds with paired leaflets.",
  embauba:
    "Embaúba: pale ringed bark, an open branching crown and clusters of large lobed leaves at branch tips.",
  umbuzeiro:
    "Umbuzeiro: a short branching trunk beneath a broad, low umbrella-shaped crown.",
  jurema:
    "Jurema-preta: exposed fine branching and a light, open crown of small foliage clusters.",
};
for (const a of ASSETS)
  if (descriptions[a.id]) a.description = descriptions[a.id];
export const CATEGORIES = [...new Set(ASSETS.map((a) => a.category))];

// Bake static recipe pieces into one draw per material. This preserves the exact
// authored geometry while avoiding hundreds of individual clay-tile draw calls.
export function compactModel(root) {
  root.updateMatrixWorld(true);
  const batches = new Map();
  const owned = new Set();
  const transparent = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const key = o.material;
    if (o.userData.ownedMaterial) owned.add(key);
    const geometry = (
      o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()
    ).applyMatrix4(o.matrixWorld);
    if (key.transparent) {
      const pane = new THREE.Mesh(geometry, key);
      pane.castShadow = false;
      pane.receiveShadow = true;
      pane.renderOrder = 2;
      pane.userData.ownedMaterial = owned.has(key);
      transparent.push(pane);
      return;
    }
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(geometry);
  });
  const result = group();
  result.name = root.name;
  result.userData = { ...root.userData };
  if (transparent.length) result.add(...transparent);
  for (const [material, parts] of batches) {
    const geo = new THREE.BufferGeometry();
    for (const name of ["position", "normal", "uv"]) {
      if (!parts.every((p) => p.getAttribute(name))) continue;
      const size = parts[0].getAttribute(name).itemSize;
      const array = new Float32Array(
        parts.reduce((n, p) => n + p.getAttribute(name).array.length, 0),
      );
      let offset = 0;
      for (const p of parts) {
        const a = p.getAttribute(name).array;
        array.set(a, offset);
        offset += a.length;
      }
      geo.setAttribute(name, new THREE.BufferAttribute(array, size));
    }
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material);
    mesh.userData.ownedMaterial = owned.has(material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    result.add(mesh);
    parts.forEach((p) => p.dispose());
  }
  root.traverse((o) => o.geometry?.dispose());
  return result;
}
