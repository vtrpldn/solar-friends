import * as THREE from "three";
// Rigs keep the approved model geometry; only articulated groups move.
function pivot(root, parts, x, y, z) {
  const p = new THREE.Group();
  p.position.set(x, y, z);
  root.add(p);
  root.updateMatrixWorld(true);
  for (const part of parts) p.attach(part);
  return p;
}
export function rigAnimal(root, kind) {
  const parts = [...root.children];
  const head = parts.filter((p) =>
    kind === "goat" ? p.position.y > 0.78 : p.position.y > 0.45,
  );
  const legs = parts.filter((p) =>
    kind === "goat"
      ? p.position.y < 0.66 && Math.abs(p.position.x) > 0.2
      : p.position.y < 0.2,
  );
  const tail = parts.filter((p) =>
    kind === "goat" ? p.position.x < -0.5 : p.position.z < -0.15,
  );
  const headJoint = pivot(
    root,
    head,
    kind === "goat" ? 0.35 : 0,
    kind === "goat" ? 0.8 : 0.36,
    kind === "goat" ? 0 : 0.12,
  );
  const joints = [];
  for (const x of kind === "goat" ? [-0.33, 0.31] : [-0.09, 0.09])
    for (const z of kind === "goat" ? [-0.18, 0.18] : [0]) {
      const selected = legs.filter(
        (p) =>
          Math.abs(p.position.x - x) < 0.08 &&
          Math.abs(p.position.z - z) < 0.08,
      );
      joints.push(pivot(root, selected, x, kind === "goat" ? 0.6 : 0.19, z));
    }
  const tailJoint = pivot(
    root,
    tail,
    kind === "goat" ? -0.5 : 0,
    kind === "goat" ? 0.76 : 0.39,
    kind === "goat" ? 0 : -0.15,
  );
  root.animalRig = { kind, head: headJoint, legs: joints, tail: tailJoint };
  return root;
}
export function collectAnimals(root) {
  const actors = [];
  root.traverse((o) => {
    if (o.animalRig)
      actors.push({
        root: o,
        rig: o.animalRig,
        x: o.position.x,
        y: o.position.y,
        z: o.position.z,
        yaw: o.rotation.y,
      });
  });
  return actors;
}
export function animateAnimals(actors, time) {
  for (let i = 0; i < actors.length; i++) {
    const a = actors[i],
      r = a.rig,
      t = time + i * 5.37,
      goat = r.kind === "goat";
    // A smooth walk envelope joins a quiet grazing interval without pose jumps.
    const walk = Math.pow(Math.max(0, Math.sin(t * 0.35)), 4);
    const stride = Math.sin(t * (goat ? 5 : 9)) * walk;
    const travel = 0.22 * Math.sin(t * 0.35) * walk;
    a.root.position.set(
      a.x + (goat ? travel : 0),
      a.y,
      a.z + (goat ? 0 : travel),
    );
    a.root.rotation.y = a.yaw + Math.sin(t * 0.7) * 0.12 * (1 - walk);
    const peck =
      Math.pow((Math.sin(t * (goat ? 1.1 : 3.1)) + 1) / 2, 4) * (1 - walk);
    r.head.rotation.set(
      goat ? 0 : peck * 0.85,
      Math.sin(t * 0.6) * 0.12,
      goat ? -peck * 0.75 : 0,
    );
    r.tail.rotation.x = Math.sin(t * 3.3) * 0.12;
    r.legs.forEach((leg, j) => {
      leg.rotation[goat ? "z" : "x"] =
        stride *
        (goat ? 0.22 : 0.3) *
        (goat ? [1, -1, -1, 1][j] : j % 2 ? 1 : -1);
    });
  }
}
