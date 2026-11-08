import * as THREE from "three";
const palette = new Map();
function material(color) {
  if (!palette.has(color))
    palette.set(
      color,
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.85,
        flatShading: true,
      }),
    );
  return palette.get(color);
}
function block(g, w, h, d, color, x, y, z, bevel = 0) {
  let geometry;
  if (bevel) {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2 + bevel, -h / 2 + bevel);
    shape.lineTo(w / 2 - bevel, -h / 2 + bevel);
    shape.lineTo(w / 2 - bevel, h / 2 - bevel);
    shape.lineTo(-w / 2 + bevel, h / 2 - bevel);
    shape.closePath();
    geometry = new THREE.ExtrudeGeometry(shape, {
      depth: d - 2 * bevel,
      bevelEnabled: true,
      bevelSize: bevel,
      bevelThickness: bevel,
      bevelSegments: 1,
      steps: 1,
    });
    geometry.translate(0, 0, -d / 2 + bevel);
  } else geometry = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(geometry, material(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}
function panel(g, points, color) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(points.flat(), 3),
  );
  geometry.computeVertexNormals();
  const m = new THREE.Mesh(geometry, material(color));
  m.material.side = THREE.DoubleSide;
  m.castShadow = true;
  g.add(m);
  return m;
}
export function createPickup() {
  const g = new THREE.Group(),
    paint = "#739a90",
    light = "#9bb6a5",
    dark = "#35483e",
    glass = "#385d63",
    chrome = "#c2c6ad",
    rubber = "#3e4137";
  block(g, 1.78, 0.43, 4.35, paint, 0, 0.73, -0.02, 0.09);
  block(g, 1.63, 0.2, 3.9, dark, 0, 0.43, 0, 0.04);
  // Broad, softly bevelled nose and a short double cab keep the pickup friendly.
  block(g, 1.79, 0.35, 1.2, paint, 0, 1.02, 1.48, 0.08);
  block(g, 1.64, 0.08, 1.04, light, 0, 1.23, 1.44, 0.03);
  block(g, 1.79, 0.34, 1.8, paint, 0, 1.01, -0.08, 0.06);
  const a = [-0.88, 1.14, 0.8],
    b = [0.88, 1.14, 0.8],
    c = [0.73, 1.81, 0.45],
    d = [-0.73, 1.81, 0.45],
    e = [-0.88, 1.14, -1],
    f = [0.88, 1.14, -1],
    h = [0.73, 1.81, -0.87],
    j = [-0.73, 1.81, -0.87];
  panel(
    g,
    [a, b, c, a, c, d, e, j, h, e, h, f, a, d, j, a, j, e, b, f, h, b, h, c],
    paint,
  );
  block(g, 1.58, 0.12, 1.5, light, 0, 1.84, -0.2, 0.04);
  panel(
    g,
    [
      [-0.73, 1.24, 0.755],
      [0.73, 1.24, 0.755],
      [0.64, 1.72, 0.505],
      [-0.73, 1.24, 0.755],
      [0.64, 1.72, 0.505],
      [-0.64, 1.72, 0.505],
    ],
    glass,
  );
  panel(
    g,
    [
      [-0.7, 1.27, -0.979],
      [-0.63, 1.71, -0.894],
      [0.63, 1.71, -0.894],
      [-0.7, 1.27, -0.979],
      [0.63, 1.71, -0.894],
      [0.7, 1.27, -0.979],
    ],
    glass,
  );
  for (const side of [-1, 1]) {
    for (const [front, back] of [
      [0.61, -0.05],
      [-0.14, -0.83],
    ]) {
      panel(
        g,
        [
          [side * 0.859, 1.25, front],
          [side * 0.859, 1.25, back],
          [side * 0.76, 1.7, back + 0.035],
          [side * 0.859, 1.25, front],
          [side * 0.76, 1.7, back + 0.035],
          [side * 0.76, 1.7, front - 0.12],
        ],
        glass,
      );
    }
    block(g, 0.035, 0.055, 0.19, chrome, side * 0.9, 1.075, -0.29);
    block(g, 0.035, 0.055, 0.19, chrome, side * 0.9, 1.075, -0.79);
    block(g, 0.17, 0.18, 0.25, paint, side * 1.02, 1.27, 0.57, 0.025);
    block(g, 0.18, 0.1, 1.65, dark, side * 0.97, 0.48, -0.1, 0.025);
  }
  // An open, recessed bed: rail tops and tailgate, never a solid cargo block.
  block(g, 1.48, 0.07, 1.04, dark, 0, 0.94, -1.58);
  for (const side of [-1, 1]) {
    block(g, 0.15, 0.38, 1.25, paint, side * 0.82, 1.08, -1.58, 0.035);
    block(g, 0.19, 0.055, 1.2, dark, side * 0.82, 1.29, -1.58, 0.015);
  }
  block(g, 1.72, 0.35, 0.13, paint, 0, 1.07, -2.15, 0.035);
  block(g, 0.3, 0.05, 0.025, dark, 0, 1.19, -2.23);
  for (const side of [-1, 1])
    block(g, 0.16, 0.25, 0.05, "#b56549", side * 0.72, 1.07, -2.23, 0.015);
  // Triton-inspired shield grille, stacked lights and silver cheek trims.
  block(g, 1.03, 0.45, 0.045, dark, 0, 0.96, 2.18, 0.015);
  for (const y of [0.85, 1.02])
    block(g, 0.88, 0.035, 0.025, chrome, 0, y, 2.21);
  for (const side of [-1, 1]) {
    block(g, 0.42, 0.13, 0.08, "#f2ddb0", side * 0.65, 1.16, 2.13, 0.025);
    block(g, 0.13, 0.4, 0.07, chrome, side * 0.55, 0.9, 2.2);
    block(g, 0.28, 0.08, 0.09, chrome, side * 0.67, 0.72, 2.18);
    block(g, 0.17, 0.13, 0.06, "#e7c68d", side * 0.76, 0.85, 2.17, 0.015);
  }
  block(g, 1.6, 0.15, 0.19, dark, 0, 0.59, 2.14, 0.04);
  block(g, 0.7, 0.13, 0.06, chrome, 0, 0.62, 2.26, 0.02);
  block(g, 1.68, 0.12, 0.18, dark, 0, 0.63, -2.22, 0.03);
  for (const x of [-0.9, 0.9])
    for (const z of [-1.45, 1.4]) {
      const tire = new THREE.Mesh(
        new THREE.CylinderGeometry(0.43, 0.43, 0.29, 10),
        material(rubber),
      );
      tire.rotation.z = Math.PI / 2;
      tire.position.set(x, 0.43, z);
      tire.castShadow = true;
      tire.userData.wheel = true;
      g.add(tire);
      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.235, 0.235, 0.305, 8),
        material(chrome),
      );
      hub.userData.wheel = true;
      hub.rotation.z = Math.PI / 2;
      hub.position.copy(tire.position);
      g.add(hub);
      block(g, 0.18, 0.16, 0.76, paint, x, 0.92, z);
    }
  return g;
}
