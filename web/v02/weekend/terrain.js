import { terrainNoise } from "./terrain-noise.js";
import {settingsFor,BIOMES} from './world-settings.js';
import { MAP_CELLS, MAP_HALF } from "./map-size.js";
import { riverCenter } from "./river-layout.js";
import { elevationVertex } from "./elevation.js";
import * as THREE from "three";
export function createTerrain(seed = 0, elevationSeed = seed, pads = []) {
  const geometry = new THREE.PlaneGeometry(
    MAP_HALF * 2,
    MAP_HALF * 2,
    MAP_CELLS,
    MAP_CELLS,
  );
  geometry.rotateX(-Math.PI / 2);
  const palette=BIOMES[settingsFor(seed).biome].colors;
  const colors = [],
    grass = new THREE.Color(palette[0]),
    dry = new THREE.Color(palette[1]),
    lush = new THREE.Color(palette[2]);
  const points = geometry.attributes.position;
  for (let i = 0; i < points.count; i++) {
    const x = points.getX(i),
      z = points.getZ(i);
    points.setY(i, elevationVertex(x, z, elevationSeed, pads));
    const broad = terrainNoise(x / 19, z / 19, seed ^ 7321);
    const patch = terrainNoise(x / 13, z / 13, seed ^ 8197);
    const riverDistance = Math.abs(x - riverCenter(z, seed));
    const moisture = Math.max(0, 1 - riverDistance / 16);
    const color = grass.clone().lerp(lush, Math.min(.55, broad * .35 + moisture * .25));
    const bare = Math.max(0, (patch * .65 + broad * .35 - .48) * 1.2);
    color.lerp(dry, bare);
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

export function updateTerrain(mesh, seed, pads) {
  const geometry = mesh.geometry,
    points = geometry.attributes.position;
  for (let i = 0; i < points.count; i++)
    points.setY(i, elevationVertex(points.getX(i), points.getZ(i), seed, pads));
  points.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}
