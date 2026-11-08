import { MAP_HALF } from "./map-size.js";
import * as THREE from "three";
import { roadCenter, PARK_Z } from "./road-layout.js";
export function createAccessRoad() {
  const root = new THREE.Group();
  const materials = new Map();
  const mat = (color) => {
    if (!materials.has(color))
      materials.set(
        color,
        new THREE.MeshStandardMaterial({
          color,
          roughness: 1,
          flatShading: true,
        }),
      );
    return materials.get(color);
  };
  function strip(left, right, y, color) {
    const vertices = [];
    for (let z = -MAP_HALF; z < PARK_Z + 4; z++) {
      const w = z > PARK_Z - 4 ? 1 + (z - PARK_Z + 4) * 0.045 : 1,
        wn = z + 1 > PARK_Z - 4 ? 1 + (z - PARK_Z + 5) * 0.045 : 1;
      const a = roadCenter(z),
        b = roadCenter(z + 1);
      vertices.push(
        a + left * w,
        y,
        z,
        b + left * wn,
        y,
        z + 1,
        b + right * wn,
        y,
        z + 1,
        a + left * w,
        y,
        z,
        b + right * wn,
        y,
        z + 1,
        a + right * w,
        y,
        z,
      );
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat(color));
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  strip(-5, 5, 0.021, "#a6a373");
  strip(-4.45, 4.45, 0.03, "#b99a6b");
  strip(-4.12, 4.12, 0.035, "#c5a77a");
  for (const x of [-2.95, -1.25, 1.25, 2.95])
    strip(x - 0.14, x + 0.14, 0.04, "#b79c74");
  const clearing = new THREE.Mesh(
    new THREE.CircleGeometry(1, 24),
    mat("#c5a77a"),
  );
  clearing.rotation.x = -Math.PI / 2;
  clearing.scale.set(5.5, 3, 1);
  clearing.position.set(1.1, 0.036, PARK_Z + 3);
  clearing.receiveShadow = true;
  root.add(clearing);
  for (let i = 0; i < 46; i++) {
    const z = -MAP_HALF + i * ((PARK_Z + 3 + MAP_HALF) / 46),
      side = i % 2 ? 1 : -1;
    const rock = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.07 + (i % 3) * 0.035, 0),
      mat(i % 3 ? "#bbb397" : "#a69a7d"),
    );
    rock.position.set(roadCenter(z) + side * (4.5 + (i % 3) * 0.12), 0.07, z);
    rock.scale.y = 0.5;
    root.add(rock);
  }
  // An open entrance: posts and short fence wings leave both lanes unobstructed.
  for (const side of [-1, 1]) {
    const x = roadCenter(-MAP_HALF + 5) + side * 5.1;
    for (const dx of [0, side * 2.5]) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.19, 1.4, 0.19),
        mat("#876749"),
      );
      post.position.set(x + dx, 0.7, -MAP_HALF + 5);
      post.castShadow = true;
      root.add(post);
    }
    for (const y of [0.5, 1]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(2.5, 0.12, 0.1),
        mat("#b19a6a"),
      );
      rail.position.set(x + side * 1.25, y, -MAP_HALF + 5);
      rail.castShadow = true;
      root.add(rail);
    }
  }
  return root;
}
