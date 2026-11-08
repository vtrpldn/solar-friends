import assert from "node:assert/strict";
import * as THREE from "three";
import { fitTerrainCamera } from "../web/v02/weekend/camera-depth.js";
let cases = 0,
  originalClipped = false;
for (const zoom of [0.18, 1, 6])
  for (const tilt of [0.25, 0.8, Math.PI * 0.46])
    for (const yaw of [0, 0.8, 2, 4])
      for (const center of [
        [0, 0],
        [124, 124],
        [-124, -124],
      ]) {
        const target = new THREE.Vector3(center[0], 0, center[1]);
        const camera = new THREE.OrthographicCamera(-40, 40, 23, -23, 0.1, 300);
        camera.zoom = zoom;
        camera.position
          .copy(target)
          .add(
            new THREE.Vector3(
              Math.sin(tilt) * Math.cos(yaw),
              Math.cos(tilt),
              Math.sin(tilt) * Math.sin(yaw),
            ).multiplyScalar(57),
          );
        camera.lookAt(target);
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        const points = [];
        for (const x of [-128, 0, 128])
          for (const z of [-128, 0, 128])
            for (const y of [0, 12]) points.push(new THREE.Vector3(x, y, z));
        const before = points.map((p) => p.clone().project(camera));
        originalClipped ||= before.some((p) => p.z < -1 || p.z > 1);
        fitTerrainCamera(camera, target, new THREE.Fog("#fff", 90, 200));
        points.forEach((p, i) => {
          const after = p.clone().project(camera);
          assert.ok(
            Math.abs(after.x - before[i].x) < 1e-9 &&
              Math.abs(after.y - before[i].y) < 1e-9,
          );
          assert.ok(after.z > -1 && after.z < 1);
        });
        const ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2(0, 0), camera);
        const hit = ray.ray.intersectPlane(
          new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
          new THREE.Vector3(),
        );
        assert.ok(hit.distanceTo(target) < 1e-8, "Picking remains aligned");
        cases++;
      }
assert.ok(originalClipped, "Reproduces the original clipping");
console.log(
  `PASS: ${cases} zoom/tilt/rotation/pan combinations retain all terrain depths and identical screen positions.`,
);
