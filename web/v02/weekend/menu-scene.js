import { createTerrain } from "./terrain.js";
import { createRiver } from "./river.js";
import * as THREE from "three";
import { createAsset, compactModel, disposeModel } from "../library/catalog.js";

// A real village diorama; render only on load/resize, never run a hidden simulation.
const concept = Number(new URLSearchParams(location.search).get("concept"));
const dusk = concept === 4;
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
  scene.background = new THREE.Color(dusk ? "#263d50" : "#b9cbd0");
  scene.fog = new THREE.Fog(dusk ? "#263d50" : "#a8b590", 90, 170);
  scene.add(
    new THREE.HemisphereLight(
      dusk ? "#9db8df" : "#fff0cd",
      "#687d52",
      dusk ? 1.1 : 2.5,
    ),
  );
  const sun = new THREE.DirectionalLight(
    dusk ? "#acbce8" : "#ffdda2",
    dusk ? 0.6 : 3.2,
  );
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
  scene.add(createTerrain(42));
  const river = createRiver(42);
  scene.add(compactModel(river.root), river.current);
  function prop(id, x, z, rotation = 0) {
    const model = compactModel(createAsset(id));
    model.position.set(x, 0, z);
    model.rotation.y = rotation;
    scene.add(model);
    if (dusk && id === "house") {
      model.traverse((mesh) => {
        if (mesh.material?.userData.windowPane) {
          mesh.material = mesh.material.clone();
          mesh.material.emissive.set("#ffc675");
          mesh.material.emissiveIntensity = 1.2;
          mesh.material.userData.owned = true;
        }
      });
      const light = new THREE.PointLight("#ffce85", 7, 7);
      light.position.set(x, 1.4, z + 1.8);
      scene.add(light);
    }
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
  if (concept !== 5) scene.add(path);
  else {
    // The same two-metre road tiles players place, with right-angle junctions.
    for (let z = 4; z <= 18; z += 2) prop("road", -3, z);
    for (let x = -9; x <= 1; x += 2) if (x !== -3) prop("road", x, 4);
  }
  prop("house", -9, -4, concept === 5 ? 0 : 0.3);
  prop("house", 8, -7, concept === 5 ? Math.PI / 2 : -0.4);

  prop("orchard", -9, 6);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 180);
  camera.position.set(
    ...(concept === 2
      ? [19, 18, 29]
      : concept === 5
        ? [18, 22, 27]
        : [22, 28, 32]),
  );
  camera.lookAt(-3, 0, 1);
  function render() {
    const w = canvas.clientWidth,
      h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.setViewOffset(w, h, -w * (concept === 5 ? 0 : 0.16), 0, w, h);
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
