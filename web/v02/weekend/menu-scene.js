import * as THREE from "three";
import { createAsset, compactModel, disposeModel } from "../library/catalog.js";

// A real village diorama; render only on load/resize, never run a hidden simulation.
const canvas = document.getElementById("menu-landscape");
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#a8b590");
  scene.fog = new THREE.Fog("#a8b590", 45, 95);
  scene.add(new THREE.HemisphereLight("#fff0cd", "#687d52", 2.5));
  const sun = new THREE.DirectionalLight("#ffdda2", 3.2);
  sun.position.set(-12, 22, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -22,
    right: 22,
    top: 22,
    bottom: -22,
    far: 70,
  });
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(180, 180),
    new THREE.MeshStandardMaterial({ color: "#9ba76c", roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  function prop(id, x, z, rotation = 0) {
    const model = compactModel(createAsset(id));
    model.position.set(x, 0, z);
    model.rotation.y = rotation;
    scene.add(model);
  }
  prop("house", 0, 0);
  prop("shed", -5, 2);
  prop("garden", 4, 1);
  prop("garden", 4, 5);
  prop("picnic-table", 0, 6);
  prop("rain-barrel", 2, -2);
  prop("bicycle", -2, 3);
  for (const [x, z] of [
    [-8, -5],
    [-3, -7],
    [4, -6],
    [9, -2],
    [10, 7],
    [-8, 9],
  ])
    prop("tree", x, z);
  // Trees frame a lived-in clearing rather than isolated props on a blank stage.
  for (const [x, z] of [
    [-12, -10],
    [-7, -12],
    [0, -12],
    [7, -10],
    [13, -7],
    [14, 1],
    [14, 10],
    [-13, 3],
    [-13, 12],
  ])
    prop("tree", x, z);
  const path = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 26),
    new THREE.MeshStandardMaterial({ color: "#b5a17a", roughness: 1 }),
  );
  path.rotation.x = -Math.PI / 2;
  path.rotation.z = -0.25;
  path.position.set(-2, 0.012, 8);
  path.receiveShadow = true;
  scene.add(path);
  const camera = new THREE.OrthographicCamera(-18, 18, 14, -14, 0.1, 120);
  camera.position.set(22, 23, 30);
  camera.lookAt(0, 0, 1);
  function render() {
    const w = innerWidth,
      h = innerHeight;
    renderer.setSize(w, h, false);
    const half = 9.5,
      aspect = w / h;
    // Shift the village to the right of the menu without cropping the landscape.
    camera.left = -half * aspect;
    camera.right = half * aspect;
    camera.top = half;
    camera.bottom = -half;
    camera.setViewOffset(w, h, -w * 0.2, 0, w, h);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }
  addEventListener("resize", render);
  render();
  addEventListener(
    "pagehide",
    () => {
      removeEventListener("resize", render);
      disposeModel(scene);
      renderer.dispose();
    },
    { once: true },
  );
} catch (error) {
  renderer?.dispose();
  canvas.hidden = true;
  console.warn("Menu landscape unavailable", error);
}
