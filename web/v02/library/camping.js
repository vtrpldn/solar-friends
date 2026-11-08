import * as THREE from "three";
const fabrics = new Map();
function material(color) {
  if (!fabrics.has(color))
    fabrics.set(
      color,
      new THREE.MeshStandardMaterial({
        color,
        roughness: 1,
        flatShading: true,
        side: THREE.DoubleSide,
      }),
    );
  return fabrics.get(color);
}
function panel(group, points, color) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(points.flat(), 3),
  );
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material(color));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}
function rod(group, from, to, width, color) {
  const a = new THREE.Vector3(...from),
    b = new THREE.Vector3(...to),
    delta = b.clone().sub(a);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(width, width, delta.length(), 5),
    material(color),
  );
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    delta.normalize(),
  );
  mesh.castShadow = true;
  group.add(mesh);
}
export function createTent(variant = 0) {
  const g = new THREE.Group(),
    cloth = variant ? "#c8a069" : "#648b80",
    edge = variant ? "#e3c694" : "#a0b3a0";
  // Six fabric panels make a slightly slack ridge tent, open at the front.
  for (const side of [-1, 1]) {
    const ridgeA = [0, 1.5, -1.3],
      ridgeB = [0, 1.5, 1.3],
      midA = [side * 0.6, 0.7, -1.3],
      midB = [side * 0.6, 0.7, 1.3],
      footA = [side * 1.1, 0.06, -1.3],
      footB = [side * 1.1, 0.06, 1.3];
    panel(
      g,
      [
        ridgeA,
        midA,
        midB,
        ridgeA,
        midB,
        ridgeB,
        midA,
        footA,
        footB,
        midA,
        footB,
        midB,
      ],
      cloth,
    );
    rod(g, ridgeB, footB, 0.018, edge);
    rod(g, ridgeA, footA, 0.018, edge);
    for (const z of [-1.3, 1.3]) {
      rod(
        g,
        [side * 1.03, 0.16, z],
        [side * 1.42, 0.04, z * 1.17],
        0.009,
        "#c4b99b",
      );
      rod(
        g,
        [side * 1.42, 0, z * 1.17],
        [side * 1.42, 0.14, z * 1.17],
        0.022,
        "#846343",
      );
    }
  }
  panel(
    g,
    [
      [-1.1, 0.06, -1.3],
      [0, 1.5, -1.3],
      [1.1, 0.06, -1.3],
    ],
    cloth,
  );
  panel(
    g,
    [
      [-1.04, 0.065, -1.295],
      [0, 1.43, -1.295],
      [1.04, 0.065, -1.295],
    ],
    "#384b40",
  );
  // Tied-back door panels leave a human-scale dark entrance rather than a solid triangular cap.
  panel(
    g,
    [
      [-1.1, 0.06, 1.32],
      [0, 1.5, 1.32],
      [-0.67, 0.09, 1.34],
    ],
    edge,
  );
  panel(
    g,
    [
      [1.1, 0.06, 1.32],
      [0.1, 1.38, 1.32],
      [0.77, 0.39, 1.38],
    ],
    cloth,
  );
  rod(g, [0.75, 0.3, 1.36], [0.45, 0.9, 1.34], 0.045, edge);
  rod(g, [0, 0.03, -1.31], [0, 1.53, -1.31], 0.025, "#c3ac83");
  rod(g, [0, 0.03, 1.34], [0, 1.53, 1.34], 0.025, "#c3ac83");
  rod(g, [0, 1.52, -1.34], [0, 1.52, 1.38], 0.022, edge);
  panel(
    g,
    [
      [-1.04, 0.025, -1.25],
      [1.04, 0.025, -1.25],
      [1.04, 0.025, 1.25],
      [-1.04, 0.025, -1.25],
      [1.04, 0.025, 1.25],
      [-1.04, 0.025, 1.25],
    ],
    "#6f7157",
  );
  // Bedding peeks through the opening; never changes the tent footprint.
  for (const x of [-0.5, 0.5]) {
    const roll = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 0.63, 8),
      material(variant ? "#81958a" : "#cdb487"),
    );
    roll.rotation.z = Math.PI / 2;
    roll.position.set(x, 0.18, 0.7);
    roll.castShadow = true;
    g.add(roll);
  }
  return g;
}
