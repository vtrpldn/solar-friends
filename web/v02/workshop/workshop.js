import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ASSETS, PALETTE, CELL, createAsset, disposeModel } from "./models.js";
const $ = (s) => document.querySelector(s);
const state = {
  id: "house",
  angle: 0,
  light: "day",
  surface: "materials",
  together: false,
  mode: "model",
};
const SIZE = 512,
  PPM = 48,
  ANCHOR = [256, 384];
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas: $("#world"),
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
} catch (e) {
  $("#status").textContent =
    "WebGL is unavailable. Enable graphics acceleration and reload the workshop.";
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#dce2c8");
const camera = new THREE.OrthographicCamera(-6, 6, 6, -6, 0.1, 150);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = false;
controls.minZoom = 0.35;
controls.maxZoom = 5;
controls.maxPolarAngle = Math.PI * 0.49;
const hemi = new THREE.HemisphereLight("#fff1cf", "#687547", 2.2);
scene.add(hemi);
const sun = new THREE.DirectionalLight("#ffedcf", 3);
sun.position.set(-6, 18, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {
  left: -14,
  right: 14,
  top: 14,
  bottom: -14,
  near: 0.1,
  far: 50,
});
sun.shadow.normalBias = 0.025;
sun.shadow.bias = -0.00015;
scene.add(sun);
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(160, 160),
  new THREE.MeshStandardMaterial({ color: "#b4be8d", roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.015;
ground.receiveShadow = true;
scene.add(ground);
const shadowGround = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.ShadowMaterial({ opacity: 0.23 }),
);
shadowGround.rotation.x = -Math.PI / 2;
shadowGround.position.y = -0.01;
shadowGround.receiveShadow = true;
shadowGround.visible = false;
scene.add(shadowGround);
const grid = new THREE.GridHelper(24, 12, "#78845d", "#99a776");
grid.position.y = 0.005;
grid.material.opacity = 0.45;
grid.material.transparent = true;
scene.add(grid);
const content = new THREE.Group();
scene.add(content);
let model, figure, footprint;
const clay = new THREE.MeshStandardMaterial({
  color: "#d5c6a4",
  roughness: 1,
  flatShading: true,
});
const wire = new THREE.MeshBasicMaterial({ color: "#42685c", wireframe: true });
const sourceMaterials = new Map();
function surface(value) {
  content.traverse((o) => {
    if (!o.isMesh) return;
    if (!sourceMaterials.has(o)) sourceMaterials.set(o, o.material);
    o.material =
      value === "clay"
        ? clay
        : value === "wire"
          ? wire
          : sourceMaterials.get(o);
  });
}
function iso() {
  const target = new THREE.Vector3(0, state.together ? 1 : 1.3, 0);
  controls.target.copy(target);
  camera.position
    .copy(target)
    .add(new THREE.Vector3(12, Math.sqrt(2 / 3) * 12, 12));
  camera.zoom = state.together ? 0.68 : 1;
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  controls.update();
  $("#view-subtitle").textContent = "ORTHOGRAPHIC · 2:1";
}
function lights() {
  const night = state.light === "night";
  hemi.color.set(night ? "#a3b9de" : "#fff1cf");
  hemi.intensity = night ? 0.7 : 2.2;
  sun.color.set(night ? "#b2c4ec" : "#ffedcf");
  sun.intensity = night ? 0.7 : 3;
  scene.background = new THREE.Color(night ? "#263b45" : "#dce2c8");
}
function outline(w, d) {
  const pts = [
    [-w / 2, 0.025, -d / 2],
    [w / 2, 0.025, -d / 2],
    [w / 2, 0.025, d / 2],
    [-w / 2, 0.025, d / 2],
    [-w / 2, 0.025, -d / 2],
  ].map((p) => new THREE.Vector3(...p));
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: "#d3a047" }),
  );
}
function rebuild() {
  for (const child of [...content.children]) {
    disposeModel(child);
    content.remove(child);
  }
  sourceMaterials.clear();
  if (footprint) {
    scene.remove(footprint);
    footprint.geometry.dispose();
    footprint.material.dispose();
  }
  const def = ASSETS.find((a) => a.id === state.id);
  model = createAsset(state.id);
  model.rotation.y = THREE.MathUtils.degToRad(state.angle);
  content.add(model);
  if (state.together) {
    content.remove(model);
    disposeModel(model);
    model = null;
    const layout = [
      ["house", -3, -2],
      ["shed", 3, -1],
      ["tree", 3, 4],
      ["resident", -3, 3],
    ];
    for (const [id, x, z] of layout) {
      const item = createAsset(id);
      item.position.set(x, 0, z);
      content.add(item);
    }
    for (const [x, z] of [
      [-3, 1],
      [-1, 1],
      [1, 1],
      [3, 1],
      [-1, 3],
    ]) {
      const road = createAsset("road");
      road.position.set(x, 0, z);
      content.add(road);
    }
  } else {
    footprint = outline(def.footprint[0] * CELL, def.footprint[1] * CELL);
    footprint.rotation.y = model.rotation.y;
    scene.add(footprint);
  }
  figure = createAsset("resident");
  figure.position.set(def.footprint[0] + 0.65, 0, 0.6);
  figure.visible =
    $("#human").checked && !state.together && state.id !== "resident";
  content.add(figure);
  surface(state.surface);
  grid.visible = $("#grid").checked;
  if (footprint) footprint.visible = !state.together && grid.visible;
  $("#name").textContent = state.together ? "The shared yard" : def.name;
  $("#kind").textContent = state.together
    ? "CONTEXT REVIEW"
    : def.type.toUpperCase();
  $("#description").textContent = state.together
    ? "All five assets at their real shared scale. The road connects to the house threshold; the resident is never enlarged to fill a preview."
    : def.description;
  $("#footprint").textContent = state.together
    ? "Shared 2 m grid"
    : `${def.footprint.join(" × ")} cells`;
  const b = new THREE.Box3()
    .setFromObject(state.together ? content : model)
    .getSize(new THREE.Vector3());
  $("#bounds").textContent =
    `${b.x.toFixed(2)} × ${b.z.toFixed(2)} × ${b.y.toFixed(2)} m`;
  $("#view-title").textContent = state.together ? "A place to begin" : def.name;
  document.querySelectorAll("[data-asset]").forEach((b) => {
    b.classList.toggle(
      "active",
      b.dataset.asset === state.id && !state.together,
    );
    b.setAttribute(
      "aria-pressed",
      String(b.dataset.asset === state.id && !state.together),
    );
  });
  $("#village").setAttribute("aria-pressed", String(state.together));
  document.querySelectorAll("[data-angle]").forEach((b) => {
    b.disabled = state.together;
    b.setAttribute(
      "aria-pressed",
      String(Number(b.dataset.angle) === state.angle),
    );
  });
  $("#human").disabled = state.together || state.id === "resident";
  $("#sprite-tab").disabled = state.together;
  for (const id of ["export-sheet", "export-meta", "export-model"])
    $("#" + id).disabled = state.together;
  $("#status").textContent = state.together
    ? "Context view · all assets share metre-based geometry."
    : "Study 01 · inspect freely, then compare the sprite proof.";
  if (state.mode === "sprites") proof();
}
function resize() {
  const r = $("#viewport").getBoundingClientRect();
  if (!r.width || !r.height) return;
  renderer.setSize(r.width, r.height, false);
  const h = 9.5;
  camera.left = (-h * r.width) / r.height / 2;
  camera.right = -camera.left;
  camera.top = h / 2;
  camera.bottom = -h / 2;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe($("#viewport"));
function exportCamera() {
  const c = new THREE.OrthographicCamera(
    -SIZE / PPM / 2,
    SIZE / PPM / 2,
    ANCHOR[1] / PPM,
    -(SIZE - ANCHOR[1]) / PPM,
    0.1,
    100,
  );
  c.position.set(12, Math.sqrt(2 / 3) * 12, 12);
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld();
  return c;
}
function manifest() {
  const def = ASSETS.find((a) => a.id === state.id);
  return {
    schema: "solar-friends.sprite-study.v1",
    asset: state.id,
    revision: 1,
    status: "material-study-awaiting-art-review",
    light: state.light,
    units: "metres",
    cellMetres: CELL,
    pixelsPerMetre: PPM,
    camera: {
      projection: "orthographic",
      groundRatio: "2:1",
      elevationDegrees: 30,
      azimuthDegrees: 45,
    },
    sheet: { width: SIZE * 4, height: SIZE },
    frames: [0, 90, 180, 270].map((rotation, i) => ({
      rotation,
      x: i * SIZE,
      y: 0,
      width: SIZE,
      height: SIZE,
      anchor: ANCHOR,
      footprint: rotation % 180 ? [...def.footprint].reverse() : def.footprint,
    })),
    source: "models.js",
    threeRevision: THREE.REVISION,
  };
}
function renderSheet() {
  // Separate renderer: exports cannot change the user's orbit, zoom or DPR.
  const out = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  out.setSize(SIZE, SIZE);
  out.setPixelRatio(1);
  out.shadowMap.enabled = true;
  out.shadowMap.type = THREE.PCFShadowMap;
  out.outputColorSpace = renderer.outputColorSpace;
  out.toneMapping = renderer.toneMapping;
  out.toneMappingExposure = renderer.toneMappingExposure;
  const original = {
    background: scene.background,
    ground: ground.visible,
    grid: grid.visible,
    figure: figure.visible,
    footprint: footprint?.visible,
    angle: model.rotation.y,
  };
  const sheet = document.createElement("canvas");
  sheet.width = SIZE * 4;
  sheet.height = SIZE;
  const ctx = sheet.getContext("2d");
  const frames = [];
  try {
    scene.background = null;
    ground.visible = false;
    grid.visible = false;
    figure.visible = false;
    if (footprint) footprint.visible = false;
    shadowGround.visible = true;
    surface("materials");
    const c = exportCamera();
    for (let i = 0; i < 4; i++) {
      model.rotation.y = (i * Math.PI) / 2;
      out.render(scene, c);
      ctx.drawImage(out.domElement, i * SIZE, 0);
      frames.push(out.domElement.toDataURL("image/png"));
    }
  } finally {
    scene.background = original.background;
    ground.visible = original.ground;
    grid.visible = original.grid;
    figure.visible = original.figure;
    if (footprint) footprint.visible = original.footprint;
    model.rotation.y = original.angle;
    shadowGround.visible = false;
    surface(state.surface);
    out.dispose();
    out.forceContextLoss();
  }
  return { sheet, frames };
}
function proof() {
  if (state.together) return;
  const { frames } = renderSheet();
  $("#frames").replaceChildren(
    ...frames.map((src, i) => {
      const f = document.createElement("figure");
      f.className = "frame";
      const img = document.createElement("img");
      img.src = src;
      img.alt = `${state.id}, ${i * 90} degrees, ${state.light}`;
      const caption = document.createElement("figcaption");
      caption.innerHTML = `<strong>${i * 90}°</strong><span>512 × 512 · anchor 256, 384</span>`;
      f.append(img, caption);
      return f;
    }),
  );
  $("#status").textContent =
    "Four views rendered from the same source. Ready to export.";
}
function mode(m) {
  state.mode = m;
  $("#viewport").hidden = m !== "model";
  $("#proof").hidden = m !== "sprites";
  $("#model-tab").setAttribute("aria-pressed", String(m === "model"));
  $("#sprite-tab").setAttribute("aria-pressed", String(m === "sprites"));
  if (m === "sprites") proof();
  else resize();
}
function download(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  $("#status").textContent = `Exported ${name}`;
}
function json(value, name) {
  download(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
    name,
  );
}
for (const [i, def] of ASSETS.entries()) {
  const b = document.createElement("button");
  b.dataset.asset = def.id;
  b.innerHTML = `<span class="number">0${i + 1}</span><span><strong>${def.name}</strong><small>${def.type} · study 01</small></span>`;
  b.onclick = () => {
    state.id = def.id;
    state.together = false;
    rebuild();
    iso();
  };
  $("#assets").append(b);
}
for (const [name, color] of Object.entries(PALETTE)) {
  const s = document.createElement("span");
  s.style.background = color;
  s.title = name;
  s.setAttribute("aria-label", name);
  $("#palette").append(s);
}
$("#village").onclick = () => {
  state.together = true;
  mode("model");
  rebuild();
  iso();
};
$("#model-tab").onclick = () => mode("model");
$("#sprite-tab").onclick = () => mode("sprites");
for (const b of document.querySelectorAll("[data-angle]"))
  b.onclick = () => {
    state.angle = Number(b.dataset.angle);
    rebuild();
  };
$("#light").onchange = (e) => {
  state.light = e.target.value;
  lights();
  if (state.mode === "sprites") proof();
};
$("#surface").onchange = (e) => {
  state.surface = e.target.value;
  surface(state.surface);
};
$("#grid").onchange = () => {
  grid.visible = $("#grid").checked;
  if (footprint) footprint.visible = grid.visible && !state.together;
};
$("#human").onchange = () => {
  figure.visible = $("#human").checked;
};
$("#reset").onclick = iso;
$("#iso").onclick = iso;
$("#export-sheet").onclick = () => {
  const { sheet } = renderSheet();
  sheet.toBlob((blob) => {
    if (blob) download(blob, `${state.id}-${state.light}-r01.png`);
    else $("#status").textContent = "PNG export failed. Please try again.";
  }, "image/png");
};
$("#export-meta").onclick = () =>
  json(manifest(), `${state.id}-${state.light}-r01.json`);
$("#export-model").onclick = () => {
  const source = createAsset(state.id);
  try {
    json(source.toJSON(), `${state.id}-model-r01.json`);
  } finally {
    disposeModel(source);
  }
};
controls.addEventListener("change", () => {
  $("#view-subtitle").textContent = "ORTHOGRAPHIC · FREE INSPECTION";
});
rebuild();
iso();
resize();
$("#view-subtitle").textContent = "ORTHOGRAPHIC · 2:1";
let active = true;
document.addEventListener("visibilitychange", () => {
  active = !document.hidden;
});
renderer.setAnimationLoop(() => {
  if (active && state.mode === "model") renderer.render(scene, camera);
});
