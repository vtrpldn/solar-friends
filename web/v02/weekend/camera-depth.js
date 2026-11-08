// Orthographic zoom changes the visible area without moving the camera back.
// Keep the entire plot in front of its near plane, even at a grazing angle.
// Moving along the view axis preserves screen positions and picking accuracy.
export function fitTerrainCamera(camera, target, fog) {
  const dx = camera.position.x - target.x,
    dy = camera.position.y - target.y,
    dz = camera.position.z - target.z;
  const distance = Math.hypot(dx, dy, dz);
  if (!distance) return;
  const safeDistance = Math.max(256, distance);
  if (distance < 256)
    camera.position.set(
      target.x + (dx / distance) * safeDistance,
      target.y + (dy / distance) * safeDistance,
      target.z + (dz / distance) * safeDistance,
    );
  const far = safeDistance + 256;
  if (camera.far !== far) {
    camera.far = far;
    camera.updateProjectionMatrix();
  }
  // Preserve the atmosphere relative to the viewed land, not camera retreat.
  if (fog) {
    fog.near = safeDistance + 35;
    fog.far = safeDistance + 145;
  }
  camera.updateMatrixWorld();
}
