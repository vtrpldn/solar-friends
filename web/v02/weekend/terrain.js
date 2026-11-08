import { MAP_CELLS, MAP_HALF } from "./map-size.js";
import { riverCenter } from "./river-layout.js";
import { elevationVertex } from "./elevation.js";
import * as THREE from "three";
import { landRandom } from "./land-layout.js";
export function createTerrain(seed = 0, elevationSeed = seed) {
  const geometry = new THREE.PlaneGeometry(
    MAP_HALF * 2,
    MAP_HALF * 2,
    MAP_CELLS,
    MAP_CELLS,
  );
  geometry.rotateX(-Math.PI / 2);
  const random = landRandom(seed),
    phase = random() * 30;
  const patches = Array.from({ length: 48 }, () => ({
    x: random() * MAP_HALF * 2 - MAP_HALF,
    z: random() * MAP_HALF * 2 - MAP_HALF,
    radius: 5 + random() * 13,
  }));
  const colors = [],
    grass = new THREE.Color("#9fad72"),
    dry = new THREE.Color("#b9ad7b"),
    lush = new THREE.Color("#849965");
  const points = geometry.attributes.position;
  for (let i = 0; i < points.count; i++) {
    const x = points.getX(i),
      z = points.getZ(i);
    points.setY(i, elevationVertex(x, z, elevationSeed));
    let soil = 0;
    for (const p of patches)
      soil = Math.max(
        soil,
        Math.max(0, 1 - Math.hypot(x - p.x, z - p.z) / p.radius),
      );
    const color = grass
      .clone()
      .lerp(
        lush,
        0.25 + 0.2 * Math.sin(x * 0.09 + phase) * Math.cos(z * 0.07 - phase),
      )
      .lerp(dry, soil * 0.7);
    const riverDistance = Math.abs(x - riverCenter(z, seed));
    const dryRegion = Math.max(0, Math.min(1, (x - 25) / 70));
    color.lerp(new THREE.Color("#b49b6c"), dryRegion * 0.55);
    color.lerp(lush, Math.max(0, 1 - riverDistance / 18) * 0.5);
    colors.push(color.r, color.g, color.b);
  }
  geometry.computeVertexNormals();
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
  );
  mesh.receiveShadow = true;
  return mesh;
}
