import * as THREE from "three";
import { box, cylinder, ball, beam } from "../workshop/models.js";
export const RESOURCE_IDS = [
  "wood",
  "hardware",
  "roofing",
  "tarp",
  "tank",
  "plumbing",
  "sanitation",
  "bamboo",
  "earth",
  "stone",
  "salvage",
  "frames",
  "walls",
  "tiles",
  "electrical",
  "covering",
  "panels",
  "batteries",
  "pumps",
  "tools",
  "food",
  "meals",
  "eggs",
  "compost",
  "scraps",
  "seedlings",
  "tree_starts",
  "bamboo_starts",
  "fodder",
  "milk",
  "honey",
  "goats",
  "bees",
  "hens",
  "money",
  "power",
  "water",
];
function sharedMaterial(key) {
  const probe = box(new THREE.Group(), 1, 1, 1, key);
  probe.geometry.dispose();
  return probe.material;
}
export function resourceModel(id, asset) {
  const g = new THREE.Group();
  const b = (w, h, d, m, x = 0, y = h / 2, z = 0) =>
    box(g, w, h, d, m, x, y, z);
  const c = (r, h, m, x = 0, y = h / 2, z = 0, n = 8) =>
    cylinder(g, r, r, h, m, x, y, z, n);
  const a = (r, m, x, y, z, scale = [1, 1, 1]) =>
    ball(g, r, m, x, y, z, scale, 0);
  const pot = () => {
    c(0.28, 0.4, "tile");
    c(0.24, 0.04, "earth", 0, 0.41);
  };
  const shoot = (x = 0, y = 0.4, z = 0) => {
    beam(g, [x, y, z], [x, y + 0.65, z], 0.04, "leafDark");
    a(0.22, "leaf", x - 0.13, y + 0.37, z, [1.1, 0.4, 0.65]);
    a(0.22, "leafLight", x + 0.14, y + 0.55, z, [1.1, 0.4, 0.65]);
  };
  switch (id) {
    case "wood":
      for (let i = 0; i < 4; i++)
        b(
          1.4,
          0.16,
          0.22,
          i % 2 ? "timber" : "timberLight",
          0,
          0.1 + Math.floor(i / 2) * 0.18,
          ((i % 2) - 0.5) * 0.28,
        );
      break;
    case "hardware":
      for (let i = 0; i < 3; i++) {
        c(0.035, 0.65, "stone", i * 0.18 - 0.18, 0.35, 0, 6);
        b(0.14, 0.05, 0.14, "stone", i * 0.18 - 0.18, 0.69);
      }
      c(0.18, 0.12, "stone", 0.4, 0.06, 0.25, 6);
      c(0.065, 0.13, "hair", 0.4, 0.07, 0.25, 6);
      break;
    case "roofing":
      for (let i = 0; i < 6; i++)
        b(
          0.18,
          0.05,
          1.1,
          i % 2 ? "stone" : "plaster",
          (i - 2.5) * 0.17,
          0.12 + (i % 2) * 0.035,
        );
      break;
    case "tarp":
      b(1, 0.16, 0.7, "teal");
      b(0.9, 0.06, 0.6, "teal", 0, 0.2);
      for (const x of [-0.3, 0.3]) b(0.045, 0.22, 0.75, "timberLight", x, 0.11);
      break;
    case "tank":
      c(0.5, 0.85, "teal");
      c(0.52, 0.07, "glass", 0, 0.86);
      c(0.12, 0.08, "stone", 0, 0.94);
      for (const y of [0.2, 0.65]) c(0.51, 0.04, "stone", 0, y);
      break;
    case "plumbing":
      beam(g, [-0.5, 0.1, 0], [-0.5, 0.65, 0], 0.16, "stone");
      beam(g, [-0.5, 0.65, 0], [0.4, 0.65, 0], 0.16, "stone");
      beam(g, [0.4, 0.65, 0], [0.4, 0.35, 0], 0.16, "stone");
      b(0.35, 0.05, 0.09, "teal", 0.1, 0.82);
      b(0.07, 0.17, 0.07, "stone", 0.1, 0.72);
      break;
    case "sanitation":
      b(0.65, 0.6, 0.25, "plaster", 0, 0.65, -0.28);
      c(0.3, 0.22, "plaster", 0, 0.48, 0.15);
      c(0.23, 0.025, "earth", 0, 0.6, 0.15);
      b(0.3, 0.4, 0.3, "plaster", 0, 0.2, 0.15);
      break;
    case "bamboo":
      for (const x of [-0.25, 0, 0.25]) {
        c(0.09, 1, "leaf", x, 0.5);
        for (const y of [0.2, 0.55, 0.85]) c(0.102, 0.04, "leafLight", x, y);
      }
      break;
    case "earth":
      for (let i = 0; i < 5; i++)
        a(
          0.35,
          "earth",
          Math.sin(i * 2.4) * 0.25,
          0.22,
          Math.cos(i * 2.4) * 0.25,
          [1, 0.65, 1],
        );
      break;
    case "stone":
      a(0.45, "stone", -0.2, 0.3, 0, [1, 0.8, 0.85]);
      a(0.3, "stone", 0.3, 0.23, 0.2, [1, 0.8, 1]);
      break;
    case "salvage":
      b(0.7, 0.08, 0.8, "timberLight", 0, 0.08);
      b(0.4, 0.5, 0.1, "teal", -0.2, 0.35);
      b(0.3, 0.2, 0.35, "stone", 0.25, 0.18, 0.15);
      break;
    case "frames":
      for (const x of [-0.4, 0.4]) b(0.12, 1, 0.12, "timberLight", x, 0.5);
      for (const y of [0.06, 0.94]) b(0.9, 0.12, 0.12, "timberLight", 0, y);
      beam(g, [-0.35, 0.12, 0], [0.35, 0.88, 0], 0.07, "timber");
      break;
    case "walls":
      for (let row = 0; row < 3; row++)
        for (let col = 0; col < 2; col++)
          b(
            0.48,
            0.23,
            0.35,
            "plaster",
            col * 0.5 - 0.25 + (row % 2) * 0.12,
            row * 0.25 + 0.12,
          );
      break;
    case "tiles":
      for (let row = 0; row < 2; row++)
        for (let col = 0; col < 3; col++) {
          const tile = c(
            0.13,
            0.65,
            "tileLight",
            col * 0.25 - 0.25,
            0.16 + row * 0.14,
            row * 0.1,
            8,
          );
          tile.rotation.x = Math.PI / 2;
        }
      break;
    case "electrical": {
      const coil = new THREE.Mesh(
        new THREE.TorusGeometry(0.36, 0.075, 5, 12),
        sharedMaterial("hair"),
      );
      coil.position.y = 0.42;
      g.add(coil);
      beam(g, [0.35, 0.4, 0], [0.55, 0.08, 0], 0.06, "hair");
      b(0.18, 0.16, 0.14, "teal", 0.55, 0.08);
      break;
    }
    case "covering": {
      const roll = c(0.2, 1, "plaster", 0, 0.25, 0);
      roll.rotation.z = Math.PI / 2;
      b(0.9, 0.025, 0.65, "glass", 0, 0.08, 0.3);
      break;
    }
    case "panels":
      b(1, 0.08, 0.8, "stone");
      for (let x = 0; x < 3; x++)
        for (let z = 0; z < 2; z++)
          b(
            0.28,
            0.025,
            0.33,
            "glass",
            x * 0.31 - 0.31,
            0.095,
            z * 0.37 - 0.185,
          );
      break;
    case "batteries":
      b(0.75, 0.8, 0.5, "teal");
      for (const x of [-0.2, 0.2])
        b(0.12, 0.12, 0.12, x < 0 ? "tile" : "stone", x, 0.86);
      b(0.4, 0.2, 0.015, "plaster", 0, 0.5, 0.26);
      break;
    case "pumps":
      c(0.3, 0.5, "teal");
      b(0.8, 0.08, 0.5, "stone");
      beam(g, [-0.3, 0.35, 0], [-0.55, 0.35, 0], 0.13, "stone");
      beam(g, [0.2, 0.5, 0], [0.2, 0.8, 0], 0.13, "stone");
      break;
    case "tools":
      beam(g, [-0.5, 0.05, 0], [0.3, 0.8, 0], 0.08, "timber");
      b(0.45, 0.16, 0.18, "stone", 0.3, 0.8);
      beam(g, [0.5, 0.05, 0.1], [-0.3, 0.75, 0.1], 0.06, "timberLight");
      b(0.2, 0.32, 0.08, "stone", -0.3, 0.78, 0.1);
      break;
    case "food":
      a(0.25, "tileLight", -0.2, 0.25, 0);
      a(0.25, "leaf", 0.2, 0.25, 0.1);
      shoot(-0.2, 0.25);
      break;
    case "meals":
      cylinder(g, 0.45, 0.25, 0.25, "plaster", 0, 0.15, 0, 12);
      c(0.38, 0.025, "earth", 0, 0.285);
      for (let i = 0; i < 6; i++)
        a(
          0.08,
          i % 2 ? "leaf" : "tileLight",
          Math.sin(i) * 0.2,
          0.3,
          Math.cos(i) * 0.2,
        );
      break;
    case "eggs":
      for (const [x, z] of [
        [-0.2, 0],
        [0.2, 0],
        [0, 0.3],
      ])
        a(0.22, "plaster", x, 0.27, z, [0.8, 1.2, 0.8]);
      break;
    case "compost":
      c(0.4, 0.45, "timber");
      c(0.36, 0.04, "earth", 0, 0.48);
      shoot(0, 0.48);
      break;
    case "scraps":
      for (let i = 0; i < 5; i++)
        a(
          0.22,
          i % 2 ? "leafLight" : "earth",
          Math.sin(i) * 0.25,
          0.12,
          Math.cos(i) * 0.25,
          [1, 0.3, 1],
        );
      break;
    case "seedlings":
      pot();
      shoot();
      break;
    case "tree_starts":
      pot();
      beam(g, [0, 0.4, 0], [0, 1, 0], 0.06);
      a(0.4, "leaf", 0, 1, 0);
      break;
    case "bamboo_starts":
      pot();
      for (const x of [-0.12, 0.12]) {
        c(0.04, 0.8, "leaf", x, 0.8);
        shoot(x, 0.6);
      }
      break;
    case "fodder":
      b(0.9, 0.55, 0.65, "shirt");
      for (const x of [-0.25, 0.25]) b(0.04, 0.58, 0.68, "timber", x, 0.29);
      break;
    case "milk":
      c(0.25, 0.7, "plaster");
      c(0.16, 0.22, "plaster", 0, 0.8);
      c(0.17, 0.06, "teal", 0, 0.94);
      break;
    case "honey":
      c(0.3, 0.55, "shirt");
      c(0.32, 0.09, "timberLight", 0, 0.6);
      b(0.3, 0.22, 0.02, "plaster", 0, 0.3, 0.29);
      break;
    case "goats":
      return asset("goat");
    case "hens":
      return asset("hen-0");
    case "bees":
      b(0.65, 0.5, 0.65, "timberLight");
      b(0.8, 0.08, 0.8, "tile", 0, 0.55);
      c(0.055, 0.035, "hair", 0, 0.26, 0.34).rotation.x = Math.PI / 2;
      break;
    case "money":
      for (let i = 0; i < 4; i++)
        c(
          0.3,
          0.075,
          "shirt",
          (i % 2) * 0.3 - 0.15,
          0.05 + Math.floor(i / 2) * 0.09,
          (i % 2) * 0.18,
        );
      break;
    case "power": {
      const shape = new THREE.Shape();
      shape.moveTo(0.15, 1);
      shape.lineTo(-0.3, 0.4);
      shape.lineTo(0, 0.4);
      shape.lineTo(-0.1, 0);
      shape.lineTo(0.35, 0.6);
      shape.lineTo(0.1, 0.6);
      shape.closePath();
      const material = sharedMaterial("shirt");
      const bolt = new THREE.Mesh(
        new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: false }),
        material,
      );
      g.add(bolt);
      break;
    }
    case "water":
      a(0.4, "teal", 0, 0.35, 0, [0.8, 1, 0.8]);
      cylinder(g, 0, 0.26, 0.5, "teal", 0, 0.77, 0, 8);
      break;
    default:
      throw Error(`Missing resource model ${id}`);
  }
  return g;
}
