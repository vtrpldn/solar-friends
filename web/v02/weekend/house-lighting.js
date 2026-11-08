import * as THREE from "three";
export function prepareHouseLighting(root) {
  const panes = [];
  root.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.material.userData.windowPane) return;
    mesh.geometry.computeBoundingBox();
    const center = mesh.geometry.boundingBox.getCenter(new THREE.Vector3());
    panes.push({
      material: mesh.material,
      color: mesh.material.color.clone(),
      center,
    });
  });
  const front = [...panes].sort((a, b) => b.center.z - a.center.z)[0];
  const spill = front
    ? front.center.clone().add(new THREE.Vector3(0, 0, 0.45))
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
