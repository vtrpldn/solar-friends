import {createLandSurface,terrainMaterial} from "./land-surface.js";
import {settingsFor,BIOMES} from './world-settings.js';
import { MAP_CELLS, MAP_HALF } from "./map-size.js";
import { riverCenter, riverWidth } from "./river-layout.js";
import { elevationVertex } from "./elevation.js";
import * as THREE from "three";
export function createTerrain(seed = 0, elevationSeed = seed, pads = [], wear = null) {
  const geometry = new THREE.PlaneGeometry(
    MAP_HALF * 2,
    MAP_HALF * 2,
    MAP_CELLS,
    MAP_CELLS,
  );
  geometry.rotateX(-Math.PI / 2);
  const palette=BIOMES[settingsFor(seed).biome].colors;
  const banks = [];
  const points = geometry.attributes.position;
  for (let i = 0; i < points.count; i++) {
    const x = points.getX(i),
      z = points.getZ(i);
    points.setY(i, elevationVertex(x, z, elevationSeed, pads));
    banks.push(Math.max(0,Math.abs(x-riverCenter(z,seed))-riverWidth(z,seed)));
  }
  geometry.computeVertexNormals();
  geometry.setAttribute("bankDistance", new THREE.Float32BufferAttribute(banks, 1));
  const surface=createLandSurface();
  const mesh = new THREE.Mesh(
    geometry,
    terrainMaterial(seed,palette,surface,wear),
  );
  mesh.userData.surface=surface;
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
