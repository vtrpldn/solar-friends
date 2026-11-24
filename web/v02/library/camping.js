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
function block(group, w, h, d, color, x, y, z, yaw = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color));
  mesh.position.set(x, y, z);
  mesh.rotation.y = yaw;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}
function drum(group, radius, height, color, x, y, z, lying = false) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 8),
    material(color),
  );
  mesh.position.set(x, y, z);
  if (lying) mesh.rotation.z = Math.PI / 2;
  mesh.castShadow = true;
  group.add(mesh);
  return mesh;
}
function foldingChair(group, x, z, yaw) {
  const chair = new THREE.Group();
  block(chair, 0.5, 0.04, 0.46, "#b5563c", 0, 0.42, 0);
  block(chair, 0.5, 0.42, 0.04, "#b5563c", 0, 0.74, -0.24).rotation.x = -0.18;
  for (const side of [-0.24, 0.24]) {
    rod(chair, [side, 0, -0.26], [side, 0.44, 0.22], 0.016, "#8d8f8a");
    rod(chair, [side, 0, 0.24], [side, 0.95, -0.28], 0.016, "#8d8f8a");
  }
  chair.position.set(x, 0, z);
  chair.rotation.y = yaw;
  group.add(chair);
}
// Everything the friends bring besides the tents, in camp-local metres. The
// tents stand at (0, -3) and (3, -3) with their doors towards +z.
const GEAR = {
  bedrolls(g) {
    drum(g, 0.16, 0.7, "#7f9aa3", 1.5, 0.17, -1.75, true);
    drum(g, 0.16, 0.7, "#c58e4e", 1.5, 0.17, -2.12, true);
    block(g, 0.42, 0.5, 0.3, "#5d7353", 1.45, 0.25, -2.6, 0.3);
    block(g, 0.38, 0.44, 0.28, "#9a5a44", 1.62, 0.22, -3.0, -0.2);
  },
  cooler(g) {
    block(g, 0.78, 0.42, 0.46, "#3f7f9a", 5.9, 0.21, -1.8, 0.12);
    block(g, 0.82, 0.08, 0.5, "#e9e6d8", 5.9, 0.46, -1.8, 0.12);
  },
  water(g) {
    for (const [x, z] of [[5.55, -2.85], [6.05, -2.95], [5.8, -3.35]]) {
      drum(g, 0.17, 0.42, "#8fc3d6", x, 0.21, z);
      drum(g, 0.06, 0.08, "#2f5f86", x, 0.46, z);
    }
  },
  kitchen(g) {
    block(g, 0.9, 0.5, 0.55, "#b08a55", 5.85, 0.25, -4.6);
    block(g, 0.94, 0.04, 0.6, "#8c6a3e", 5.85, 0.52, -4.6);
    block(g, 0.34, 0.09, 0.3, "#55595a", 5.65, 0.59, -4.6);
    drum(g, 0.13, 0.14, "#c9cbc6", 5.65, 0.7, -4.6);
    block(g, 0.26, 0.2, 0.22, "#d8c9a0", 6.12, 0.64, -4.55, 0.4);
    block(g, 0.5, 0.3, 0.36, "#9b7a4a", 5.75, 0.15, -5.45, -0.25);
  },
  chairs(g) {
    foldingChair(g, -2.2, -2.0, 0.9);
    foldingChair(g, -2.35, -3.3, 1.5);
  },
  line(g) {
    rod(g, [-1.6, 0, -6.3], [-1.6, 1.75, -6.3], 0.035, "#846343");
    rod(g, [4.6, 0, -6.3], [4.6, 1.75, -6.3], 0.035, "#846343");
    rod(g, [-1.6, 1.7, -6.3], [4.6, 1.7, -6.3], 0.008, "#d8d0b8");
    for (const [x, w, h, color] of [[-0.4, 0.55, 0.6, "#e6dcc0"], [0.7, 0.4, 0.45, "#a9584a"], [1.8, 0.6, 0.7, "#6f93a8"], [3.3, 0.45, 0.5, "#e2b85a"]])
      block(g, w, h, 0.02, color, x, 1.7 - h / 2, -6.3);
    rod(g, [-2.5, 0, -5.0], [-2.5, 1.3, -5.0], 0.03, "#846343");
    rod(g, [-2.5, 1.28, -5.0], [-2.25, 1.28, -5.0], 0.012, "#846343");
    drum(g, 0.08, 0.2, "#f0d27a", -2.25, 1.14, -5.0);
    drum(g, 0.09, 0.04, "#55595a", -2.25, 1.26, -5.0);
  },
};
export const CAMP_TENT_SPOTS = { "tent-a": [0, -3], "tent-b": [3, -3] };
export function createCampGear(id) {
  const g = new THREE.Group();
  GEAR[id]?.(g);
  return g;
}
// One armful of a load: what waits by the cars and what a friend carries.
export function createCampBundle(id) {
  const g = new THREE.Group();
  if (id === "tent-a" || id === "tent-b") {
    drum(g, 0.17, 0.85, id === "tent-a" ? "#648b80" : "#c8a069", 0, 0, 0, true);
    drum(g, 0.03, 0.9, "#c3ac83", 0, 0.19, 0, true);
  } else if (id === "bedrolls") {
    drum(g, 0.15, 0.7, "#7f9aa3", 0, 0, 0, true);
    drum(g, 0.15, 0.7, "#c58e4e", 0, 0.27, 0, true);
  } else if (id === "cooler") {
    block(g, 0.7, 0.38, 0.42, "#3f7f9a", 0, 0, 0);
    block(g, 0.74, 0.07, 0.46, "#e9e6d8", 0, 0.22, 0);
  } else if (id === "water") {
    for (const x of [-0.2, 0.2]) drum(g, 0.16, 0.4, "#8fc3d6", x, 0, 0);
  } else if (id === "kitchen") block(g, 0.7, 0.42, 0.45, "#b08a55", 0, 0, 0);
  else if (id === "chairs") {
    block(g, 0.5, 0.85, 0.07, "#b5563c", 0, 0.1, -0.05);
    block(g, 0.5, 0.85, 0.07, "#a34c35", 0, 0.1, 0.05);
  } else {
    block(g, 0.5, 0.3, 0.35, "#9b7a4a", 0, 0, 0);
    drum(g, 0.08, 0.2, "#f0d27a", 0, 0.25, 0);
  }
  return g;
}
// Pegs and cord around the ground the tents will stand on, while it is being set up.
export function createCampMarker() {
  const g = new THREE.Group(),
    corners = [[-2.9, -6.9], [6.9, -6.9], [6.9, -1.1], [-2.9, -1.1]];
  corners.forEach(([x, z], i) => {
    const [nx, nz] = corners[(i + 1) % 4];
    rod(g, [x, 0, z], [x, 0.5, z], 0.035, "#846343");
    rod(g, [x, 0.42, z], [nx, 0.42, nz], 0.012, "#efe6c8");
  });
  return g;
}
