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
    const patch = terrainNoise(x / 5, z / 5, seed ^ 8197);
    const fine = terrainNoise(x / 2.7, z / 2.7, seed ^ 9011);
    const riverDistance = Math.abs(x - riverCenter(z, seed));
    const moisture = Math.max(0, 1 - riverDistance / 16);
    const color = grass.clone().lerp(lush, Math.min(.85, broad * .65 + moisture * .4));
    const bare = Math.max(0, (patch * .65 + broad * .35 - .42) * 1.6);
    color.lerp(dry, bare).multiplyScalar(.92 + fine * .16);
    colors.push(color.r, color.g, color.b);
  }
  geometry.computeVertexNormals();
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
  );
  // World-space detail adds texture without extra meshes or repeating tiles.
  mesh.material.onBeforeCompile = shader => {
    shader.uniforms.groundSeed = {value: (seed >>> 0) % 10000};
    shader.vertexShader = 'varying vec2 groundXZ;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n groundXZ = position.xz;');
    shader.fragmentShader = `varying vec2 groundXZ;
      uniform float groundSeed;
      float groundHash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7)) + groundSeed) * 43758.5453); }
      float groundNoise(vec2 p) {
        vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(groundHash(i),groundHash(i+vec2(1,0)),f.x),mix(groundHash(i+vec2(0,1)),groundHash(i+vec2(1,1)),f.x),f.y);
      }
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float mottling=groundNoise(groundXZ*1.4);
      float grain=groundNoise(groundXZ*9.0);
      float flecks=smoothstep(.76,.91,groundNoise(groundXZ*vec2(12.0,5.0)));
      float distanceFade=1.0-smoothstep(.12,.65,length(fwidth(groundXZ)));
      diffuseColor.rgb *= 1.0 + (mottling-.5)*.19 + ((grain-.5)*.07-flecks*.08)*distanceFade;
    `);
  };
  mesh.material.customProgramCacheKey = () => 'natural-ground-v1';
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
