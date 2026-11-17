import * as THREE from "three";
export function prepareHouseLighting(root) {
  const panes = [];
  root.updateWorldMatrix(true, true);
  const toRoot = root.matrixWorld.clone().invert();
  root.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.material.userData.windowPane) return;
    mesh.geometry.computeBoundingBox();
    const bounds = mesh.geometry.boundingBox.clone().applyMatrix4(
      new THREE.Matrix4().multiplyMatrices(toRoot, mesh.matrixWorld),
    );
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const outward = size.x < size.z
      ? new THREE.Vector3(Math.sign(center.x) || 1, 0, 0)
      : new THREE.Vector3(0, 0, Math.sign(center.z) || 1);
    panes.push({
      material: mesh.material,
      color: mesh.material.color.clone(),
      center,
      outward,
    });
  });
  const front = [...panes].sort((a, b) => b.center.z - a.center.z)[0];
  const spill = front
    ? front.center.clone().addScaledVector(front.outward, 0.45)
    : new THREE.Vector3(0.8, 1.4, 2.1);
  return { panes, spill };
}
const warm = new THREE.Color("#ffd29a");
export function updateHouseLighting(lighting, amount) {
  amount = Math.max(0, Math.min(1, amount));
  for (const pane of lighting.panes) {
    pane.material.color.copy(pane.color).lerp(warm, amount * 0.65);
    pane.material.emissive.copy(warm);
    pane.material.emissiveIntensity = amount * 0.85;
  }
}

// Only emitting buildings compete for the fixed pool of nearby light sources.
export function selectBuildingLights(nodes, buildings, target, position, limit = 8) {
  const outdoor = new Set(["streetlight", "home", "kitchen", "workshop", "shed", "warehouse", "square"]);
  return Object.values(nodes)
    .filter((node) => node.enabled && node.power > 0 &&
      buildings.get(node.id)?.houseLighting &&
      (outdoor.has(node.kind) || buildings.get(node.id).houseLighting?.panes.length))
    .sort((a, b) => position(a.x, a.z).distanceToSquared(target) -
      position(b.x, b.z).distanceToSquared(target))
    .slice(0, limit);
}
