import * as THREE from "three";

// Added after static geometry batching so flames and local light remain animated.
export function createFire() {
  const root = new THREE.Group();
  const flames = [];
  for (let i = 0; i < 5; i++) {
    const inner = i === 4;
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(inner ? 0.14 : 0.17, inner ? 0.5 : 0.7, 5),
      new THREE.MeshBasicMaterial({
        color: inner ? "#ffe8a0" : i % 2 ? "#ffb42f" : "#f87520",
      }),
    );
    flame.userData.ownedMaterial = true;
    flame.position.set(
      inner ? 0 : Math.sin((i * Math.PI) / 2) * 0.17,
      0.48,
      inner ? 0 : Math.cos((i * Math.PI) / 2) * 0.17,
    );
    root.add(flame);
    flames.push(flame);
  }
  const light = new THREE.PointLight("#ffae55", 22, 9, 2);
  light.position.y = 0.85;
  root.add(light);
  return { root, flames, light };
}

export function animateFire(fire, time) {
  for (let i = 0; i < fire.flames.length; i++) {
    const flame = fire.flames[i];
    const pulse =
      1 +
      Math.sin(time * 5.3 + i * 1.7) * 0.18 +
      Math.sin(time * 8.1 + i) * 0.08;
    flame.scale.y = pulse;
    flame.position.y = 0.18 + (i === 4 ? 0.25 : 0.35) * pulse;
    flame.rotation.z = Math.sin(time * 3.7 + i) * 0.12;
  }
  fire.light.intensity =
    22 + Math.sin(time * 5.3) * 2 + Math.sin(time * 8.1) * 1.5;
}
