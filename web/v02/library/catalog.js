import * as THREE from "three";
import {
  ASSETS as STUDIES,
  createAsset as createStudy,
  box,
  cylinder,
  ball,
  beam,
  clayRoof,
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
        roughness: 0.95,
        flatShading: true,
        transparent: opacity < 1,
        opacity,
        depthWrite: opacity === 1,
      }),
    );
  object.material = colors.get(key);
  return object;
}
function block(g, w, h, d, hex, x = 0, y = h / 2, z = 0) {
  return color(box(g, w, h, d, "plaster", x, y, z), hex);
}
function foliage(g, x, y, z, r = 1, hex = "#68883c", scale = [1, 1, 1]) {
  return color(ball(g, r, "leaf", x, y, z, scale, 0), hex);
}
function leaf(g, x, y, z, angle, length = 1, hex = "#68883c") {
  const m = foliage(g, x, y, z, 0.5, hex, [0.32, 0.1, length * 2]);
  m.rotation.set(-0.25, angle, 0.12);
  return m;
}
function plant(kind, stage = 2) {
  const g = group(),
    s = [0.28, 0.62, 1][stage];
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
  else if (kind === "grass" || kind === "fodder")
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4;
      beam(
        g,
        [0, 0, 0],
        [
          Math.sin(a) * 0.4 * s,
          (0.5 + (i % 3) * 0.18) * s,
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
        y = h * (0.32 + i * 0.105);
      leaf(
        g,
        Math.cos(a) * 0.22 * s,
        y,
        Math.sin(a) * 0.22 * s,
        a,
        kind === "banana" ? 1.25 * s : 0.45 * s,
        i % 2 ? "#91a74c" : "#68883c",
      );
    }
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
function tree(kind) {
  const g = group();
  if (kind === "jucara") {
    cylinder(g, 0.1, 0.2, 4.5, "timber", 0, 2.25, 0, 7);
    for (let i = 0; i < 9; i++)
      leaf(g, Math.sin(i) * 0.55, 4.35, Math.cos(i) * 0.55, i, 1.8, "#4b7b43");
    return g;
  }
  if (kind === "mandacaru") {
    color(cylinder(g, 0.19, 0.25, 2.5, "leaf", 0, 1.25, 0, 7), "#598269");
    for (const side of [-1, 1]) {
      beam(g, [0, 1, 0], [side * 0.65, 1, 0], 0.22, "leaf");
      cylinder(g, 0.13, 0.16, 0.95, "leaf", side * 0.65, 1.45, 0, 7);
    }
    return g;
  }
  const specs = {
    jequitiba: [6, 2.1, "#54743a"],
    embauba: [4, 1.3, "#9eaf72"],
    pau_brasil: [4.5, 1.6, "#6a883b"],
    pequi: [3.4, 1.7, "#879641"],
    barbatimao: [3, 1.3, "#68804b"],
    umbuzeiro: [3.2, 1.8, "#7c994c"],
    jurema: [3.1, 1.5, "#829270"],
    orchard: [2.7, 1, "#73913f"],
    timber: [4.8, 1.5, "#658543"],
  };
  const [h, r, c] = specs[kind] || specs.orchard;
  cylinder(g, 0.16, 0.36, h * 0.7, "timber", 0, h * 0.35, 0, 6);
  for (let i = 0; i < 5; i++) {
    const a = i * 2.4,
      x = Math.sin(a) * r * 0.6,
      z = Math.cos(a) * r * 0.6,
      y = h * 0.72 + (i % 2) * 0.35;
    beam(g, [0, h * 0.35, 0], [x, y, z], 0.18, "timber");
    foliage(g, x, y, z, r * 0.78, c, [1, 0.8, 1]);
  }
  if (kind === "orchard" || kind === "pequi")
    for (let i = 0; i < 7; i++)
      foliage(
        g,
        Math.sin(i * 2.4) * 0.8,
        h * 0.72 + (i % 3) * 0.15,
        Math.cos(i * 2.4) * 0.8,
        0.1,
        kind === "orchard" ? "#db9d42" : "#a9b34e",
      );
  if (kind === "pau_brasil")
    for (let i = 0; i < 8; i++)
      foliage(
        g,
        Math.sin(i) * 1.3,
        h * 0.8,
        Math.cos(i) * 1.3,
        0.12,
        "#d7b44d",
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
function cabin(kind) {
  const g = group(),
    adobe = kind.startsWith("adobe"),
    veranda = kind.includes("veranda"),
    terrace = kind.includes("courtyard");
  block(g, 3.4, 2.35, 3.2, adobe ? "#bd9069" : "#e8d8ab");
  clayRoof(g, {
    half: 1.95,
    depth: 3.6,
    eave: 2.35,
    rise: 1,
    ridgeHeight: 3.6,
  });
  block(g, 0.75, 1.8, 0.1, "#397c72", -0.55, 0.9, 1.64);
  block(g, 0.85, 0.8, 0.1, "#334f4e", 0.8, 1.45, 1.65);
  for (const x of [0.25, 1.35]) box(g, 0.22, 0.95, 0.14, "teal", x, 1.45, 1.68);
  box(g, 1.1, 0.12, 0.55, "stone", -0.55, 0.06, 1.85);
  if (veranda || terrace) {
    box(g, 3.4, 0.1, 1.2, "earth", 0, 0.05, 2.2);
    for (const x of [-1.5, 1.5])
      box(g, 0.16, 2.2, 0.16, "timber", x, 1.1, 2.65);
    if (veranda) {
      const aw = group();
      aw.position.set(0, 0, 2.2);
      g.add(aw);
      clayRoof(aw, {
        half: 1.85,
        depth: 1.1,
        eave: 2.05,
        rise: 0.3,
        ridgeHeight: 2.6,
      });
    }
  }
  if (adobe)
    for (let y = 0.25; y < 2.3; y += 0.35)
      for (let x = -1.4; x < 1.6; x += 0.65)
        block(g, 0.48, 0.025, 0.012, "#ab7e59", x, y, -1.61);
  return g;
}
function goat() {
  const g = group();
  foliage(g, 0, 0.65, 0, 0.47, "#dfd4b7", [1.2, 0.65, 0.6]);
  for (const x of [-0.3, 0.3])
    for (const z of [-0.18, 0.18])
      box(g, 0.09, 0.43, 0.09, "timber", x, 0.215, z);
  foliage(g, 0.46, 0.93, 0, 0.21, "#e9dfc5", [0.8, 1, 0.8]);
  for (const z of [-0.13, 0.13]) {
    beam(g, [0.43, 1.07, z], [0.32, 1.3, z], 0.045, "stone");
    foliage(g, 0.48, 0.94, z, 0.1, "#b19a78", [1, 0.4, 0.7]);
  }
  return g;
}
function chicken(variant = 0) {
  const g = group(),
    c = ["#eadfc1", "#c89a49", "#946143"][variant];
  foliage(g, 0, 0.29, 0, 0.25, c, [0.8, 1, 1.15]);
  foliage(g, 0, 0.52, 0.18, 0.12, c);
  foliage(g, 0, 0.65, 0.18, 0.06, "#bb4f38", [0.7, 1, 1]);
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
    beam(g, [0, 3.5, -1.7], [0, 3.5, 1.7], 0.12, "timberLight");
    for (const x of [-1.7, 1.7])
      color(box(g, 0.025, 2.3, 3.4, "glass", x, 1.2, 0), "#b4d6c5", 0.18);
    for (const sign of [-1, 1]) {
      const p = color(
        box(g, 2, 0.03, 3.4, "glass", sign * 0.85, 2.975, 0),
        "#bdd8c7",
        0.22,
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
      [-0.8, -0.8],
      [0.8, 0.7],
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
    cylinder(g, 0.85, 0.85, 2.5, "teal", 0, 1.25, 0, 12);
    for (const y of [0.3, 1.2, 2.2])
      cylinder(g, 0.88, 0.88, 0.08, "stone", 0, y, 0, 12);
    cylinder(g, 0.9, 0.9, 0.1, "teal", 0, 2.55, 0, 12);
    beam(g, [0.85, 0.45, 0], [1.12, 0.45, 0], 0.12, "timberLight");
    return g;
  }
  if (id === "solar_farm") {
    for (const x of [-1, 1]) panel(g, x, 0);
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
    for (const x of [-0.85, 0.85]) {
      for (const z of [-0.65, 0.65])
        box(g, 0.12, 0.9, 0.12, "timber", x, 0.45, z);
      for (let y = 0.15; y < 0.9; y += 0.22) {
        box(g, 0.1, 0.14, 1.4, "timberLight", x, y, 0);
        box(g, 1.7, 0.14, 0.1, "timberLight", 0, y, -0.65);
      }
    }
    foliage(g, 0, 0.25, 0, 0.65, "#725638", [1, 0.4, 1]);
    return g;
  }
  if (id === "square") {
    for (const z of [-1.4, 1.4]) {
      table(g, 0, z, 2);
    }
    for (const x of [-1.5, 1.5]) {
      cylinder(g, 0.23, 0.17, 0.35, "tile", x, 0.175, 0);
      const p = plant("bromeliad");
      p.position.set(x, 0.35, 0);
      g.add(p);
    }
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
    box(g, 1.5, 0.22, 1.5, "timber", 0, 0.65, 0);
    block(g, 0.7, 0.55, 0.65, "#397c72", 0, 1);
    const wheel = cylinder(g, 0.75, 0.75, 0.22, "timberLight", 0, 0.8, 1, 12);
    wheel.rotation.x = Math.PI / 2;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      box(
        g,
        0.22,
        0.24,
        0.4,
        "timber",
        Math.cos(a) * 0.68,
        0.8 + Math.sin(a) * 0.68,
        1,
      );
    }
    return g;
  }
  if (id === "eco_toilet") {
    block(g, 1.5, 2.35, 1.5, "#dfc99b");
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
  // Open work buildings have intentionally different silhouettes and equipment.
  const shed = createStudy("shed");
  g.add(shed);
  if (id === "warehouse") {
    for (const x of [-1.7, 1.7])
      box(g, 0.15, 2.1, 1.7, "timberLight", x, 1.05, 0);
    box(g, 3.4, 2.1, 0.12, "timberLight", 0, 1.05, -0.8);
    for (const x of [-1, 0.1, 1]) {
      box(g, 0.7, 0.6, 0.65, "timberLight", x, 0.3, 0);
      box(g, 0.5, 0.5, 0.5, "earth", x, 0.85, -0.1);
    }
  }
  if (id === "workshop") {
    table(g, 0, 0, 2.5);
    box(g, 2.8, 0.85, 0.12, "timber", 0, 1.7, -0.65);
    for (const x of [-0.8, 0, 0.8]) {
      beam(g, [x, 1.5, -0.55], [x, 1.95, -0.55], 0.07, "stone");
    }
    cylinder(g, 0.25, 0.25, 0.12, "stone", 0.8, 1.05, 0);
  }
  if (id === "kitchen") {
    block(g, 1.15, 0.85, 0.85, "#c48d66", -0.7, 0.425, 0);
    foliage(g, -0.7, 1.0, 0, 0.6, "#b86b44", [1, 0.8, 1]);
    block(g, 0.45, 0.3, 0.06, "#3a2a23", -0.7, 0.95, 0.53);
    table(g, 0.85, 0, 1.15);
    cylinder(g, 0.15, 0.12, 0.22, "teal", 0.8, 1.1, 0);
    cylinder(g, 0.13, 0.13, 2, "tile", -1, 2, -0.3);
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
    for (let i = 0; i < 5; i++)
      box(g, 0.7, 0.1, 0.6, "tile", 0, 0.06 + i * 0.1, 0.5);
    box(g, 0.6, 0.5, 0.6, "timberLight", 0.7, 0.25, 0);
  }
  if (id === 5) {
    table(g, 0, 0, 2);
    box(g, 0.6, 0.5, 0.55, "timberLight", 0.4, 1.23, 0);
    block(g, 0.5, 0.5, 0.15, "#365c73", -0.5, 1.23, 0);
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
  } else
    for (let n = 0; n < 4; n++)
      foliage(
        g,
        Math.sin(n) * 0.45,
        0.18,
        Math.cos(n) * 0.45,
        0.34,
        ["#93988d", "#d9d3b7", "#ad7653", "#73816b"][i - 4],
        [1, 0.7, 1],
      );
  return g;
}
function person(i) {
  const g = createStudy("resident");
  const shirts = ["#d6af52", "#397c86", "#e6b987", "#7a954d", "#967caa"],
    skins = ["#bb8055", "#8d573a", "#bd8159", "#b77b4e", "#915a3c"];
  g.traverse((o) => {
    if (!o.isMesh) return;
    const c = o.material.color.getHexString();
    if (c === "d3ad58") color(o, shirts[i]);
    if (c === "b87950") color(o, skins[i]);
  });
  if ([0, 2, 4].includes(i))
    foliage(
      g,
      0,
      1.39,
      -0.19,
      0.17,
      ["#382c24", "#382c24", "#773b23", "#382c24", "#302822"][i],
      [1, 0.9, 0.6],
    );
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
    id === "goat_pasture"
      ? [3, 2]
      : [
            "apiary",
            "well",
            "streetlight",
            "eco_toilet",
            "coop",
            "compost",
            "hydro",
          ].includes(id)
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
  add(
    id,
    name,
    "Homes",
    id.includes("veranda") || id.includes("courtyard") ? [2, 3] : [2, 2],
    () => cabin(id),
    [id, id + "-night"],
  );
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
            ? detail(0)
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
    () => person(i),
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
export function createAsset(id) {
  const def = ASSETS.find((a) => a.id === id);
  if (!def) throw new Error(`Unknown asset ${id}`);
  const g = def.build();
  g.name = id;
  g.userData = { id, footprint: def.footprint, revision: def.revision || 1 };
  g.updateMatrixWorld(true);
  return g;
}
export const CATEGORIES = [...new Set(ASSETS.map((a) => a.category))];

// Bake static recipe pieces into one draw per material. This preserves the exact
// authored geometry while avoiding hundreds of individual clay-tile draw calls.
export function compactModel(root) {
  root.updateMatrixWorld(true);
  const batches = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const key = o.material;
    const geometry = (
      o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()
    ).applyMatrix4(o.matrixWorld);
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(geometry);
  });
  const result = group();
  result.name = root.name;
  result.userData = { ...root.userData };
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
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    result.add(mesh);
    parts.forEach((p) => p.dispose());
  }
  root.traverse((o) => o.geometry?.dispose());
  return result;
}
