import { quests, buildingUnlocked, questStatus } from "./quests.js?v=ecology-1";
import { loadSettings, saveSettings } from "./settings.js";
import {
  project,
  unproject,
  TILE_HALF_WIDTH,
  TILE_HALF_HEIGHT,
} from "./projection.js";
import init, { Game } from "./pkg/solar_friends.js?v=ecology-1";
import {
  paintTerrain,
  GROUND_START,
  GROUND_SIZE,
  MAP_SIZE,
  riverCenter,
  riverBank,
} from "./terrain.js?v=river-28";
const $ = (s) => document.querySelector(s);
const settings = loadSettings();
const canvas = $("#world"),
  ctx = canvas.getContext("2d");
const kinds = {
  home: ["Home", 32, "Three beds and a good night’s rest"],
  garden: ["Garden", 12, "Plant, water, grow, then harvest"],
  kitchen: ["Kitchen", 40, "Meals taste better together"],
  well: ["Cistern", 18, "Catch rainfall · store 75 more water"],
  grove: ["Food forest", 14, "Gather two fruit with every timber trip"],
  compost: ["Compost", 20, "Two kitchen scraps enrich the next harvest"],
  square: ["Square", 36, "Gatherings bring neighbours closer"],
  workshop: ["Workshop", 48, "Craft tools for building and harvests"],
};
const tasks = {
  arrive: "Arriving at our new home",
  idle: "Enjoying a quiet moment",
  sleep: "Sleeping until morning",
  eat: "Sitting down to eat",
  rest: "Resting in the shade",
  garden: "Tending the garden",
  build: "Building together",
  gather: "Gathering timber",
  cook: "Making a shared meal",
  water: "Collecting river water",
  socialize: "Finding some company",
  compost: "Turning kitchen scraps",
  craft: "Crafting useful tools",
  gathering: "Sharing food and stories",
};
const colors = ["#d8a044", "#588b83", "#d27a59", "#6a8e58", "#8580a0"];
const atlas = new Image();
atlas.src = "art/village-atlas-isometric.png";
const gardenArt = new Image();
gardenArt.src = "art/garden-simple-isometric.png";
const questArt = Object.fromEntries(
  ["compost", "square", "workshop"].map((kind) => {
    const image = new Image();
    image.src = `art/${kind}-isometric.png`;
    return [kind, image];
  }),
);
const terrain = new Image();
terrain.src = "art/terrain-atlas.png";
const peopleArt = new Image();
peopleArt.src = "art/residents-cistern.png";
const animations = ["iara", "bento", "luz", "caua", "nina"].map((name) => {
  const image = new Image();
  image.src = `art/animations/${name}.png`;
  return image;
});
let groundLayer,
  groundKey = null;
const forestArt = new Image();
forestArt.src = "art/mata-atlantica-atlas.png";
const forestSpecies = [
  { name: "Jequitibá-rosa", width: 145 },
  { name: "Juçara", width: 112 },
  { name: "Embaúba", width: 113 },
  { name: "Pau-brasil", width: 125 },
];
const cisternArt = new Image();
cisternArt.src = "art/cistern-isometric.png";
let game,
  state,
  selected = null,
  tool = null,
  speed = 1,
  paused = false,
  zoom = 1,
  pan = { x: 0, y: 0 };
let width = 0,
  height = 0,
  scale = 1,
  origin = { x: 0, y: 0 },
  pointer = null,
  drag = null,
  last = 0,
  uiElapsed = 0,
  saveElapsed = 0,
  time = 0,
  lastTask = null,
  toastTimer;
let response = "",
  encouragable = false;
