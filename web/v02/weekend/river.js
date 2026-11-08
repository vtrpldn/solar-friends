import * as THREE from "three";
// Metres in the scene, shared with placement and resident navigation through river-layout.js.
import { riverCenter, riverWidth } from "./river-layout.js";
export { riverCenter, riverWidth };
export function createRiver(seed = 0) {
  const center = (z) => riverCenter(z, seed);
  const width = (z) => riverWidth(z, seed);
  const root = new THREE.Group(),
    materials = new Map();
  const material = (color) => {
    if (!materials.has(color))
      materials.set(
        color,
        new THREE.MeshStandardMaterial({
          color,
          roughness: 1,
          flatShading: true,
          side: THREE.DoubleSide,
        }),
      );
    return materials.get(color);
  };
  function ribbon(extra, y, color) {
    const positions = [];
    for (let i = 0; i < 128; i++) {
      const za = -64 + i,
        zb = za + 1;
      const xa = center(za),
        xb = center(zb),
        wa = width(za) + extra,
        wb = width(zb) + extra;
      positions.push(
        xa - wa,
        y,
        za,
        xb - wb,
        y,
        zb,
        xb + wb,
        y,
        zb,
        xa - wa,
        y,
        za,
        xb + wb,
        y,
        zb,
        xa + wa,
        y,
        za,
      );
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material(color));
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  }
  ribbon(1.9, 0.025, "#889768");
  ribbon(1.1, 0.035, "#bfad7e");
  ribbon(0.4, 0.045, "#a6b9a0");
  ribbon(0, 0.055, "#6caaa2");
  ribbon(-0.9, 0.065, "#468e91");
  const stones = new THREE.Group();
  root.add(stones);
  for (let i = 0; i < 42; i++) {
    const z = -60 + i * 2.9,
      side = i % 2 ? 1 : -1,
      x = center(z) + side * (width(z) + 0.65 + (i % 3) * 0.23);
    const rock = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.2 + (i % 4) * 0.12, 0),
      material(["#9a9d85", "#b8b69d", "#808e7b"][i % 3]),
    );
    rock.scale.set(1.3, 0.65, 0.9);
    rock.position.set(x, 0.18, z);
    rock.rotation.y = i * 1.7;
    rock.castShadow = true;
    rock.receiveShadow = true;
    stones.add(rock);
  }
  // A gravel bar splits the current in the wider bend.
  const island = new THREE.Mesh(
    new THREE.CircleGeometry(1, 9),
    material("#c3b58a"),
  );
  island.rotation.x = -Math.PI / 2;
  island.scale.set(1.1, 3, 1);
  island.position.set(center(13) - 0.4, 0.09, 13);
  island.receiveShadow = true;
  stones.add(island);
  for (let i = 0; i < 8; i++) {
    const rock = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.25 + (i % 3) * 0.14, 0),
      material("#959b83"),
    );
    rock.position.set(center(13) - 0.6 + Math.sin(i) * 0.5, 0.28, 11 + i * 0.5);
    rock.scale.y = 0.6;
    rock.castShadow = true;
    stones.add(rock);
  }
  // Reeds share one material and will be batched with bank stones by the caller.
  for (let i = 0; i < 24; i++) {
    const z = -52 + i * 4.5,
      side = i % 2 ? 1 : -1,
      x = center(z) + side * (width(z) + 1.3);
    for (let j = 0; j < 4; j++) {
      const reed = new THREE.Mesh(
        new THREE.ConeGeometry(0.09, 0.65 + j * 0.15, 3),
        material("#718853"),
      );
      reed.position.set(
        x + Math.cos(j * 2) * 0.2,
        0.35 + j * 0.07,
        z + Math.sin(j * 2) * 0.2,
      );
      reed.rotation.z = Math.sin(i + j) * 0.17;
      stones.add(reed);
    }
  }
  // Animated current highlights are one lightweight draw call, independent of static bank geometry.
  const currentGeometry = new THREE.BufferGeometry(),
    positions = new Float32Array(32 * 18);
  currentGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3),
  );
  const current = new THREE.Mesh(
    currentGeometry,
    new THREE.MeshBasicMaterial({
      color: "#c0ded0",
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  current.frustumCulled = false;
  function update(time) {
    for (let i = 0; i < 32; i++) {
      const z = ((i * 4 + time * 0.65) % 126) - 63,
        x = center(z) + Math.sin(i * 2.4) * (width(z) - 1.3),
        w = 0.35 + (i % 3) * 0.16;
      const points = [
        x - w,
        0.08,
        z,
        x + w,
        0.08,
        z + 0.12,
        x + w,
        0.08,
        z + 0.2,
        x - w,
        0.08,
        z,
        x + w,
        0.08,
        z + 0.2,
        x - w,
        0.08,
        z + 0.08,
      ];
      positions.set(points, i * 18);
    }
    currentGeometry.attributes.position.needsUpdate = true;
  }
  update(0);
  return { root, current, update };
}
