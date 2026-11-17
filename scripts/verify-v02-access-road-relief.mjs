import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createAccessRoad } from '../web/v02/weekend/access-road.js';
import { elevationAt } from '../web/v02/weekend/elevation.js';
import { roadCenter, PARK_Z } from '../web/v02/weekend/road-layout.js';
import { MAP_HALF } from '../web/v02/weekend/map-size.js';

const ray = new THREE.Raycaster();
let samples = 0;
for (const seed of [0, 1, 42, 2718]) {
  const road = createAccessRoad(seed);
  road.updateMatrixWorld(true);
  // Only the seven road layers and parking surface, excluding roadside props.
  const surfaces = road.children.slice(0, 8);
  let low = Infinity, high = -Infinity;
  for (let z = -MAP_HALF + .25; z < PARK_Z + 3; z += .7) {
    for (let offset = -3.8; offset <= 3.8; offset += .63) {
      const x = roadCenter(z) + offset;
      const ground = elevationAt(x, z, seed);
      low = Math.min(low, ground); high = Math.max(high, ground);
      ray.set(new THREE.Vector3(x, ground + 2, z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObjects(surfaces)[0];
      assert(hit, `missing road at ${x},${z}`);
      assert(hit.point.y - ground >= .0349, 'road must not cut through the terrain');
      assert(hit.point.y - ground <= .0401, 'road must not float over the terrain');
      samples++;
    }
  }
  if (seed) assert(high - low > .1, 'entrance corridor retains natural relief');
  else assert.equal(high, 0, 'legacy flat land stays flat');
}
console.log(`PASS: ${samples} access-road interior samples conform to relief across three seeds and legacy flat land.`);