const saveKey = "solar-friends-v2";
const escapeHtml = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const hash = (x, y = 0) => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
};
function avatar(id) {
  return `<span class="avatar" style="background:${colors[id]}20"><canvas data-portrait="${id}" width="96" height="108" aria-hidden="true"></canvas></span>`;
}
function paintPortraits() {
  const cell = peopleArt.width / 3;
  for (const portrait of document.querySelectorAll("[data-portrait]")) {
    const id = Number(portrait.dataset.portrait);
    portrait
      .getContext("2d")
      .drawImage(
        peopleArt,
        ((id % 3) + 0.28) * cell,
        (Math.floor(id / 3) + 0.01) * cell,
        cell * 0.56,
        cell * 0.63,
        0,
        0,
        96,
        108,
      );
  }
}
function contactShadow(x, y, rx, ry, opacity = 0.2) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(rx, ry);
  const shade = ctx.createRadialGradient(0, 0, 0.1, 0, 0, 1);
  shade.addColorStop(0, `rgba(53,65,31,${opacity})`);
  shade.addColorStop(1, "rgba(53,65,31,0)");
  ctx.fillStyle = shade;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
}
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("#toast").hidden = true), 4500);
}
function save(manual = false) {
  try {
    localStorage.setItem(saveKey, game.snapshot());
    $("#save-status").textContent = "Saved on this device";
    if (manual) toast("Your village is saved. Come back whenever you like.");
  } catch {
    $("#save-status").textContent = "Saving unavailable";
    if (manual)
      toast(
        "This browser could not save. Keep this tab open to preserve your village.",
      );
  }
}
function resize() {
  const r = canvas.getBoundingClientRect();
  width = r.width;
  height = r.height;
  const dpr = Math.min(devicePixelRatio, 2);
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function iso(x, y) {
  return project(x, y, origin, scale);
}
function uniso(x, y) {
  return unproject(x, y, origin, scale);
}
function polygon(points, fill, stroke) {
  ctx.beginPath();
  points.forEach((p, i) =>
    i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]),
  );
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
function ellipse(x, y, rx, ry, color) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}
function line(x, y, x2, y2, color, w = 1) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.stroke();
}
function tile(x, y, fill, stroke) {
  const p = iso(x, y),
    a = TILE_HALF_WIDTH * scale,
    b = TILE_HALF_HEIGHT * scale;
  polygon(
    [
      [p.x, p.y - b],
      [p.x + a, p.y],
      [p.x, p.y + b],
      [p.x - a, p.y],
    ],
    fill,
    stroke,
  );
}
function drawPlacementGrid() {
  if (!settings.placementGrid || !tool) return;
  ctx.save();
  ctx.beginPath();
  // Cell centers are integer coordinates, matching unproject's rounding.
  for (let edge = 0.5; edge <= MAP_SIZE - 1.5; edge++) {
    for (const [a, b] of [
      [iso(edge, 0.5), iso(edge, MAP_SIZE - 1.5)],
      [iso(0.5, edge), iso(MAP_SIZE - 1.5, edge)],
    ]) {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
  }
  ctx.strokeStyle = "rgba(255, 250, 218, 0.65)";
  ctx.lineWidth = 1;
  ctx.stroke();
  // The arrival spot remains reserved; the hover preview checks other limits.
  for (let x = 9; x <= 11; x++)
    for (let y = 12; y <= 14; y++) tile(x, y, "rgba(140, 81, 53, 0.15)");
  ctx.restore();
}
function tree(x, y, s = 1, species = 0) {
  const p = iso(x, y);
  const w = forestSpecies[species].width * s * scale;
  const cell = forestArt.width / 2;
  contactShadow(p.x, p.y + 2 * scale, 23 * s * scale, 11.5 * s * scale, 0.16);
  ctx.drawImage(
    forestArt,
    (species % 2) * cell,
    Math.floor(species / 2) * cell,
    cell,
    cell,
    p.x - w / 2,
    p.y - w * 0.85,
    w,
    w,
  );
}
function sprite(kind, x, y, size, alpha = 1) {
  if (questArt[kind]) {
    const p = iso(x, y),
      w = size * scale;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(questArt[kind], p.x - w / 2, p.y - w * 0.76, w, w);
    ctx.restore();
    return;
  }
  if (kind === "garden") {
    const p = iso(x, y),
      w = size * scale * 1.18;
    // Calibrate the painted bed's ~20:11 footprint to the map's 2:1 axes.
    const h = w * (10 / 11);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(gardenArt, p.x - w / 2, p.y - h * 0.52, w, h);
    ctx.restore();
    return;
  }
  const p = iso(x, y),
    cell = atlas.width / 2;
  const index = { home: 0, kitchen: 1, garden: 2, grove: 3 }[kind];
  if (index === undefined || !atlas.complete || !atlas.naturalWidth) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const w = size * scale * 1.18;
  const groundAnchor = { home: 0.7, kitchen: 0.7, garden: 0.59, grove: 0.74 }[
    kind
  ];
  ctx.drawImage(
    atlas,
    (index % 2) * cell,
    Math.floor(index / 2) * cell,
    cell,
    cell,
    p.x - w / 2,
    p.y - w * groundAnchor,
    w,
    w,
  );
  ctx.restore();
}
function cistern(x, y, alpha = 1) {
  const p = iso(x, y),
    w = 77 * scale;
  contactShadow(p.x, p.y + 2 * scale, 25 * scale, 12.5 * scale);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(cisternArt, p.x - w / 2, p.y - w * 0.82, w, w);
  ctx.restore();
}
function drawGrowingBed(b) {
  const corners = [
    [-0.8, -0.8],
    [0.8, -0.8],
    [0.8, 0.8],
    [-0.8, 0.8],
  ].map(([x, y]) => iso(b.x + x, b.y + y));
  ctx.save();
  ctx.beginPath();
  corners.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = b.crop.moisture > 0 ? "#805a40" : "#b18a60";
  ctx.fill();
  ctx.strokeStyle = "#c6a273";
  ctx.lineWidth = 4 * scale;
  ctx.stroke();
  if (b.crop.planted) {
    const growth = 2 + (b.crop.growth / 180) * 7;
    for (let x = -0.5; x <= 0.5; x += 0.5) {
      for (let y = -0.5; y <= 0.5; y += 0.5) {
        const p = iso(b.x + x, b.y + y);
        ctx.fillStyle = b.crop.moisture > 0 ? "#648447" : "#999052";
        ctx.beginPath();
        ctx.ellipse(
          p.x,
          p.y - (growth * scale) / 2,
          growth * scale,
          (growth * scale) / 2,
          -0.5,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
  }
  ctx.restore();
}
function drawResourceLabel(p, label, fraction, color) {
  const w = 104 * scale,
    y = p.y + 19 * scale;
  ctx.save();
  ctx.fillStyle = "#fffbee";
  ctx.fillRect(p.x - w / 2, y, w, 23 * scale);
  ctx.font = `${10 * scale}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillStyle = "#40503c";
  ctx.fillText(label, p.x, y + 12 * scale);
  ctx.fillStyle = "#dfdfcc";
  ctx.fillRect(p.x - w / 2, y + 20 * scale, w, 3 * scale);
  ctx.fillStyle = color;
  ctx.fillRect(p.x - w / 2, y + 20 * scale, w * fraction, 3 * scale);
  ctx.restore();
}
function building(b) {
  const p = iso(b.x, b.y),
    complete = b.progress >= 100;
  contactShadow(p.x + 9 * scale, p.y + 4 * scale, 50 * scale, 17 * scale, 0.16);
  if (b.kind === "well") cistern(b.x, b.y, complete ? 1 : 0.45);
  else if (complete && b.kind === "garden" && b.crop.growth < 180)
    drawGrowingBed(b);
  else
    sprite(
      b.kind,
      b.x,
      b.y,
      b.kind === "garden" ? 119 : b.kind === "grove" ? 105 : 152,
      complete ? 1 : 0.4,
    );
  if (complete && b.kind === "garden") {
    const crop = b.crop;
    const label = !crop.planted
      ? "Ready to plant"
      : crop.growth >= 180
        ? "Ready to harvest"
        : crop.moisture <= 0
          ? "Needs water"
          : `Growing ${Math.floor((crop.growth / 180) * 100)}%`;
    drawResourceLabel(
      p,
      label,
      crop.growth / 180,
      crop.moisture <= 0 ? "#b87943" : "#72915a",
    );
  }
  if (complete && b.kind === "well") {
    drawResourceLabel(
      p,
      "Water storage",
      Math.min(1, state.village.water / state.environment.water_capacity),
      "#568d9e",
    );
  }
  if (!complete) {
    const s = scale;
    // Upright posts and beams follow the same ground axes as the building.
    const corners = [
      [-0.9, -0.9],
      [0.9, -0.9],
      [0.9, 0.9],
      [-0.9, 0.9],
    ].map(([x, y]) => iso(b.x + x, b.y + y));
    const scaffoldHeight = (b.kind === "garden" ? 24 : 65) * s;
    for (let i = 0; i < corners.length; i++) {
      const a = corners[i],
        next = corners[(i + 1) % corners.length];
      line(a.x, a.y, a.x, a.y - scaffoldHeight, "#ae8757", 2.5 * s);
      line(
        a.x,
        a.y - scaffoldHeight,
        next.x,
        next.y - scaffoldHeight,
        "#bd965f",
        2.5 * s,
      );
    }
    ctx.fillStyle = "#fffcf0";
    ctx.fillRect(p.x - 27 * s, p.y + 9 * s, 54 * s, 5 * s);
    ctx.fillStyle = "#7c9859";
    ctx.fillRect(p.x - 27 * s, p.y + 9 * s, (54 * s * b.progress) / 100, 5 * s);
  }
}
function resident(r) {
  const p = iso(r.x, r.y),
    s = scale;
  const moving = Math.hypot(r.target_x - r.x, r.target_y - r.y) > 0.1;
  const bob = 0;
  const indoors =
    !moving &&
    r.task === "sleep" &&
    state.village.buildings.filter(
      (b) => b.kind === "home" && b.progress >= 100,
    )[Math.floor(r.id / 3)];
  if (indoors) return;
  const isSelected = selected === r.id;
  contactShadow(p.x, p.y + 2 * s, 10 * s, 4 * s, 0.25);
  if (isSelected) {
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 13 * s, 6 * s, 0, 0, 7);
    ctx.strokeStyle = "#fff5cd";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  const py = p.y + bob;
  const sheet = animations[r.id];
  const row = moving
    ? 0
    : ["build", "craft", "compost"].includes(r.task)
      ? 1
      : ["rest", "socialize", "eat", "sleep", "gathering"].includes(r.task)
        ? 3
        : 2;
  const fps = [8, 5, 1.5, 1][row];
  const frame =
    r.task === "sleep" && !moving ? 3 : Math.floor(time * fps + r.id) % 4;
  const cellW = sheet.width / 4,
    cellH = sheet.height / 4;
  const w = 43 * s;
  ctx.save();
  ctx.translate(p.x, py);
  if (r.target_x - r.target_y < r.x - r.y) ctx.scale(-1, 1);
  ctx.drawImage(
    sheet,
    frame * cellW,
    row * cellH,
    cellW,
    cellH,
    -w / 2,
    -w * 0.97,
    w,
    w,
  );
  ctx.restore();
  if (isSelected) {
    ctx.font = `600 ${11 * s}px 'DM Sans',sans-serif`;
    ctx.textAlign = "center";
    const tw = ctx.measureText(r.name).width;
    ctx.fillStyle = "#fffcf2";
    ctx.beginPath();
    ctx.roundRect(
      p.x - tw / 2 - 8 * s,
      py - 64 * s,
      tw + 16 * s,
      18 * s,
      5 * s,
    );
    ctx.fill();
    ctx.fillStyle = "#354f38";
    ctx.fillText(r.name, p.x, py - 51 * s);
  } else if (!moving && ["rest", "sleep"].includes(r.task)) {
    ctx.fillStyle = "#7e8b65";
    ctx.font = `${12 * s}px Georgia`;
    ctx.fillText("z", p.x + 8 * s, py - 30 * s);
  }
}
const flora = [];
for (let i = 0; i < 170; i++) {
  let x = hash(i, 1) * 32 - 2,
    y = hash(i, 2) * 32 - 2;
  if (x > 1 && x < 27 && y > 1 && y < 27) continue;
  if (Math.abs(x - riverCenter(y)) < 1.8) continue;
  flora.push({
    x,
    y,
    species: i % forestSpecies.length,
    size: 0.65 + hash(i, 3) * 0.55,
  });
}
function render() {
  scale = Math.min(width / 1900, height / 1050) * zoom;
  scale = Math.max(0.45, scale);
  origin = { x: width * 0.49 + pan.x, y: height * 0.5 - 459 * scale + pan.y };
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#dfe6c9";
  ctx.fillRect(0, 0, width, height);
  const key = state.village.buildings
    .map((b) => `${b.id}:${b.kind}:${b.x}:${b.y}`)
    .join("|");
  if (groundKey !== key) {
    groundLayer = paintTerrain(terrain, state.village.buildings);
    groundKey = key;
  }
  ctx.save();
  ctx.transform(
    TILE_HALF_WIDTH * scale,
    TILE_HALF_HEIGHT * scale,
    -TILE_HALF_WIDTH * scale,
    TILE_HALF_HEIGHT * scale,
    origin.x,
    origin.y,
  );
  ctx.drawImage(
    groundLayer,
    GROUND_START,
    GROUND_START,
    GROUND_SIZE,
    GROUND_SIZE,
  );
  ctx.restore();
  // Sparse currents move along the channel in world coordinates.
  for (let i = 0; i < 32; i++) {
    const y = ((i * 0.93 + time * 0.12) % 29) - 0.5;
    const offset = Math.sin(i * 2.3) * 0.7;
    const a = iso(riverCenter(y) + offset, y);
    const b = iso(riverCenter(y + 0.35) + offset, y + 0.35);
    line(a.x, a.y, b.x, b.y, "#d2eee34d", Math.max(0.6, scale));
  }
  drawPlacementGrid();
  // The communal paths remain visible beneath individually placed structures.
  const objects = [
    ...flora.map((f) => ({
      depth: f.x + f.y,
      draw: () => tree(f.x, f.y, f.size, f.species),
    })),
    ...state.village.buildings.map((b) => ({
      depth: b.x + b.y,
      draw: () => building(b),
    })),
    ...state.residents.map((r) => ({
      depth: r.x + r.y + 0.6,
      draw: () => resident(r),
    })),
  ];
  objects.sort((a, b) => a.depth - b.depth).forEach((o) => o.draw());
  if (tool && pointer) {
    const t = uniso(pointer.x, pointer.y),
      valid =
        t.x >= 1 &&
        t.x <= MAP_SIZE - 2 &&
        t.y >= 1 &&
        t.y <= MAP_SIZE - 2 &&
        !riverBank(t.x, t.y) &&
        !(Math.abs(t.x - 10) < 1.5 && Math.abs(t.y - 13) < 1.5) &&
        !state.village.buildings.some(
          (b) => Math.abs(b.x - t.x) < 2 && Math.abs(b.y - t.y) < 2,
        ) &&
        state.village.wood >= kinds[tool][1];
    tile(
      t.x,
      t.y,
      valid ? "#f5f1b299" : "#cd745a88",
      valid ? "#fff8cf" : "#b75943",
    );
    if (tool === "well") cistern(t.x, t.y, 0.6);
    else sprite(tool, t.x, t.y, tool === "garden" ? 119 : 152, 0.55);
  }
  // Tiny birds drifting past the clearing.
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    for (let i = 0; i < 3; i++) {
      const x = ((time * 13 + i * 130) % (width + 100)) - 50,
        y = height * 0.2 + Math.sin(time * 0.25 + i) * 20;
      ctx.beginPath();
      ctx.moveTo(x - 5, y);
      ctx.quadraticCurveTo(x - 2, y - 3 - Math.sin(time * 4), x, y);
      ctx.quadraticCurveTo(x + 2, y - 3 - Math.sin(time * 4), x + 5, y);
      ctx.strokeStyle = "#697b5380";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
  const hour = (state.village.minutes % 1440) / 60;
  // Continuous tropical daylight: sunrise around 06:00, sunset around 18:00.
  const altitude = Math.sin(((hour - 6) / 12) * Math.PI);
  const darkness = Math.max(0, Math.min(1, (0.18 - altitude) / 0.65));
  const twilight = Math.max(0, 1 - Math.abs(altitude) / 0.3) * 0.16;
  ctx.fillStyle = `rgba(237,150,84,${twilight})`;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = `rgba(17,31,65,${darkness * 0.62})`;
  ctx.fillRect(0, 0, width, height);
  if (darkness > 0) {
    for (const b of state.village.buildings.filter(
      (b) => b.progress >= 100 && ["home", "kitchen"].includes(b.kind),
    )) {
      const p = iso(b.x, b.y);
      const glow = ctx.createRadialGradient(
        p.x,
        p.y - 22 * scale,
        0,
        p.x,
        p.y - 22 * scale,
        60 * scale,
      );
      glow.addColorStop(0, `rgba(255,204,100,${darkness * 0.35})`);
      glow.addColorStop(1, "rgba(255,204,100,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(
        p.x - 60 * scale,
        p.y - 82 * scale,
        120 * scale,
        120 * scale,
      );
      if (
        b.kind === "home" &&
        state.residents.some(
          (r) =>
            r.task === "sleep" &&
            Math.hypot(r.x - b.x - 0.75, r.y - b.y - 0.75) < 0.3,
        )
      ) {
        ctx.fillStyle = "#fff1bf";
        ctx.font = `${13 * scale}px Georgia`;
        ctx.textAlign = "center";
        ctx.fillText("z z", p.x, p.y - 87 * scale);
      }
    }
  }
}
function selectPerson(id) {
  selected = id;
  response = "";
  encouragable = false;
  $("#person").hidden = false;
  const r = state.residents.find((p) => p.id === id);
  $("#person").innerHTML =
    `<button class="close-person" aria-label="Close resident details">×</button><span class="eyebrow">A NEIGHBOUR, NOT A NUMBER</span><h2>${escapeHtml(r.name)}</h2><p class="traits">${escapeHtml(r.trait_name)}</p><p class="quote"></p>${["Energy", "Fullness", "Connection"].map((n) => `<div class="stat" data-stat="${n}"><span>${n}</span><div class="meter"><i></i></div><span class="value"></span></div>`).join("")}<p class="request-title">ASK FOR A HAND</p><div class="requests">${[
      ["garden", "Tend garden"],
      ["build", "Help build"],
      ["gather", "Gather timber"],
      ["water", "Collect river water"],
      ["cook", "Make a meal"],
      ["rest", "Take a rest"],
      ["socialize", "Spend time together"],
      ["compost", "Turn scraps"],
      ["craft", "Craft tools · 8 timber"],
    ]
      .map(([t, n]) => `<button data-task="${t}">${n}</button>`)
      .join(
        "",
      )}</div><p class="friendship-note"></p><div class="response" role="status" hidden></div><button class="persuade" hidden>Explain why the community needs help</button>`;
  $(".close-person").onclick = () => {
    selected = null;
    $("#person").hidden = true;
    updateUI();
  };
  $(".requests").onclick = (e) => {
    const b = e.target.closest("[data-task]");
    if (b) request(b.dataset.task, false);
  };
  $(".persuade").onclick = () => request(lastTask, true);
  updateUI();
}
function request(task, encourage) {
  lastTask = task;
  response = game.request(selected, task, encourage);
  encouragable = response.includes("talk about why");
  state = JSON.parse(game.snapshot());
  updateUI();
}
function replaceMarkup(element, html) {
  if (element._markup !== html) {
    element.innerHTML = html;
    element._markup = html;
  }
}
function objectiveMarkup(objectives, completed = false) {
  const current = completed ? -1 : objectives.findIndex((o) => !o.done);
  return objectives
    .map(
      (o, i) =>
        `<div class="objective ${completed || o.done ? "done" : ""} ${i === current ? "current" : ""}"><span>${completed || o.done ? "✓" : i + 1}</span><b>${o.label}</b><small>${completed ? o.target : o.value}/${o.target}</small></div>`,
    )
    .join("");
}
function openJournal() {
  updateQuests();
  $("#quest-dialog").showModal();
}
function updateQuests() {
  const v = state.village,
    p = v.progress;
  const id = p.tracked,
    quest = quests[id],
    done = p.completed[id];
  const objectives = quest.objectives(v),
    next = objectives.find((o) => !o.done);
  $("#tutorial-count").textContent = `${quest.theme} · QUEST ${id + 1} OF 4`;
  $("#tutorial-title").textContent = quest.title;
  $("#tutorial-copy").textContent = done
    ? quest.after
    : next?.hint || quest.story;
  $("#quest-speaker").textContent = done
    ? "✓ Quest complete"
    : `A wish from ${quest.person}`;
  $("#quest-reward").textContent =
    `${done ? "Unlocked" : "Reward"}: ${quest.reward}`;
  $("#quest-progress").value = done
    ? objectives.length
    : objectives.filter((o) => o.done).length;
  $("#quest-progress").max = objectives.length;
  $("#quest-progress").setAttribute(
    "aria-label",
    `${quest.title} objectives completed`,
  );
  replaceMarkup($("#objectives"), objectiveMarkup(objectives, done));
  const kind = done ? quest.building : next?.build;
  const count = kind
    ? v.buildings.filter((b) => b.kind === kind && b.progress >= 100).length
    : 0;
  const planned =
    kind && v.buildings.some((b) => b.kind === kind && b.progress < 100);
  const enough = kind && (kind === "home" ? count >= next?.target : count > 0);
  const action = $("#tutorial-action");
  action.hidden = (!kind || planned || enough) && !(!done && next?.action);
  action.textContent = kind
    ? `Plan ${kinds[kind][0].toLowerCase()} · ${kinds[kind][1]} timber`
    : "";
  if (!done && next?.action) {
    action.textContent =
      next.action === "supper"
        ? "Host welcome supper · 5 meals"
        : "Set aside 24 timber";
    action.onclick = () => {
      const result =
        next.action === "supper"
          ? game.host_gathering()
          : game.contribute_workshop_timber();
      toast(
        result === "ok"
          ? next.action === "supper"
            ? "Welcome supper is starting at the kitchen."
            : "The tool library timber is set aside."
          : result,
      );
      state = JSON.parse(game.snapshot());
      updateUI();
      save();
    };
  } else action.onclick = () => setTool(kind);
  $("#open-journal").textContent =
    done && id === 0
      ? "Choose our next quest →"
      : `Village journal · ${p.completed.filter(Boolean).length}/4`;
  $("#village-needs").textContent =
    `${Math.min(5, v.buildings.filter((b) => b.kind === "home" && b.progress >= 100).length * 3)}/5 beds · ${v.meals} prepared meals`;
  $("#quest-total").textContent =
    `${p.completed.filter(Boolean).length} of 4 shared dreams fulfilled`;
  replaceMarkup(
    $("#quest-list"),
    quests
      .map((q, i) => {
        const status = questStatus(v, i),
          locked = i > 0 && !p.completed[0];
        return `<article class="quest-card ${p.completed[i] ? "complete" : ""} ${locked ? "locked" : ""}">
      <div class="quest-card-art ${q.art}">${i ? `<img src="art/${q.art}-isometric.png" alt="${kinds[q.building][0]} quest reward">` : "<span>☀</span>"}</div>
      <div class="quest-card-content"><span class="eyebrow">${q.theme} · ${status}</span><h3>${q.title}</h3><p class="quest-story">${q.story}</p>
      ${objectiveMarkup(q.objectives(v), p.completed[i])}
      <p class="journal-reward"><b>${p.completed[i] ? "Unlocked" : "Unlocks"}</b> ${q.reward}</p>
      ${p.completed[i] ? `<p class="quest-after">${q.after}</p>` : ""}
      <button data-track="${i}" ${locked ? "disabled" : ""}>${locked ? "Complete A Shared Beginning first" : i === id ? "Following this quest" : p.completed[i] ? "Explore the reward →" : "Follow this quest →"}</button></div></article>`;
      })
      .join(""),
  );
  const has = (kind) =>
    v.buildings.some((b) => b.kind === kind && b.progress >= 100);
  $("#village-craft").hidden =
    !has("compost") && !has("workshop") && !has("square") && !p.gathering_until;
  $("#compost-stock").hidden = !has("compost");
  $("#compost-stock").textContent =
    `${p.scraps} scraps → ${p.compost} compost · ${p.enriched_harvests} enriched harvests`;
  $("#tools-control").hidden = !has("workshop");
  $("#tools-stock").textContent =
    `${p.tool_uses} tool uses · ${p.tools_crafted} sets crafted`;
  $("#use-tools").checked = p.use_tools;
  $("#gathering-control").hidden = !has("square") && !p.gathering_until;
  $("#gathering-status").textContent =
    p.gathering_until > v.minutes
      ? `Gathering in progress · ${Math.ceil(p.gathering_until - v.minutes)} minutes left`
      : `${p.gatherings} gatherings shared · costs 5 prepared meals`;
  $("#host-gathering").disabled =
    p.gathering_until > v.minutes ||
    p.gathering_day === Math.floor(v.minutes / 1440);
  $("#host-gathering").textContent =
    p.gathering_until > v.minutes
      ? "Neighbours are gathering…"
      : p.gathering_day === Math.floor(v.minutes / 1440)
        ? "Next gathering tomorrow"
        : "Host a gathering";
}
function updateUI() {
  const v = state.village;
  for (const k of ["wood", "food", "water"])
    $("#" + k).textContent = Math.floor(v[k]);
  $("#happiness").textContent =
    Math.round(state.residents.reduce((s, r) => s + r.happiness, 0) / 5) + "%";
  const mins = Math.floor(v.minutes) % 1440;
  $("#date").textContent =
    `Day ${Math.floor(v.minutes / 1440) + 1} · ${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  const night = mins < 360 || mins >= 1140;
  $(".season-icon").textContent = night ? "☾" : "☀";
  $(".season small").textContent = night
    ? "Warm season · quiet night"
    : mins < 480
      ? "Morning · breakfast & waking up"
      : mins < 720
        ? "Daylight · community work"
        : mins < 840
          ? "Midday · lunch & a little rest"
          : mins < 1050
            ? "Afternoon · community work"
            : mins < 1200
              ? "Evening · dinner together"
              : "Evening · time to unwind";
  const env = state.environment;
  const gardens = v.buildings.filter(
    (b) => b.kind === "garden" && b.progress >= 100,
  );
  const counts = { plant: 0, thirsty: 0, growing: 0, harvest: 0 };
  for (const b of gardens) {
    const c = b.crop;
    counts[
      !c.planted
        ? "plant"
        : c.growth >= 180
          ? "harvest"
          : c.moisture <= 0
            ? "thirsty"
            : "growing"
    ]++;
  }
  $("#water-capacity").textContent = `Water / ${env.water_capacity}`;
  $("#weather-status").textContent = env.raining
    ? "Afternoon rain · filling cisterns"
    : env.dry_day
      ? "Dry day · collect river water"
      : mins >= 1020
        ? "Rain has passed · check water stores"
        : "Rain expected 14:00–17:00";
  $("#garden-status").textContent = gardens.length
    ? [
        counts.plant && `${counts.plant} to plant`,
        counts.thirsty && `${counts.thirsty} need water`,
        counts.growing && `${counts.growing} growing`,
        counts.harvest && `${counts.harvest} to harvest`,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Build a garden to start growing food.";
  if (env.raining) $(".season-icon").textContent = "☂";
  $("#latest-event").textContent = v.events[0];
  updateQuests();
  for (const r of state.residents) {
    const el = $(`[data-resident="${r.id}"]`);
    el.classList.toggle("selected", r.id === selected);
    el.querySelector("small").textContent = tasks[r.task] || r.task;
    el.querySelector(".energy-tiny i").style.width = r.energy + "%";
  }
  if (selected !== null) {
    const r = state.residents.find((r) => r.id === selected);
    $("#person .quote").textContent = "“" + r.reason + "”";
    const stats = {
      Energy: r.energy,
      Fullness: 100 - r.hunger,
      Connection: r.social,
    };
    for (const [n, v] of Object.entries(stats)) {
      const el = $(`[data-stat="${n}"]`);
      el.querySelector("i").style.width = v + "%";
      el.querySelector(".value").textContent = Math.round(v);
    }
    const friendships = state.village.progress.friendships;
    const friends = state.residents.filter(
      (other) => other.id !== r.id && friendships[r.id * 5 + other.id] > 0,
    );
    $(".friendship-note").textContent = friends.length
      ? "Shared memories: " +
        friends
          .map((other) => `${other.name} (${friendships[r.id * 5 + other.id]})`)
          .join(", ")
      : "Friendships grow when neighbours attend gatherings together.";
    for (const task of ["compost", "craft"]) {
      $(`[data-task="${task}"]`).hidden = !state.village.buildings.some(
        (b) =>
          b.kind === (task === "craft" ? "workshop" : "compost") &&
          b.progress >= 100,
      );
    }
    $(".response").hidden = !response;
    $(".response").textContent = response;
    $(".persuade").hidden = !encouragable;
  }
  for (const button of document.querySelectorAll(".build-tool")) {
    const unlocked = buildingUnlocked(v, button.dataset.kind);
    button.classList.toggle("locked", !unlocked);
    const quest = { grove: 0, compost: 1, square: 2, workshop: 3 }[
      button.dataset.kind
    ];
    button.querySelector("small").textContent = unlocked
      ? `⌁ ${kinds[button.dataset.kind][1]}`
      : "Quest reward";
    button.title = unlocked
      ? kinds[button.dataset.kind][2]
      : `Complete ${quests[quest].title} to unlock`;
    button.setAttribute(
      "aria-label",
      unlocked
        ? `Build ${kinds[button.dataset.kind][0]}, ${kinds[button.dataset.kind][1]} timber`
        : `View quest to unlock ${kinds[button.dataset.kind][0]}`,
    );
    button.classList.toggle("active", button.dataset.kind === tool);
    button.setAttribute("aria-pressed", String(button.dataset.kind === tool));
  }
}
function setTool(kind) {
  if (kind && !buildingUnlocked(state.village, kind)) {
    openJournal();
    return;
  }
  tool = tool === kind ? null : kind;
  $("#placement").hidden = !tool;
  $("#placement").textContent = tool
    ? `Place ${kinds[tool][0].toLowerCase()} · ${kinds[tool][1]} timber · Esc to cancel`
    : "";
  canvas.style.cursor = tool ? "crosshair" : "grab";
  updateUI();
}
function togglePause() {
  paused = !paused;
  $("#pause").textContent = paused ? "▶" : "Ⅱ";
  $("#pause").setAttribute(
    "aria-label",
    paused ? "Resume simulation" : "Pause simulation",
  );
  $("#pause").classList.toggle("active", paused);
}
function frame(stamp) {
  if (!last) last = stamp;
  const dt = Math.min((stamp - last) / 1000, 0.1);
  last = stamp;
  const running =
    !paused && !document.hidden && !document.querySelector("dialog[open]");
  if (running) {
    time += dt * speed;
    let remaining = dt * speed;
    while (remaining > 0) {
      const step = Math.min(remaining, 0.1);
      game.tick(step);
      remaining -= step;
    }
  }
  state = JSON.parse(game.snapshot());
  render();
  uiElapsed += dt;
  saveElapsed += dt;
  if (uiElapsed > 0.3) {
    updateUI();
    uiElapsed = 0;
  }
  if (saveElapsed > 15) {
    save();
    saveElapsed = 0;
  }
  requestAnimationFrame(frame);
}
function setup() {
  $("#residents").innerHTML = state.residents
    .map(
      (r) =>
        `<button class="resident" data-resident="${r.id}" aria-label="Meet ${escapeHtml(r.name)}">${avatar(r.id)}<span class="info"><b>${escapeHtml(r.name)}</b><small></small><span class="energy-tiny"><i></i></span></span><span class="arrow">›</span></button>`,
    )
    .join("");
  paintPortraits();
  $("#residents").onclick = (e) => {
    const b = e.target.closest("[data-resident]");
    if (b) selectPerson(+b.dataset.resident);
  };
  $("#tools").innerHTML = Object.entries(kinds)
    .map(
      ([kind, [name, cost, desc]]) =>
        `<button class="build-tool" data-kind="${kind}" title="${desc}" aria-label="Build ${name}, ${cost} timber" aria-pressed="false"><span class="tool-art"></span><b>${name}</b><small>⌁ ${cost}</small></button>`,
    )
    .join("");
  $("#tools").onclick = (e) => {
    const b = e.target.closest("[data-kind]");
    if (b) setTool(b.dataset.kind);
  };
  $("#open-journal").onclick = openJournal;
  $("#close-journal").onclick = () => $("#quest-dialog").close();
  $("#quest-list").onclick = (e) => {
    const button = e.target.closest("[data-track]");
    if (!button) return;
    if (game.track_quest(Number(button.dataset.track))) {
      state = JSON.parse(game.snapshot());
      $("#quest-dialog").close();
      updateUI();
      save();
    }
  };
  $("#host-gathering").onclick = () => {
    const result = game.host_gathering();
    toast(
      result === "ok"
        ? "The gathering has begun. Give neighbours time to reach the square."
        : result,
    );
    state = JSON.parse(game.snapshot());
    updateUI();
    save();
  };
  $("#use-tools").onchange = (e) => {
    game.set_tools_enabled(e.target.checked);
    state = JSON.parse(game.snapshot());
    updateUI();
    save();
  };
  $("#pause").onclick = togglePause;
  for (const b of document.querySelectorAll("[data-speed]"))
    b.onclick = () => {
      speed = +b.dataset.speed;
      for (const x of document.querySelectorAll("[data-speed]"))
        x.classList.toggle("active", x === b);
    };
  $("#save").onclick = () => save(true);
  $("#new-scenario").onclick = () => $("#restart-dialog").showModal();
  $("#cancel-restart").onclick = () => $("#restart-dialog").close();
  $("#confirm-restart").onclick = () => {
    try {
      localStorage.setItem(`${saveKey}-backup`, game.snapshot());
    } catch {}
    game.free();
    game = new Game();
    state = JSON.parse(game.snapshot());
    selected = null;
    tool = null;
    pan = { x: 0, y: 0 };
    zoom = 1;
    time = 0;
    $("#person").hidden = true;
    $("#placement").hidden = true;
    if (paused) togglePause();
    $("#restart-dialog").close();
    updateUI();
    save();
  };
  $("#placement-grid").checked = settings.placementGrid;
  $("#settings").onclick = () => $("#settings-dialog").showModal();
  $("#close-settings").onclick = () => $("#settings-dialog").close();
  $("#placement-grid").onchange = (event) => {
    settings.placementGrid = event.target.checked;
    $("#settings-status").textContent = saveSettings(settings)
      ? "Saved on this device."
      : "Applied for this session. Device storage is unavailable.";
  };
  $("#help").onclick = () => $("#help-dialog").showModal();
  $("#close-help").onclick = $("#start-playing").onclick = () =>
    $("#help-dialog").close();
  $("#zoom-in").onclick = () => (zoom = Math.min(1.8, zoom + 0.15));
  $("#zoom-out").onclick = () => (zoom = Math.max(0.6, zoom - 0.15));
  $("#center").onclick = () => {
    zoom = 1;
    pan = { x: 0, y: 0 };
  };
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moved: false };
  });
  canvas.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
    if (drag && !tool) {
      const dx = e.clientX - drag.x,
        dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) > 5) drag.moved = true;
      if (drag.moved) pan = { x: drag.px + dx, y: drag.py + dy };
    }
  });
  canvas.addEventListener("pointerup", (e) => {
    const moved = drag?.moved;
    drag = null;
    if (moved) return;
    const rect = canvas.getBoundingClientRect(),
      x = e.clientX - rect.left,
      y = e.clientY - rect.top;
    pointer = { x, y };
    if (tool) {
      const p = uniso(x, y),
        result = game.place(tool, p.x, p.y);
      if (result === "ok") {
        toast(`${kinds[tool][0]} planned. Let's build it together.`);
        setTool(null);
        state = JSON.parse(game.snapshot());
        save();
      } else toast(result);
    } else {
      const r = state.residents.find((r) => {
        const p = iso(r.x, r.y);
        return Math.hypot(p.x - x, p.y - 14 * scale - y) < 22 * scale;
      });
      if (r) selectPerson(r.id);
    }
  });
  canvas.addEventListener("pointercancel", () => (drag = null));
  canvas.addEventListener("pointerleave", () => {
    if (!drag) pointer = null;
  });
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      zoom = Math.max(0.6, Math.min(1.8, zoom - e.deltaY * 0.001));
    },
    { passive: false },
  );
  window.addEventListener("keydown", (e) => {
    if (
      e.code === "Space" &&
      !["BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(
        document.activeElement.tagName,
      ) &&
      !document.querySelector("dialog[open]")
    ) {
      e.preventDefault();
      togglePause();
    }
    if (e.code === "Escape" && tool) setTool(null);
  });
  window.addEventListener("resize", resize);
  window.addEventListener("pagehide", () => save());
  document.addEventListener("visibilitychange", () => {
    last = 0;
    if (document.hidden) save();
  });
  resize();
  updateUI();
  $("#loading").hidden = true;
  requestAnimationFrame(frame);
}
try {
  await init({ module_or_path: "./pkg/solar_friends_bg.wasm?v=ecology-1" });
  await Promise.all([
    atlas.decode(),
    gardenArt.decode(),
    ...Object.values(questArt).map((image) => image.decode()),
    forestArt.decode(),
    cisternArt.decode(),
    terrain.decode(),
    peopleArt.decode(),
    ...animations.map((image) => image.decode()),
  ]);
  game = new Game();
  let saved;
  try {
    saved = localStorage.getItem(saveKey);
  } catch {}
  if (saved && !game.restore(saved)) {
    toast("Your old save could not be loaded. A fresh village is ready.");
  }
  state = JSON.parse(game.snapshot());
  setup();
} catch (error) {
  console.error(error);
  $("#load-status").textContent =
    "The village could not load. Please reload, or check that the WebAssembly build is being served.";
}
