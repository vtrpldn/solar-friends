// The sun covers the complete 128 m plot, including canopy height and its
// projected shadows. Camera pan/zoom must never change which props cast shadows.
export function configureMapSun(sun) {
  sun.position.set(-80, 160, 100);
  sun.target.position.set(0, 0, 0);
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, {
    left: -110,
    right: 110,
    top: 110,
    bottom: -110,
    near: 1,
    far: 350,
  });
  sun.shadow.normalBias = 0.035;
  sun.shadow.bias = -0.00008;
  sun.shadow.camera.updateProjectionMatrix();
}
