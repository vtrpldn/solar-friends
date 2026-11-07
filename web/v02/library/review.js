import * as THREE from "three";
import {
  ASSETS,
  CATEGORIES,
  createAsset,
  compactModel,
  disposeModel,
} from "./catalog.js";
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(320, 320);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#dce2c8");
scene.add(new THREE.HemisphereLight("#fff1cf", "#687547", 2.2));
const sun = new THREE.DirectionalLight("#ffedcf", 3);
sun.position.set(-6, 18, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 });
sun.shadow.normalBias = 0.025;
scene.add(sun);
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshStandardMaterial({ color: "#a9b983", roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.01;
ground.receiveShadow = true;
scene.add(ground);
const camera = new THREE.OrthographicCamera(-4.5, 4.5, 6.7, -2.3, 0.1, 100);
camera.position.set(12, 12 / Math.sqrt(1.5), 12);
camera.lookAt(0, 0, 0);
let rotation = 0,
  detail = false;
for (const c of CATEGORIES) {
  const option = document.createElement("option");
  option.textContent = c;
  document.querySelector("#category").append(option);
}
function review() {
  const filter = document.querySelector("#category").value;
  document.querySelector("#cards").replaceChildren();
  const assets = ASSETS.filter((a) => !filter || a.category === filter);
  for (const a of assets) {
    const model = compactModel(createAsset(a.id));
    model.rotation.y = (rotation * Math.PI) / 180;
    scene.add(model);
    if (detail) {
      const bounds = new THREE.Box3().setFromObject(model),
        size = bounds.getSize(new THREE.Vector3()),
        center = bounds.getCenter(new THREE.Vector3()),
        span = Math.max(1.5, size.length() * 1.3);
      camera.left = -span / 2;
      camera.right = span / 2;
      camera.top = span / 2;
      camera.bottom = -span / 2;
      camera.position
        .copy(center)
        .add(new THREE.Vector3(12, 12 / Math.sqrt(1.5), 12));
      camera.lookAt(center);
    } else {
      Object.assign(camera, { left: -4.5, right: 4.5, top: 6.7, bottom: -2.3 });
      camera.position.set(12, 12 / Math.sqrt(1.5), 12);
      camera.lookAt(0, 0, 0);
    }
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    const card = document.createElement("article"),
      link = document.createElement("a"),
      img = document.createElement("img"),
      title = document.createElement("h2"),
      caption = document.createElement("p");
    link.href = "../workshop/?asset=" + encodeURIComponent(a.id);
    img.src = renderer.domElement.toDataURL();
    img.alt = a.name + " at " + rotation + " degrees";
    title.textContent = a.name;
    caption.textContent = `${a.category} · ${a.footprint.join(" × ")} cells · inspect in 3D ↗`;
    link.append(img, title, caption);
    card.append(link);
    document.querySelector("#cards").append(card);
    scene.remove(model);
    disposeModel(model);
  }
  document.querySelector("#status").textContent =
    `${assets.length} of ${ASSETS.length} models · ${rotation}° · ${detail ? "enlarged detail previews; sizes are not comparable" : "shared scale in every card"} · click any model to orbit and inspect it.`;
}
document.querySelector("#category").onchange = () => {
  review();
  window.scrollTo(0, 0);
};
document.querySelector("#scale").onclick = () => {
  detail = !detail;
  document.querySelector("#scale").setAttribute("aria-pressed", String(detail));
  review();
};
document.querySelector("#turn").onclick = () => {
  rotation = (rotation + 90) % 360;
  review();
};
review();
