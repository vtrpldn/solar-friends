import * as THREE from "three";
import { createAsset, compactModel, disposeModel } from "../library/catalog.js";
// Render each catalog illustration once, on demand, outside the game render loop.
const cache = new Map(),
  pending = new Set();
let renderer,
  scene,
  camera,
  scheduled = false;
function render(id) {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(192, 144);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight("#fff5db", "#708258", 2.6));
    const sun = new THREE.DirectionalLight("#fff0d1", 3);
    sun.position.set(-4, 7, 6);
    scene.add(sun);
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  }
  const model = createAsset(id),
    hidden = [];
  model.traverse((node) => {
    if (!node.visible) hidden.push(node);
  });
  for (const node of hidden) {
    node.removeFromParent();
    disposeModel(node);
  }
  const root = compactModel(model);
  scene.add(root);
  const box = new THREE.Box3().setFromObject(root),
    center = box.getCenter(new THREE.Vector3()),
    size = box.getSize(new THREE.Vector3());
  const portrait = ["iara", "bento", "luz", "caua", "nina"].includes(id);
  if (portrait) center.y = box.min.y + size.y * 0.72;
  const radius = portrait
    ? size.y * 0.31
    : Math.max(size.x, size.y, size.z) * 0.83;
  camera.left = (-radius * 4) / 3;
  camera.right = (radius * 4) / 3;
  camera.top = radius;
  camera.bottom = -radius;
  camera.position
    .copy(center)
    .add(
      (portrait ? new THREE.Vector3(1, 1, 7) : new THREE.Vector3(6, 4.5, 7))
        .normalize()
        .multiplyScalar(20),
    );
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  const src = renderer.domElement.toDataURL("image/png");
  scene.remove(root);
  disposeModel(root);
  return src;
}
function drain() {
  scheduled = false;
  const id = pending.values().next().value;
  if (!id) return;
  pending.delete(id);
  try {
    const src = render(id);
    cache.set(id, src);
    document.querySelectorAll(`img[data-art="${id}"]`).forEach((img) => {
      img.src = src;
      img.classList.add("ready");
    });
  } catch (error) {
    console.warn(`UI illustration unavailable: ${id}`, error);
  }
  if (pending.size) schedule();
}
function schedule() {
  if (scheduled) return;
  scheduled = true;
  (window.requestIdleCallback || ((fn) => setTimeout(fn, 40)))(drain, {
    timeout: 1000,
  });
}
export function illustrate(img, id) {
  img.dataset.art = id;
  img.alt = "";
  img.draggable = false;
  if (cache.has(id)) {
    img.src = cache.get(id);
    img.classList.add("ready");
    return;
  }
  pending.add(id);
  schedule();
}
