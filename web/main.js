import init, { Game } from "./pkg/solar_friends.js";
import { paintTerrain, GROUND_START, GROUND_SIZE } from "./terrain.js";
const $ = (s) => document.querySelector(s);
const canvas = $("#world"),
  ctx = canvas.getContext("2d");
const kinds = {
  home: ["Home", 32, "Room to rest and belong"],
  garden: ["Garden", 12, "Food grown with care"],
  kitchen: ["Kitchen", 40, "Meals taste better together"],
  well: ["Cistern", 18, "Keep the community watered"],
  grove: ["Food forest", 14, "Shade, fruit and a place to gather"],
};
const tasks = {
  rest: "Resting in the shade",
  garden: "Tending the garden",
  build: "Building together",
  gather: "Gathering timber",
  cook: "Making a shared meal",
  water: "Refilling our water",
  socialize: "Finding some company",
};
const colors = ["#d8a044", "#588b83", "#d27a59", "#6a8e58", "#8580a0"];
const atlas = new Image();
atlas.src = "art/village-atlas.png";
const terrain = new Image();
terrain.src = "art/terrain-atlas.png";
const peopleArt = new Image();
peopleArt.src = "art/residents-cistern.png";
let groundLayer,
  groundKey = "";
const mango = new Image();
mango.src = "art/mango-tree.png";
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
const saveKey = "solar-friends-v1";
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
  return {
    x: origin.x + (x - y) * 34 * scale,
    y: origin.y + (x + y) * 17 * scale,
  };
}
function uniso(x, y) {
  const a = (x - origin.x) / (34 * scale),
    b = (y - origin.y) / (17 * scale);
  return { x: Math.round((a + b) / 2), y: Math.round((b - a) / 2) };
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
    a = 34 * scale,
    b = 17 * scale;
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
function tree(x, y, s = 1) {
  const p = iso(x, y);
  const w = 112 * s * scale;
  contactShadow(
    p.x + 9 * scale,
    p.y + 3 * scale,
    24 * s * scale,
    9 * s * scale,
  );
  ctx.drawImage(mango, p.x - w / 2, p.y - w * 0.89, w, w);
}
function sprite(kind, x, y, size, alpha = 1) {
  const p = iso(x, y),
    cell = atlas.width / 2;
  const index = { home: 0, kitchen: 1, garden: 2, grove: 3 }[kind];
  if (index === undefined || !atlas.complete || !atlas.naturalWidth) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const w = size * scale;
  ctx.drawImage(
    atlas,
    (index % 2) * cell,
    Math.floor(index / 2) * cell,
    cell,
    cell,
    p.x - w / 2,
    p.y - w * 0.84,
    w,
    w,
  );
  ctx.restore();
}
function cistern(x, y, alpha = 1) {
  const p = iso(x, y),
    cell = peopleArt.width / 3,
    w = 77 * scale;
  contactShadow(p.x + 3 * scale, p.y + 2 * scale, 28 * scale, 12 * scale);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(
    peopleArt,
    cell * 2,
    cell,
    cell,
    cell,
    p.x - w / 2,
    p.y - w * 0.9,
    w,
    w,
  );
  ctx.restore();
}
function building(b) {
  const p = iso(b.x, b.y),
    complete = b.progress >= 100;
  contactShadow(p.x + 9 * scale, p.y + 4 * scale, 50 * scale, 17 * scale, 0.16);
  if (b.kind === "well") cistern(b.x, b.y, complete ? 1 : 0.45);
  else
    sprite(
      b.kind,
      b.x,
      b.y,
      b.kind === "garden" ? 119 : b.kind === "grove" ? 105 : 152,
      complete ? 1 : 0.4,
    );
  if (!complete) {
    const s = scale;
    line(
      p.x - 45 * s,
      p.y - 2 * s,
      p.x - 45 * s,
      p.y - 70 * s,
      "#ae8757",
      3 * s,
    );
    line(
      p.x + 43 * s,
      p.y - 2 * s,
      p.x + 43 * s,
      p.y - 70 * s,
      "#ae8757",
      3 * s,
    );
    line(
      p.x - 45 * s,
      p.y - 65 * s,
      p.x + 43 * s,
      p.y - 65 * s,
      "#bd965f",
      3 * s,
    );
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
  const bob = moving ? Math.sin(time * 9 + r.id) * 1.4 * s : 0;
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
  const cell = peopleArt.width / 3;
  const w = 44 * s;
  ctx.save();
  ctx.translate(p.x, py);
  if (r.target_x - r.target_y < r.x - r.y) ctx.scale(-1, 1);
  ctx.drawImage(
    peopleArt,
    (r.id % 3) * cell,
    Math.floor(r.id / 3) * cell,
    cell,
    cell,
    -w / 2,
    -w * 0.94,
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
      py - 53 * s,
      tw + 16 * s,
      18 * s,
      5 * s,
    );
    ctx.fill();
    ctx.fillStyle = "#354f38";
    ctx.fillText(r.name, p.x, py - 40 * s);
  } else if (!moving && r.task === "rest") {
    ctx.fillStyle = "#7e8b65";
    ctx.font = `${12 * s}px Georgia`;
    ctx.fillText("z", p.x + 8 * s, py - 30 * s);
  }
}
const flora = [];
for (let i = 0; i < 65; i++) {
  let x = hash(i, 1) * 17 - 2,
    y = hash(i, 2) * 17 - 2;
  if (x > 1 && x < 12 && y > 1 && y < 12) continue;
  flora.push({
    x,
    y,
    type: i % 4 === 0 ? "banana" : "tree",
    size: 0.65 + hash(i, 3) * 0.55,
  });
}
function render() {
  scale = Math.min(width / 1100, height / 610) * zoom;
  scale = Math.max(0.45, scale);
  origin = { x: width * 0.49 + pan.x, y: height * 0.5 - 220 * scale + pan.y };
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
    34 * scale,
    17 * scale,
    -34 * scale,
    17 * scale,
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
  // The communal paths remain visible beneath individually placed structures.
  const objects = [
    ...flora.map((f) => ({
      depth: f.x + f.y,
      draw: () =>
        f.type === "banana"
          ? sprite("grove", f.x, f.y, 93 * f.size)
          : tree(f.x, f.y, f.size),
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
        t.x <= 12 &&
        t.y >= 1 &&
        t.y <= 12 &&
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
  const dusk = hour < 6 || hour > 19 ? 0.13 : hour > 17 ? 0.055 : 0;
  if (dusk) {
    ctx.fillStyle = `rgba(38,60,77,${dusk})`;
    ctx.fillRect(0, 0, width, height);
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
      ["water", "Refill water"],
      ["cook", "Make a meal"],
      ["rest", "Take a rest"],
      ["socialize", "Spend time together"],
    ]
      .map(([t, n]) => `<button data-task="${t}">${n}</button>`)
      .join(
        "",
      )}</div><div class="response" role="status" hidden></div><button class="persuade" hidden>Explain why the community needs help</button>`;
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
    : "Warm season · clear skies";
  $("#latest-event").textContent = v.events[0];
  const objectives = [
    [
      "Build our first garden",
      v.buildings.some((b) => b.kind === "garden" && b.progress >= 100),
    ],
    ["Bring in a first harvest", v.harvests > 0],
    [
      "Grow a food forest",
      v.buildings.some((b) => b.kind === "grove" && b.progress >= 100),
    ],
  ];
  $("#objectives").innerHTML = objectives
    .map(
      ([label, done]) =>
        `<div class="objective ${done ? "done" : ""}"><span>${done ? "✓" : ""}</span>${label}</div>`,
    )
    .join("");
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
    $(".response").hidden = !response;
    $(".response").textContent = response;
    $(".persuade").hidden = !encouragable;
  }
  for (const button of document.querySelectorAll(".build-tool")) {
    button.classList.toggle("active", button.dataset.kind === tool);
    button.setAttribute("aria-pressed", String(button.dataset.kind === tool));
  }
}
function setTool(kind) {
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
  time += dt;
  const running = !paused && !document.hidden && !$("#help-dialog").open;
  if (running) {
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
  $("#pause").onclick = togglePause;
  for (const b of document.querySelectorAll("[data-speed]"))
    b.onclick = () => {
      speed = +b.dataset.speed;
      for (const x of document.querySelectorAll("[data-speed]"))
        x.classList.toggle("active", x === b);
    };
  $("#save").onclick = () => save(true);
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
      !$("#help-dialog").open
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
  await init();
  await Promise.all([
    atlas.decode(),
    mango.decode(),
    terrain.decode(),
    peopleArt.decode(),
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
