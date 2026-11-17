import { MAP_METRES } from "./layout.js";

// The sun covers the complete editor plot, including canopy height and its
// projected shadows. Camera pan/zoom must never change which props cast shadows.
export function configureMapSun(sun) {
  const half = MAP_METRES / 2, extent = half * 1.72;
  sun.position.set(-half * 1.25, half * 2.5, half * 1.5625);
  sun.target.position.set(0, 0, 0);
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, {
    left: -extent,
    right: extent,
    top: extent,
    bottom: -extent,
    near: 1,
    far: half * 5.5,
  });
  sun.shadow.normalBias = 0.035;
  sun.shadow.bias = -0.00008;
  sun.shadow.camera.updateProjectionMatrix();
}
