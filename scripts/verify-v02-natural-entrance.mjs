import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createAsset } from '../web/v02/library/catalog.js';
import { MAP_HALF } from '../web/v02/weekend/map-size.js';
import { ROAD_END_Z, PARK_Z, accessRoadAt } from '../web/v02/weekend/road-layout.js';
import { vehiclePose, ARRIVAL_DURATION } from '../web/v02/weekend/arrival.js';
import { elevationAt } from '../web/v02/weekend/elevation.js';
assert(ROAD_END_Z + MAP_HALF <= 40, 'road ends near northern boundary');
assert(!accessRoadAt(32, 21), 'former road is available to build');
for (const seed of [1, 42, 2718]) {
  for (let t = 0; t <= ARRIVAL_DURATION; t += .5) {
    for (const car of [0, 1]) {
      const p = vehiclePose(t, car);
      assert(p.z >= -MAP_HALF && p.z <= PARK_Z);
      assert(accessRoadAt(p.x / 2 + 32, p.z / 2 + 32));
      assert.equal(elevationAt(p.x, p.z, seed), 0, 'cars remain on level terrain');
    }
  }
}
for (const id of ['jequitiba', 'jucara', 'embauba', 'pequi', 'umbuzeiro', 'jurema']) {
  const signatures = [];
  for (const seed of [11, 22, 33, 44]) {
    const a = createAsset(id, seed), b = createAsset(id, seed);
    const signature = (g) => {
      const parts = [];
      g.traverse(o => parts.push([...o.position.toArray(), ...o.scale.toArray(), ...o.rotation.toArray()]));
      return JSON.stringify(parts);
    };
    assert.equal(signature(a), signature(b), 'same seed preserves individual tree');
    signatures.push(signature(a));
    const size = new THREE.Box3().setFromObject(a).getSize(new THREE.Vector3());
    assert(size.y > 0 && Number.isFinite(size.length()));
    assert(a.scale.y >= .86 && a.scale.y <= 1.14, 'bounded adult size variation');
  }
  assert.equal(new Set(signatures).size, 4, id + ' has distinct individuals');
}
console.log('PASS: short entrance, level vehicle route, buildable former road and stable species variation.');
