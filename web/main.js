import {installGameUI} from './game-ui.js';
import {economyImage,drawEconomyArt} from './economy-art.js';
import {advanceSimulation,simulationSpeed} from './simulation-speed.js';
import {sleepLabel,residentVisible,residentIsAway,tripLabel} from './resident-presence.js';
import {installEconomyUI,recipeSummary} from './economy-ui.js';
import { footprintCorners, occupies, placementArt, drawFoundation } from './building-footprints.js';
import { installBuildMenu } from './build-menu.js';
import { buildingLighting, lightingLayers, connectionLabel, updatePowerUI } from './power.js';
import { drawNightEmission } from './night-lighting.js';
import { weatherConditions, drawGroundWeather, drawWeatherAir } from './weather.js';
import { readArtDraft } from './dev/art-draft.js';
import { installDevTools } from './dev/tools.js';
import { makeScenario, advanceGame } from './dev/scenarios.js';
import { advanceResidentAnimation, drawResidentAnimation, residentActivity, idleLabels } from './resident-animation.js?v=2';
import { RESIDENT_WIDTH, preparedFrames } from './sprite-frames.js';
import { drawCrops, loadCropArt, cropTypes, cropDuration } from './crop-art.js';
import { buildingArt, allBuildingArt, buildingArtKey, drawBuildingArt, nightAmount } from './building-art.js?v=night-1';
import { situationView } from "./situations.js";
import { flock, drawChicken, loadChickenArt } from "./chickens.js?v=painted-hens-1";
import { quests, buildingUnlocked, questStatus, goalRoute, unlockQuest, questCompleted, questAvailable, completedQuests } from "./quests.js?v=modes-1";
import { loadSettings, saveSettings } from "./settings.js";
import { placementReason, milestones } from "./polish.js";
import { VillageAudio } from "./village-audio.js";
import { VillageStorage, SAVE_KEY } from "./village-storage.js";
import {
  project,
  unproject,
  TILE_HALF_WIDTH,
  TILE_HALF_HEIGHT,
  zoomLimits,
  clampZoom,
} from "./projection.js";
import init, { Game } from "./pkg/solar_friends.js?v=devtools-1";
import {
  paintTerrain,
  GROUND_START,
  GROUND_SIZE,
  MAP_SIZE,
  riverCenter,
  riverBank,
} from "./terrain.js?v=manual-roads-1";
const $ = (s) => document.querySelector(s);
const settings = loadSettings();
const sound = new VillageAudio(settings);
let cameraTarget = null, previousVillage = null, celebrationTimer;
const milestoneQueue = [];
let showingMilestone = false;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const previewParams = new URLSearchParams(location.search);
const residentPreview = previewParams.has("resident-preview");
const nightPreview = previewParams.has("night-preview");
const artworkPreview = nightPreview || residentPreview || previewParams.has("artwork-preview");
const directScenario = previewParams.get('dev-scenario');
let sandbox = null, sandboxName = '', devTools, loadingScenario = false;
const canvas = $("#world"),
  ctx = canvas.getContext("2d");
const kinds = {
  road: ["Road", "Click to add or remove a road tile"],
  home: ["Home", "Three beds and a good night’s rest"],
  greenhouse: ["Greenhouse", "Retain moisture · raise seedlings · needs stored water"],
  garden: ["Garden", "Plant, water, grow, then harvest"],
  kitchen: ["Kitchen", "Meals taste better together"],
  well: ["Cistern", "Catch rainfall · store 75 more water"],
  grove: ["Food forest", "Gather fresh fruit when the pantry needs it"],
  compost: ["Compost", "Two kitchen scraps enrich the next harvest"],
  square: ["Square", "Gatherings bring neighbours closer"],
  coop: ["Chicken coop", "A sheltered home for three roaming hens"],
  workshop: ["Workshop", "Craft tools for building and harvests"],
  solar_farm: ["Solar farm", "Collect sunshine · store energy for shared lights"],
  streetlight: ["Street light", "Light village paths · needs shared solar power"],
};
const tasks = {
  visit: "Visiting a village building",
  arrive: "Arriving at our new home",
  idle: "Enjoying a quiet moment",
  sleep: "Sleeping until morning",
  eat: "Sitting down to eat",
  rest: "Resting in the shade",
  garden: "Tending the garden",
  build: "Building together",
  gather: "Foraging fresh food",
  source: "Collecting local materials",
  prepare: "Preparing building materials",
  outside: "Working at a neighbouring farm",
  pickup: "Driving to collect town supplies",
  return: "Returning to the village",
  cook: "Making a shared meal",
  water: "Collecting river water",
  socialize: "Finding some company",
  compost: "Turning kitchen scraps",
  craft: "Crafting useful tools",
  gathering: "Sharing food and stories",
  nature_walk: "Enjoying a nature walk",
  birdwatch: "Watching the birds",
  stretch: "Enjoying gentle stretches",
  daydream: "Sitting and daydreaming",
  stargaze: "Watching the stars",
};
const colors = ["#d8a044", "#588b83", "#d27a59", "#6a8e58", "#8580a0"];
const buildingImages = Object.fromEntries(Object.entries(allBuildingArt).map(([kind, art]) => {
  const image = new Image();
  image.src = `art/${art.file}`;
  return [kind, image];
}));
const nightBuildingImages = Object.fromEntries(Object.entries(allBuildingArt).map(([kind, art]) => {
  const image = new Image();
  image.src = `art/${art.nightFile}`;
  return [kind, image];
}));
const terrain = new Image();
terrain.src = "art/terrain-atlas.png";
const animations = ["iara", "bento", "luz", "caua", "nina"].map((name) => {
  const image = new Image();
  image.src = `art/animations/${name}.png`;
  return image;
});
const idleAnimations = ['iara', 'bento', 'luz', 'caua', 'nina'].map(name => {
  const image = new Image(); image.src = `art/animations/${name}-idle.png`; return image;
});
const activityAnimations = ['iara', 'bento', 'luz', 'caua', 'nina'].map(name => {
  const image = new Image(); image.src = `art/animations/${name}-activities.png`; return image;
});
const residentAnimations = new Map();
const residentSurfaces = new Map();
let animationDelta = 0;
let weatherTime = 0;
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
let game,
  state,
  selected = null,
  tool = null,
  buildMenu, economyUI, gameUI,
  speed = 1,
  paused = false,
  zoom = 1.3,
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
const modeStores = Object.fromEntries(['story','sandbox'].map(mode => [mode,new VillageStorage(undefined,`${SAVE_KEY}-${mode}`)]));
let storage = modeStores.story;
let gameActive = false, menuWasPaused = false, pendingMode = null;
const villagePanels = new Set(["building-panel","supplies-panel","projects-panel","town-panel","power-panel"]);
let lastVillagePanel = "building-panel";
let journalPage = 0;
const legacyStorage = new VillageStorage();
let pendingImport = null;
let pendingRemoval = null;
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
  for (const portrait of document.querySelectorAll('[data-portrait]')) {
    const frame=preparedFrames(animations[Number(portrait.dataset.portrait)],{referenceRow:2})?.[8];
    if(frame) portrait.getContext('2d').drawImage(frame,64,12,128,152,0,0,96,108);
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
  if (!gameActive || ($("#main-menu").open && !manual)) return;
  if (artworkPreview || sandbox || directScenario) {
    $("#save-status").textContent = "Development preview · your saved village is unchanged";
    if (manual) toast("Preview only. Return to your village to save progress.");
    return;
  }
  try {
    storage.write(game.snapshot());
    $("#save-warning").hidden = true;
    $("#save-status").textContent = "Saved on this device";
    if (manual) toast("Your village is saved. Come back whenever you like.");
  } catch {
    $("#save-status").textContent = "Saving unavailable";
    $("#save-warning").hidden = false;
    if (manual)
      toast(
        "This browser could not save. Keep this tab open to preserve your village.",
      );
  }
}
function readModeSave(mode) {
  const raw = modeStores[mode].read();
  // Keep the earlier village intact while making it available as a Story save.
  return raw ?? (mode === 'story' ? legacyStorage.read() : null);
}
function refreshMenu() {
  let any = false;
  $('#menu-status').textContent='';
  for(const mode of ['story','sandbox']) {
    const button=$(`[data-continue="${mode}"]`);
    button.hidden=true;
    const candidate=new Game();
    try {
      const raw=readModeSave(mode);
      if(raw!==null) {
        if(!candidate.restore(raw)) {
          $('#menu-status').textContent='An earlier village could not be read. Its saved data is preserved.';
          continue;
        }
        const v=JSON.parse(candidate.snapshot()).village;
        if((v.mode || 'story')!==mode) continue;
        button.hidden=false;any=true;
        button.querySelector('small').textContent=`Day ${1+Math.floor(v.minutes/1440)} · ${v.buildings.length} ${v.buildings.length===1?'building':'buildings'}${mode==='story'?` · ${completedQuests(v).filter(Boolean).length}/7 chapters`:''}`;
      }
    } catch {
      $('#menu-status').textContent='Device storage is unavailable. You can play this session and export your village in Settings.';
    } finally {candidate.free();}
  }
  $('#menu-continues').hidden=!any;
  $('.menu-return').hidden=!gameActive;
}
function openMainMenu() {
  if(sandbox || artworkPreview || directScenario) return;
  if(gameActive)save();
  menuWasPaused=paused;
  closePanels();
  for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
  refreshMenu();
  $('.settings-section[aria-label="Village save"]').hidden=!gameActive;
  document.body.classList.add('in-main-menu');
  $('#main-menu').showModal();
}
function enterVillage(candidate,mode) {
  game.free();game=candidate;storage=modeStores[mode];gameActive=true;
  state=JSON.parse(game.snapshot());
  residentAnimations.clear();selected=null;tool=null;pointer=null;cameraTarget=null;
  pan={x:0,y:0};time=0;weatherTime=0;speed=1;last=0;saveElapsed=0;
  setZoom(1.3);
  $('#person').hidden=true;$('#placement').hidden=true;closePanels();
  for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
  document.body.classList.remove('in-main-menu');
  if(paused)togglePause();
  for(const button of document.querySelectorAll('[data-speed]')) {
    const active=button.dataset.speed==='1';button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
  }
  resetPolish();updateUI();render();devTools?.refresh();
  $('#save-status').textContent='Saved on this device';
  $('.settings-section[aria-label="Village save"]').hidden=false;
  $('#settings').focus();
}
function continueMode(mode) {
  const candidate=new Game();
  try {
    const raw=readModeSave(mode);
    if(raw===null || !candidate.restore(raw) || (JSON.parse(candidate.snapshot()).village.mode||'story')!==mode) {
      candidate.free();$('#menu-status').textContent='This village could not be loaded. Its saved data is preserved.';return;
    }
    enterVillage(candidate,mode);save();
  } catch {candidate.free();$('#menu-status').textContent='Device storage could not be read. Your village is preserved.';}
}
function requestNewMode(mode) {
  if(sandbox || artworkPreview || directScenario)return;
  let existing;
  try {existing=readModeSave(mode);} catch {existing=null;}
  if(existing===null){startMode(mode);return;}
  pendingMode=mode;
  $('#restart-title').textContent=`Start a new ${mode==='story'?'story':'sandbox'}?`;
  $('#restart-dialog p').textContent=`This replaces only your ${mode==='story'?'Story':'Sandbox'} village. Its previous save stays in a backup. Your other mode is kept.`;
  $('#confirm-restart').textContent=`Start new ${mode==='story'?'story':'sandbox'}`;
  $('#restart-dialog').showModal();
}
function startMode(mode) {
  const candidate=new Game();candidate.start_mode(mode);
  let durable=true, existing=null;
  try {
    existing=readModeSave(mode);
    if(existing!==null)modeStores[mode].backup(existing);
    modeStores[mode].write(candidate.snapshot());
  } catch {
    // An unreadable slot is never replaced. A new session can still be exported.
    if(existing!==null) {
      candidate.free();$('#restart-dialog').close();pendingMode=null;
      toast('Could not back up this village. Export it in Settings before starting again.');return;
    }
    durable=false;
  }
  enterVillage(candidate,mode);pendingMode=null;
  $('#save-warning').hidden=durable;
  if(!durable)$('#save-status').textContent='Saving unavailable · export your village to keep it';
  if(mode==='story')showPanel('goals-panel');
  else toast('Every building is unlocked. Choose a clearing and make yourself at home.');
}
function installMenu() {
  $('#main-menu').addEventListener('cancel',event=>{event.preventDefault();if(gameActive)$('#menu-return').click();});
  for(const button of document.querySelectorAll('[data-new-mode]'))button.onclick=()=>requestNewMode(button.dataset.newMode);
  for(const button of document.querySelectorAll('[data-continue]'))button.onclick=()=>continueMode(button.dataset.continue);
  $('#menu-return').onclick=()=>{
    $('#main-menu').close();document.body.classList.remove('in-main-menu');
    if(paused!==menuWasPaused)togglePause();$('#settings').focus();
  };
  $('#open-main-menu').onclick=openMainMenu;
  $('.brand').onclick=event=>{if(!artworkPreview&&!directScenario){event.preventDefault();openMainMenu();}};
  $('#menu-settings').onclick=()=>$('#settings').click();
  $('#menu-help').onclick=()=>$('#help-dialog').showModal();
}
function setZoom(value) {
  zoom=clampZoom(width,height,value);
  const limits=zoomLimits(width,height);
  $('#zoom-out').disabled=zoom<=limits.min+1e-6;$('#zoom-in').disabled=zoom>=limits.max-1e-6;
}
function resize() {
  const r = canvas.getBoundingClientRect();
  width = r.width;
  height = r.height;
  setZoom(zoom);
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
  // Shade unavailable cell centers using the same rules as the hover preview.
  for (let x = 1; x <= MAP_SIZE - 2; x++)
    for (let y = 1; y <= MAP_SIZE - 2; y++)
      if (!placementValid(tool, x, y)) tile(x, y, "rgba(140, 81, 53, 0.2)");
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
function sprite(kind, x, y, alpha = 1, id) {
  const art=allBuildingArt[kind];if(!art)return;
  const p=iso(x,y),night=nightAmount(state.village.minutes),registration=placementArt(kind,art);
  drawFoundation(ctx,kind,p.x,p.y,scale,alpha,night);
  const complete=state.village.buildings.find(b=>b.id===id)?.progress>=100;
  const level=buildingLighting(state.environment.power,id,kind,complete);
  for(const layer of lightingLayers(night,level,alpha)){
    ctx.save();ctx.filter=layer.filter;
    drawBuildingArt(ctx,(layer.source==='night'?nightBuildingImages:buildingImages)[kind],art,p.x+registration.x*scale,p.y+registration.y*scale,scale*registration.scale,layer.alpha);
    ctx.restore();
  }
}
function buildingSprite(kind, x, y, alpha = 1, id) {
  sprite(buildingArtKey({kind,id},state.village.buildings,state.village.economy.projects),x,y,alpha,id);
}
function placementValid(kind, x, y) {
  return !placementReason(state.village, kind, x, y);
}
function activityLabel(r) {
  if(r.trip)return tripLabel(r,state.environment.economy.jobs.find(j=>j.id===r.id));
  if(r.task === "sleep")return sleepLabel(r);
  if (r.task === "idle") return idleLabels[residentActivity(r, state.village.minutes)];
  if (r.task === "visit") {
    const b = state.village.buildings.find(b => b.id === r.visit_building);
    if (b) return `${Math.hypot(r.target_x-r.x, r.target_y-r.y) > 0.1 ? "Walking to" : "Visiting"} the ${kinds[b.kind][0].toLowerCase()}`;
  }
  return tasks[r.task] || r.task;
}
function residentAt(x, y) {
  return [...state.residents].reverse().find(r => {
    const p = iso(r.x, r.y);
    return residentVisible(r,state.village) && Math.hypot(p.x-x, p.y-14*scale-y) < Math.max(16, 22*scale);
  });
}
function announceMilestones() {
  const found = milestones(previousVillage, state.village);
  previousVillage = state.village;
  for (const event of found) {
    const text = event.kind === "building" ? `${kinds[event.building][0]} ready · A new place for village life.`
      : event.kind === "harvest" ? "Harvest gathered · Fresh food for everyone."
      : event.kind === "quest" ? `${quests[event.quest].title} complete · Unlocked ${quests[event.quest].reward}`
      : "A new friendship · Shared time is bringing neighbours closer.";
    if (!milestoneQueue.includes(text)) milestoneQueue.push(text);
  }
  if (!showingMilestone && milestoneQueue.length) {
    showingMilestone = true;
    $("#milestone").textContent = milestoneQueue.shift(); $("#milestone").hidden = false;
    sound.celebrate();
    celebrationTimer = setTimeout(() => { $("#milestone").hidden = true; showingMilestone = false; }, 5500);
  }
}
function resetPolish() {
  previousVillage = state.village; milestoneQueue.length = 0;
  clearTimeout(celebrationTimer); showingMilestone = false; $("#milestone").hidden = true;
  cameraTarget = null; pointer = null; pan = { x: 0, y: 0 }; setZoom(1.3);
}

function building(b) {
  const p = iso(b.x, b.y),
    complete = b.progress >= 100;

  const project=state.village.economy.projects.find(p=>p.building===b.id);
  const stages=state.environment.economy.projects.find(p=>p.building===b.id)?.stages.length||1;
  buildingSprite(b.kind,b.x,b.y,complete?1:.16+.65*((project?.stage||0)/stages),b.id);
  if(project?.recipe==='local'){
    ctx.save();ctx.strokeStyle=b.kind==='garden'?'#9eaa8a':'#bbbd8b';ctx.lineWidth=3*scale;
    ctx.beginPath();footprintCorners(b.kind,b.x,b.y).forEach(([x,y],i)=>{const q=iso(x,y);if(i)ctx.lineTo(q.x,q.y-2*scale);else ctx.moveTo(q.x,q.y-2*scale);});ctx.closePath();ctx.stroke();ctx.restore();
  }
  if (complete && ['garden','greenhouse'].includes(b.kind)) {
    const registration=placementArt(b.kind,buildingArt[b.kind]);
    drawCrops(ctx,b,p.x+registration.x*scale,p.y+registration.y*scale,scale*registration.scale,nightAmount(state.village.minutes));
  }
  if (!complete) {
    const s = scale;
    // Upright posts and beams follow the same ground axes as the building.
    const corners = footprintCorners(b.kind,b.x,b.y).map(([x,y])=>iso(x,y));
    const scaffoldHeight = (b.kind === "garden" ? 15 : (project?.stage||0)===0?20:65) * s;
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
    ctx.font=`${10*s}px 'DM Sans',sans-serif`;ctx.textAlign='center';
    const stage=state.environment.economy.projects.find(project=>project.building===b.id);
    ctx.fillText(stage?.paused?'Paused':stage?.stage||'Blueprint',p.x,p.y+30*s);
    ctx.fillRect(p.x - 27 * s, p.y + 9 * s, 54 * s, 5 * s);
    ctx.fillStyle = "#7c9859";
    ctx.fillRect(p.x - 27 * s, p.y + 9 * s, (54 * s * b.progress) / 100, 5 * s);
  }
}
function resident(r) {
  const p = iso(r.x, r.y),
    s = scale;
  const moving = Math.hypot(r.target_x - r.x, r.target_y - r.y) > 0.1;
  if(!residentVisible(r,state.village))return;
  const isSelected = selected === r.id;
  contactShadow(p.x, p.y + 2 * s, 10 * s, 4 * s, 0.25);
  if (isSelected) {
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 13 * s, 6 * s, 0, 0, 7);
    ctx.strokeStyle = "#fff5cd";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  const py = p.y;
  const animation = advanceResidentAnimation(residentAnimations.get(r.id), { ...r, sourceMaterial: r.task === "source" ? state.village.economy.sources[r.activity_material]?.material : null, visitingKind: r.task === "visit" ? state.village.buildings.find(b => b.id === r.visit_building)?.kind : null }, state.village.minutes, animationDelta);
  residentAnimations.set(r.id, animation);
  if (!residentSurfaces.has(r.id)) {
    const surface = document.createElement('canvas'); surface.width = surface.height = 128;
    residentSurfaces.set(r.id, surface);
  }
  drawResidentAnimation(ctx, residentSurfaces.get(r.id),
    { base: animations[r.id], idle: idleAnimations[r.id], activities: activityAnimations[r.id] }, animation, p.x, py, RESIDENT_WIDTH * s);
  if (isSelected) {
    ctx.font = `600 ${Math.max(11, 11 * s)}px 'DM Sans',sans-serif`;
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
  const weather = weatherConditions(state.environment,state.village.minutes);
  canvas.dataset.weather = weather.label;
  if (cameraTarget) {
    const blend = reducedMotion.matches ? 1 : 1 - Math.exp(-cameraTarget.dt * 9);
    pan.x += (cameraTarget.x - pan.x) * blend;
    pan.y += (cameraTarget.y - pan.y) * blend;
    if (Math.hypot(cameraTarget.x - pan.x, cameraTarget.y - pan.y) < 0.5) cameraTarget = null;
  }
  scale = Math.min(width / 1900, height / 1050) * zoom;
  scale = Math.max(0.45, scale);
  origin = { x: width * 0.49 + pan.x, y: height * 0.5 - 459 * scale + pan.y };
  const weatherView = {conditions:weather,buildings:state.village.buildings,project:iso,scale,time:weatherTime,width,height,reducedMotion:reducedMotion.matches};
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#dfe6c9";
  ctx.fillRect(0, 0, width, height);
  const visibleRoads=state.village.roads.filter(([x,y])=>!state.village.buildings.some(b=>occupies(b,x,y)));
  const key = JSON.stringify([visibleRoads,state.village.economy.sources.map(s=>[s.x,s.y])]);
  if (groundKey !== key) {
    groundLayer = paintTerrain(terrain, visibleRoads,state.village.economy.sources);
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
  // Foundations and road tiles share the same half-tile boundary lattice.
  drawGroundWeather(ctx,weatherView);
  const objects = [
    ...state.village.economy.sources.map((site,index)=>({depth:site.x+site.y,draw:()=>{const p=iso(site.x,site.y);drawEconomyArt(ctx,index,p.x,p.y,scale,nightAmount(state.village.minutes),site.remaining/site.maximum);}})),
    {depth:23,draw:()=>{const p=iso(10,13);drawEconomyArt(ctx,5,p.x,p.y,scale,nightAmount(state.village.minutes));}},
    ...flora.filter(f=>!state.village.economy.sources.some(site=>Math.hypot(f.x-site.x,f.y-site.y)<2.5)).map((f) => ({
      depth: f.x + f.y,
      draw: () => tree(f.x, f.y, f.size, f.species),
    })),
    ...state.village.buildings.map((b) => ({
      depth: b.x + b.y,
      draw: () => building(b),
    })),
    ...flock(state.village).map((hen) => ({
      depth: hen.x + hen.y + 0.1,
      draw: () => drawChicken(ctx, iso(hen.x, hen.y), scale, hen),
    })),
    ...state.residents.map((r) => ({
      depth: r.x + r.y + 0.6,
      draw: () => resident(r),
    })),
  ];
  objects.sort((a, b) => a.depth - b.depth).forEach((o) => o.draw());
  if (tool && pointer) {
    const t = uniso(pointer.x, pointer.y);
    const reason = placementReason(state.village, tool, t.x, t.y);
    polygon(footprintCorners(tool,t.x,t.y).map(([x,y]) => {
      const p = iso(x,y); return [p.x,p.y];
    }), reason ? "#cd745a66" : "#f5f1b277", reason ? "#a74431" : "#fff8cf");
    if (tool !== "road") buildingSprite(tool, t.x, t.y, 0.55);
    $("#placement").textContent = reason || `${tool === "road" ? "Road · Click to add or remove" : `Place ${kinds[tool][0].toLowerCase()} · ${state.village.mode==='sandbox'?'Free · instant':recipeSummary(state,tool)}`} · Drag to pan · Esc to cancel`;
    $("#placement").classList.toggle("invalid", Boolean(reason));
  }
  const hovered = pointer && !tool && !drag ? residentAt(pointer.x, pointer.y) : null;
  const hint = $("#resident-hint");
  hint.hidden = !hovered;
  if (hovered) {
    hint.textContent = `${hovered.name} · ${activityLabel(hovered)}`;
    hint.style.left = `${Math.max(16, Math.min(width - 300, pointer.x + 18))}px`;
    hint.style.top = `${Math.max(100, Math.min(height - 150, pointer.y - 48))}px`;
  }
  canvas.style.cursor = drag?.moved ? "grabbing" : tool ? "crosshair" : hovered ? "pointer" : "grab";
  // Tiny birds drifting past the clearing.
  if (!reducedMotion.matches && !weather.rain) {
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
  drawWeatherAir(ctx,weatherView);
  const hour = (state.village.minutes % 1440) / 60;
  // Continuous tropical daylight: sunrise around 06:00, sunset around 18:00.
  const altitude = Math.sin(((hour - 6) / 12) * Math.PI);
  const darkness = nightAmount(state.village.minutes);
  const twilight = Math.max(0, 1 - Math.abs(altitude) / 0.3) * 0.16;
  ctx.fillStyle = `rgba(237,150,84,${twilight})`;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = `rgba(17,31,65,${darkness * 0.62})`;
  ctx.fillRect(0, 0, width, height);
  if(darkness>0){
    for(const b of state.village.buildings){
      if(b.progress<100)continue;
      const c=state.environment.power.connections.find(c=>c.id===b.id);
      if(!['grid','roof'].includes(c?.source) || c.light_level<=0)continue;
      const p=iso(b.x,b.y),kind=buildingArtKey(b,state.village.buildings,state.village.economy.projects);
      drawNightEmission(ctx,nightBuildingImages[kind],allBuildingArt[kind],kind,p.x,p.y,scale,darkness*c.light_level);
    }
  }
  if (darkness > 0) {
    for (const b of state.village.buildings.filter(
      (b) => b.progress >= 100 && ["home", "kitchen"].includes(b.kind),
    )) {
      const p = iso(b.x, b.y);
      if (
        b.kind === "home" &&
        state.residents.some(
          (r) =>
            !r.trip && r.task === "sleep" &&
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
function closePanels() {
  $("#village-book").hidden = true;
  $("#open-village").setAttribute("aria-expanded","false");
  for (const button of document.querySelectorAll("[data-panel]")) {
    $("#" + button.dataset.panel).hidden = true;
    button.setAttribute("aria-expanded", "false");
  }
}
function showPanel(id) {
  closePanels();
  selected = null;
  $("#person").hidden = true;
  if (tool) setTool(null);
  $("#" + id).hidden = false;
  if(villagePanels.has(id)) {
    $("#village-book").hidden = false;
    $("#open-village").setAttribute("aria-expanded","true");
    lastVillagePanel = id;
  }
  $(`[data-panel="${id}"]`).setAttribute("aria-expanded", "true");
  $("#" + id).querySelector("button").focus();
  updateUI();
}
function selectPerson(id) {
  closePanels();
  if (tool) setTool(null);
  selected = id;
  response = "";
  encouragable = false;
  $("#person").hidden = false;
  const r = state.residents.find((p) => p.id === id);
  const p = iso(r.x, r.y);
  cameraTarget = residentIsAway(r)?null:{ x: pan.x + width * 0.4 - p.x, y: pan.y + height * 0.47 - p.y, dt: 1 / 60 };
  $("#person").innerHTML =
    `<button class="close-person" aria-label="Close resident details">×</button><span class="eyebrow">A NEIGHBOUR, NOT A NUMBER</span><div class="person-portrait">${avatar(r.id)}</div><h2>${escapeHtml(r.name)}</h2><p class="traits">${escapeHtml(r.trait_name)}</p><section class="resident-occupation"><b class="occupation-title"></b><small class="occupation-income"></small><p class="occupation-description"></p><label><input class="occupation-toggle" type="checkbox"> Take outside shifts</label><small class="occupation-schedule-note"></small></section><p class="person-activity"></p><p class="quote"></p>${["Energy", "Fullness", "Connection"].map((n) => `<div class="stat" data-stat="${n}"><span>${n}</span><div class="meter"><i></i></div><span class="value"></span></div>`).join("")}<p class="request-title">ASK FOR A HAND</p><div class="response" role="status" hidden></div><button class="persuade" hidden>Explain why the community needs help</button><p class="request-pause" hidden></p><button class="resume-request" hidden>Resume time</button><div class="requests">${[
      ["garden", "Tend garden"],
      ["build", "Help build"],
      ["gather", "Forage food"],
      ["source", "Source materials"],
      ["prepare", "Prepare materials"],
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
      )}</div><p class="friendship-note"></p>`;
  $(".close-person").onclick = () => {
    selected = null;
    $("#person").hidden = true;
    updateUI();
    $(`[data-citizen="${id}"]`).focus();
  };
  $('#person .occupation-toggle').onchange=event=>{game.set_resident_job(id,event.target.checked);state=JSON.parse(game.snapshot());updateUI();save();};
  paintPortraits();
  $(".close-person").focus();
  $("#person .requests").onclick = (e) => {
    const b = e.target.closest("[data-task]");
    if (b) request(b.dataset.task, false);
  };
  $("#person .persuade").onclick = () => request(lastTask, true);
  $("#person .resume-request").onclick = () => { if(paused)togglePause(); updateUI(); };
  updateUI();
}
function request(task, encourage) {
  lastTask = task;
  response = game.request(selected, task, encourage);
  encouragable = response.includes("talk about why");
  state = JSON.parse(game.snapshot());
  updateUI();
  save();
  $(encouragable ? "#person .persuade" : "#person .response").scrollIntoView({ block: "nearest" });
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
  if(tool)setTool(null);
  closePanels();selected=null;$('#person').hidden=true;
  journalPage = state.village.progress.tracked;
  updateQuests();
  $("#quest-dialog").showModal();
  $('[data-panel="goals-panel"]').setAttribute('aria-expanded','true');
}
function updateQuests() {
  const v = state.village,
    p = v.progress;
  const completions = completedQuests(v);
  if(v.mode !== 'sandbox') {
  const id = p.tracked,
    quest = quests[id],
    done = completions[id];
  const objectives = quest.objectives(v),
    next = objectives.find((o) => !o.done);
  const finished=completions.every(Boolean);
  const completedCount = done ? objectives.length : objectives.filter(o => o.done).length;
  $("#goal-label").textContent = finished ? "A flourishing village" : done ? "A shared dream fulfilled" : quest.title;
  $("#goal-next").textContent = finished ? "7/7 chapters complete · keep growing" : done ? "Follow our next chapter →" : next ? `${next.label} · ${next.value}/${next.target}` : "Let village life unfold";
  $("#goal-meter").value = completedCount; $("#goal-meter").max = objectives.length;
  $("#goal-meter").setAttribute("aria-label", `${quest.title}: ${completedCount} of ${objectives.length} objectives`);
  $("#goal-shortcut").title = done ? quest.after : next?.hint || quest.story;
  $("#goal-shortcut").onclick = () => done ? openJournal() : showPanel("goals-panel");
  $("#tutorial-count").textContent = `${quest.theme} · CHAPTER ${id + 1} OF ${quests.length}`;
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
  const route=goalRoute(state,done?{build:quest.building,target:1}:next);
  const action=$("#tutorial-action"), shortcut=$("#goal-action");
  action.disabled=false;shortcut.disabled=false;
  let label='',onClick=()=>{};
  if(route?.type==='plan'){label=`Plan ${kinds[route.kind][0].toLowerCase()} · free blueprint`;onClick=()=>setTool(route.kind);}
  if(route?.type==='visit'){label=`Visit ${kinds[v.buildings.find(b=>b.id===route.id).kind][0].toLowerCase()}`;onClick=()=>inspectBuilding(route.id);}
  if(route?.type==='project'){
    label=route.project.paused?'Review paused project':route.project.ready?'View construction project':'Review project supplies';
    onClick=()=>showPanel('projects-panel');
    const missing=route.project.missing.map((n,i)=>n?`${n} ${state.environment.economy.materials[i].name.toLowerCase()}`:'').filter(Boolean).join(', ');
    $('#tutorial-copy').textContent=route.project.paused?'This project is paused. Resume it in Village → Construction when you are ready.':route.project.ready?`${route.project.stage}: materials are ready. Neighbours work 09:00–12:00 and 15:00–16:00. Review the project or plan other essentials while it is underway.`:`The ${route.project.stage.toLowerCase()} stage is waiting for ${missing}. Open Village → Construction for the recipe and Trade for missing equipment. Choose delivery or a resident pickup; small orders can come back the same day.`;
  }
  if(route?.type==='supper'||route?.type==='tool_library'){
    const supper=route.type==='supper', underway=supper&&p.gathering_until>v.minutes;
    label=underway?'Welcome supper underway':supper?'Host welcome supper · 5 meals':'Support tool library · R$ 120';
    action.disabled=underway;shortcut.disabled=underway;
    if(underway)$('#tutorial-copy').textContent=`The neighbours are making their way to the kitchen. ${p.attended.toString(2).replaceAll('0','').length} have arrived; three need to attend before the supper ends. ${Math.ceil(p.gathering_until-v.minutes)} game minutes remain.`;
    onClick=()=>{
      const result=supper?game.host_gathering():game.contribute_tool_library();
      toast(result==='ok'?(supper?'Welcome supper is starting at the kitchen.':'The shared tool library is funded.'):result);
      state=JSON.parse(game.snapshot());updateUI();save();
    };
  }
  action.hidden=!route;action.textContent=label;action.onclick=onClick;
  shortcut.hidden=done||!route;shortcut.textContent=label.replace(' · free blueprint','');shortcut.onclick=onClick;
  $("#open-journal").textContent =
    done && id === 0
      ? "Choose our next quest →"
      : `Village journal · ${completions.filter(Boolean).length}/${quests.length}`;
  $("#village-needs").textContent =
    `${Math.min(5, v.buildings.filter((b) => b.kind === "home" && b.progress >= 100).length * 3)}/5 beds · ${v.meals} prepared meals`;
  $("#quest-total").textContent =
    `${completions.filter(Boolean).length} of ${quests.length} chapters complete`;
  replaceMarkup($('#journal-chapters'),quests.map((q,i)=>`<button data-chapter="${i}" aria-pressed="${i===journalPage}"><span class="chapter-number">${completions[i]?'✓':i+1}</span><span><b>${q.title}</b><small>${questStatus(v,i)}</small></span></button>`).join(''));
  replaceMarkup(
    $("#quest-list"),
    quests
      .map((q, i) => {
        const status = questStatus(v, i),
          locked = !questAvailable(v,i);
        return `<article class="quest-card ${completions[i] ? "complete" : ""} ${locked ? "locked" : ""}" ${i===journalPage?'':'hidden'}>
      <div class="quest-card-art ${q.art}">${i ? `<img src="art/${buildingArt[q.art]?.file || q.art + '-isometric.png'}" alt="${kinds[q.art]?.[0] || q.theme} illustration">` : "<span>☀</span>"}</div>
      <div class="quest-card-content"><span class="eyebrow">${q.theme} · ${status}</span><h3>${q.title}</h3><p class="quest-story">${q.story}</p>
      ${objectiveMarkup(q.objectives(v), completions[i])}
      <p class="journal-reward"><b>${completions[i] ? "Unlocked" : "Unlocks"}</b> ${q.reward}</p>
      ${completions[i] ? `<p class="quest-after">${q.after}</p>` : ""}
      <button data-track="${i}" ${locked ? "disabled" : ""}>${locked ? `Complete ${quests[i-1]?.title} first` : i === id ? "Following this quest" : completions[i] ? "Explore the reward →" : "Follow this quest →"}</button></div></article>`;
      })
      .join(""),
  );
  }
  const has = (kind) =>
    v.buildings.some((b) => b.kind === kind && b.progress >= 100);
  $("#village-craft").hidden =
    !has("compost") && !has("workshop") && !has("square") && !p.gathering_until;
  $("#compost-stock").hidden = !has("compost");
  $("#compost-stock").textContent =
    `${p.scraps} scraps → ${p.compost} compost · ${p.enriched_harvests} enriched ${p.enriched_harvests === 1 ? "harvest" : "harvests"}`;
  $("#tools-control").hidden = !has("workshop");
  $("#tools-stock").textContent =
    `${p.tool_uses} tool uses · ${p.tools_crafted} sets crafted`;
  $("#use-tools").checked = p.use_tools;
  $("#gathering-control").hidden = !has("square") && !p.gathering_until;
  $("#gathering-status").textContent =
    p.gathering_until > v.minutes
      ? `Gathering in progress · ${Math.ceil(p.gathering_until - v.minutes)} minutes left`
      : `${p.gatherings} ${p.gatherings === 1 ? "gathering" : "gatherings"} shared · costs 5 prepared meals`;
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
const buildingPurposes = {
  solar_farm: "Collects sunshine and charges the shared battery. Generation peaks at 6 energy per hour; each farm stores 36 energy.",
  streetlight: "Lights the path after sunset, using 0.1 energy per hour from the shared battery.",
  home: "Rest on the porch to recover energy.",
  garden: "Plant, water, or harvest this bed when it is ready.",
  greenhouse: "Grow crops under glass and raise seedlings for outdoor beds. Rain stays outside.",
  kitchen: "Cook a pot with available ingredients and water.",
  well: "Drink one water to recover energy and ease hunger.",
  grove: "Gather two fruit for the pantry.",
  coop: "Care for hens: improve connection and advance a fed batch by 30 daylight minutes.",
  compost: "Turn two scraps into one compost.",
  workshop: "Use eight timber to make twelve tool uses.",
  square: "Meet neighbours: recover connection and energy. The square also hosts community gatherings.",
};
function updateBuildingPanel() {
  const chooser = $("#building-choice");
  const previous = chooser.value;
  const markup = state.village.buildings.map(b => `<option value="${b.id}">${kinds[b.kind][0]} ${b.id + 1}${b.progress < 100 ? " · building" : ""}</option>`).join("");
  chooser.disabled=!state.village.buildings.length;
  if (chooser.innerHTML !== markup) {
    chooser.innerHTML = markup;
    if ([...chooser.options].some(o => o.value === previous)) chooser.value = previous;
  }
  const b = state.village.buildings.find(b => b.id === Number(chooser.value));
  $('#remove-sandbox-building').hidden=state.village.mode!=='sandbox'||!b;
  $("#building-purpose").textContent = b ? buildingPurposes[b.kind] : "Place your first building to get started.";
  if(b?.kind==='workshop'){
    const tools=state.village.progress.tool_uses, timber=state.environment.economy.materials[0].available;
    $('#building-purpose').textContent=`${tools}/36 tool uses ready. ${tools>24?'Enough tools for now; neighbours can take a break.':timber<8?'The next batch needs eight unreserved timber.':'Eight unreserved timber makes twelve more tool uses.'}`;
  }
  $("#building-power").textContent=b?connectionLabel(state.environment.power.connections.find(c=>c.id===b.id),state.environment.power):"";
  const farming = b && ["garden", "greenhouse"].includes(b.kind);
  $("#crop-controls").hidden = !farming;
  if (farming) {
    const c = b.crop, spec = cropTypes[c.kind];
    $("#next-crop").value = c.next_kind;
    $("#replant-crop").checked = c.replant;
    const yieldBase = spec.yield - (c.kind === "tomatoes" && c.harvests > 0 && state.village.progress.compost === 0 ? 2 : 0);
    const bonus = (state.village.progress.compost > 0 ? 3 : 0) + (state.village.progress.use_tools && state.village.progress.tool_uses > 0 ? 2 : 0);
    $("#crop-status").textContent = `${spec.name} · ${!c.planted ? (c.replant ? "ready to plant" : "replanting paused") : c.growth >= cropDuration(c) ? "ready to harvest" : `${Math.floor(c.growth / cropDuration(c) * 100)}% grown${c.moisture <= 0 ? " · needs water" : ""}`}. Expected harvest: ${yieldBase+bonus}–${yieldBase+bonus+3} food.`;
    $("#crop-details").textContent = `Soil moisture: ${Math.ceil(c.moisture)} minutes${c.kind === "beans" ? " (beans use half as fast)" : ""}. Harvest size depends on the gardener. ${spec.note}.`;
    $("#nursery-status").textContent = b.kind === "greenhouse" ? `One seedling per 8 moist growing hours · ${state.village.seedlings}/12 stored. Seedlings give outdoor beds a 25% growth head start. Watering costs 2 water and lasts twice as long; rain cannot water this bed.` : `${state.village.seedlings} seedlings available for a 25% head start on the next planting.`;
  }
  const visitors = b ? state.residents.filter(r => r.task === "visit" && r.visit_building === b.id) : [];
  $("#building-activity").textContent = !b ? "" : b.progress < 100 ? "Open Village → Construction for stage materials, purchases and priorities." : visitors.length
    ? visitors.map(r => `${r.name}: ${Math.hypot(r.x-r.target_x,r.y-r.target_y) > 0.1 ? "on the way" : "using the building"}`).join(" · ")
    : `${b.visits} visits completed. ${b.next_visit > state.village.minutes && !["home", "square"].includes(b.kind) ? "Production recovers in " + Math.ceil(b.next_visit - state.village.minutes) + " game minutes." : "Ready for a visit."}`;
  const utility = b && ["solar_farm", "streetlight"].includes(b.kind);
  $("#building-visits").hidden = utility;
  if (utility) $("#building-activity").textContent = b.progress < 100 ? "Open Village → Construction for materials and installation. It connects when construction finishes." : "Works automatically. Manage shared lighting in Power.";
  for (const button of $("#building-neighbours").querySelectorAll("button")) button.disabled = !b || b.progress < 100 || !!state.residents.find(r=>r.id===Number(button.dataset.visitor))?.trip;
}
function inspectBuilding(id) {
  showPanel("building-panel");
  updateBuildingPanel();
  $("#building-choice").value = String(id);
  $("#building-response").textContent = "";
  updateBuildingPanel();
}
function updateSupplies(v) {
  $('#hen-controls').hidden=!buildingUnlocked(v,'coop');
  $('#egg-control').hidden=!buildingUnlocked(v,'coop');
  const s = v.supplies;
  const coops = v.buildings.filter(b => b.kind === "coop" && b.progress >= 100);
  const fed = coops.filter(b => b.poultry.remaining > 0);
  const days = (v.food + v.meals) / 15;
  $("#pantry-stock").textContent = `${Math.floor(v.food)} ingredients · ${s.eggs} eggs · ${v.meals} ready meals`;
  $("#pantry-outlook").textContent = v.mode==='sandbox' ? "Sandbox replenishes ingredients, water and meals. Neighbours keep their daily routines and have time for hobbies." : `${days < 1 ? "Time to top up the pantry. " : ""}About ${days.toFixed(1)} days of food before cooking gains or hen feed. Neighbours aim for a modest reserve, then take time for hobbies. Chores: 9–12 and 15–16; urgent foraging can happen anytime while awake.`;
  $("#pantry-flow").textContent = `${Math.floor(s.gathered)} ingredients gathered / ${Math.floor(s.used)} used · ${s.eggs_laid} eggs laid · ${s.meals_cooked} meals cooked · ${s.portions_eaten} portions eaten`;
  $("#use-eggs").checked = s.use_eggs;
  $("#feed-hens").checked = s.feed_hens;
  $("#kitchen-status").textContent = !v.buildings.some(b => b.kind === "kitchen" && b.progress >= 100)
    ? "Build a kitchen to stretch your harvest into meals."
    : v.meals >= 8 ? "Enough meals for now. The kitchen can take a break."
    : v.water < 1 ? "Cooking needs water. Residents can collect it from the river."
    : v.food < (s.use_eggs && s.eggs >= 2 ? 2 : 3) ? "Waiting for ingredients."
    : s.use_eggs && s.eggs >= 2 ? "Next pot: egg meals. Residents cook when meals are running low." : "Next pot: simple meals. Residents cook when meals are running low.";
  $("#coop-status").textContent = !coops.length ? "Build a coop to start producing eggs."
    : `${fed.length} of ${coops.length} coops fed${fed.length ? ` · next eggs in ${Math.ceil(Math.min(...fed.map(b => b.poultry.remaining)) / 60)} daylight hours` : ""}. ${!s.feed_hens ? "New feeding is paused." : s.eggs + fed.length * 3 + 3 > 12 ? "Enough eggs laid or on the way. Feeding pauses until some are used." : v.food < 9 ? "New feeding waits until there are 9 ingredients." : "Feed is available."}`;
  $("#pantry-weather").textContent = `${Math.floor(v.water)} / ${state.environment.water_capacity} water. ${state.environment.dry_day ? "Dry today; rain returns tomorrow afternoon." : "Rain today from 14:00 to 17:00."} Gardens pause safely when dry.`;
}
function updateSituations() {
  const view = situationView(state.village, state.residents);
  $("#situations-label").textContent = view.label;
  $("#open-situations").dataset.concern=String(!!state.village.situations.active);
  $("#open-situations").setAttribute("aria-label",view.label);
  const portrait=state.village.situations.active?`<div class="situation-portrait">${avatar(state.village.situations.active.resident)}</div>`:'';
  const content=$('#situation-content'),markup=portrait+view.markup;
  if(content._markup!==markup){replaceMarkup(content,markup);paintPortraits();}
}
function openSituations() {
  $("#quest-dialog").close();
  updateSituations();
  $("#situation-dialog").showModal();
}
function updateUI() {
  const free = state.village.mode==='sandbox';
  $('#mode-badge').textContent=free?'Sandbox':'Story';
  $('#mode-label').textContent=`${free?'SANDBOX':'STORY'}`;
  $('.goal-tracker').hidden=free;
  $('[data-panel="goals-panel"]').hidden=free;
  $('[data-panel="projects-panel"]').hidden=free;
  $('[data-panel="town-panel"]').hidden=free;
  $('[data-panel="power-panel"]').hidden=!buildingUnlocked(state.village,'solar_farm');
  $('#new-scenario').textContent=free?'New sandbox':'New story';
  $('#help-intro').textContent=free?'Sandbox unlocks every building. Construction is instant and free; ingredients, meals, water, tools and funds replenish while village life unfolds.':'Story follows seven chapters. Blueprints are free; Village → Construction tracks materials and Trade offers delivery or resident pickup. Each chapter opens the next part of village life.';
  replaceMarkup($('#help-start'),free?'<b>Build freely.</b> Open Build, choose any building, then click a clearing. Select it in Buildings to change crops, invite a visitor, or remove it and reuse the plot.':'<b>Start with the essentials.</b> Open Journal and follow A Shared Beginning: a cistern, homes, a garden and a kitchen. Plan their materials in Village → Construction; residents build during normal work hours.');
  economyUI?.update();
  updateSituations();
  const v = state.village;
  updateSupplies(v);
  updatePowerUI(state,kinds);
  updateBuildingPanel();
  for (const k of ["wood", "food", "water"])
    $("#" + k).textContent = Math.floor(v[k]);
  $("#happiness").textContent =
    Math.round(state.residents.reduce((s, r) => s + r.happiness, 0) / 5) + "%";
  const mins = Math.floor(v.minutes) % 1440;
  $("#date").textContent =
    `Day ${Math.floor(v.minutes / 1440) + 1} · ${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  const night = mins < 360 || mins >= 1140;
  $(".season-icon").textContent = night ? "☾" : "☀";
  $(".season small").textContent = state.environment.raining ? 'Rainfall' : weatherConditions(state.environment,v.minutes).wet>.1 ? 'After the rain' : mins < 360 || mins >= 1260 ? 'Night' : mins < 720 ? 'Morning' : mins < 1080 ? 'Afternoon' : 'Evening';
  const env = state.environment;
  const gardens = v.buildings.filter(
    (b) => ["garden", "greenhouse"].includes(b.kind) && b.progress >= 100,
  );
  const counts = { plant: 0, thirsty: 0, growing: 0, harvest: 0 };
  for (const b of gardens) {
    const c = b.crop;
    counts[
      !c.planted
        ? "plant"
        : c.growth >= cropDuration(c)
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
    el.querySelector("small").textContent =
      activityLabel(r);
    el.querySelector(".energy-tiny i").style.width = r.energy + "%";
  }
  if (selected !== null) {
    const r = state.residents.find((r) => r.id === selected);
    const job=env.economy.jobs.find(j=>j.id===r.id);
    $('#person .occupation-title').textContent=job.title;
    $('#person .occupation-income').textContent=`R$ ${job.income/100} for the shared fund · 09:00–17:00`;
    $('#person .occupation-description').textContent=job.description;
    $('#person .occupation-toggle').checked=job.enabled;
    $('#person .occupation-toggle').setAttribute('aria-label',`Schedule ${r.name}'s outside job`);
    $('#person .occupation-schedule-note').textContent=r.trip?.purpose==='work'?'This shift is committed. Turning this off stops future shifts.':job.enabled?(v.minutes%1440>=600?'Next outside shift tomorrow at 09:00. Lunch is provided off-site.':'Leaves 09:00–10:00 when rested. Lunch is provided off-site.'):'Optional · staying available for village life.';
    for(const button of $('#person').querySelectorAll('[data-task]'))button.disabled=!!r.trip;
    $("#person .quote").hidden = !!response && r.requested && response.endsWith(r.reason);
    $("#person .quote").textContent = "“" + (r.task === "idle" ? idleLabels[residentActivity(r, v.minutes)] + "." : r.reason) + "”";
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
    const activity=(r.requested ? 'Your request · ' : '') + (!r.trip && r.task!=='sleep' && Math.hypot(r.x-r.target_x,r.y-r.target_y)>.08 ? 'On the way · ' : '') + activityLabel(r);
    const activityEl=$("#person .person-activity");
    if(activityEl.textContent!==activity)activityEl.textContent=activity;
    $("#person .response").hidden = !response;
    const reply=$("#person .response");
    if(reply.textContent!==response)reply.textContent=response;
    $("#person .persuade").hidden = !encouragable || !!r.trip;
    $("#person .request-pause").hidden = !paused || !r.requested;
    $("#person .request-pause").textContent = `The village is paused. Resume time to let ${r.name} continue.`;
    $("#person .resume-request").hidden = !paused || !r.requested;
  }
  for (const button of document.querySelectorAll(".build-tool")) {
    const unlocked = buildingUnlocked(v, button.dataset.kind);
    button.classList.toggle("locked", !unlocked);
    button.classList.remove("unaffordable");
    const quest = unlockQuest[button.dataset.kind];
    button.querySelector("small").textContent = unlocked
      ? button.dataset.kind === "road" ? "Free" : v.mode==='sandbox' ? "Free · instant" : "Free blueprint"
      : "Quest reward";
    button.title = unlocked
      ? `${kinds[button.dataset.kind][1]} · ${free?'Free · instant construction':recipeSummary(state,button.dataset.kind)}`
      : `Complete ${quests[quest].title} to unlock`;
    button.setAttribute(
      "aria-label",
      unlocked
        ? v.mode==='sandbox' ? `Build ${kinds[button.dataset.kind][0]}, free and instant` : `Plan ${kinds[button.dataset.kind][0]}, free blueprint`
        : `View quest to unlock ${kinds[button.dataset.kind][0]}`,
    );
    button.classList.toggle("active", button.dataset.kind === tool);
    button.setAttribute("aria-pressed", String(button.dataset.kind === tool));
  }
  gameUI?.update(state,!!sandbox||artworkPreview||!!directScenario,selected);
}
function setTool(kind) {
  if (kind && !buildingUnlocked(state.village, kind)) {
    openJournal();
    return;
  }
  if (kind) buildMenu.reveal(kind);
  if (kind && $("#build-panel").hidden) {
    closePanels();
    $("#person").hidden = true;
    selected = null;
    $("#build-panel").hidden = false;
    $('[data-panel="build-panel"]').setAttribute("aria-expanded", "true");
    $(`[data-kind="${kind}"]`).focus();
  }
  cameraTarget = null;
  tool = tool === kind ? null : kind;
  $("#placement").classList.remove("invalid");
  $("#placement").hidden = !tool;
  $("#placement").textContent = tool
    ? tool === "road" ? "Road · Click to add or remove · Free · Esc to finish" : `Place ${kinds[tool][0].toLowerCase()} · ${state.village.mode==='sandbox'?'Free · instant':recipeSummary(state,tool)} · Esc to cancel`
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
  const elapsed = Math.max(0, (stamp - last) / 1000);
  const dt = Math.min(elapsed, 0.1);
  last = stamp;
  const running =
    !paused && !document.hidden && !document.querySelector("dialog[open]");
  animationDelta = running ? dt * Math.min(simulationSpeed(game, speed), 2) : 0;
  if (cameraTarget) cameraTarget.dt = dt;
  sound.update(running, state.environment.raining, state.village.minutes, state.residents.some(r => r.task === "build" && Math.hypot(r.x-r.target_x, r.y-r.target_y) < 0.2));
  if (running) {
    if(!reducedMotion.matches)weatherTime += dt;
    time += advanceSimulation(game, Math.min(elapsed, 1), speed);
  }
  state = JSON.parse(game.snapshot());
  $("#auto-speed").hidden = !running || !game.fast_forward_ready();
  render();
  uiElapsed += dt;
  saveElapsed += elapsed;
  if (uiElapsed > 0.3) {
    updateUI();
    if (running) announceMilestones();
    uiElapsed = 0;
  }
  if (saveElapsed > 15) {
    save();
    saveElapsed = 0;
  }
  requestAnimationFrame(frame);
}
function setup() {
  gameUI=installGameUI({images:buildingImages,avatar,paintPortraits,selectPerson,
    showPanel,closePanels,openDev:()=>{$('#help-dialog').close();devTools.open();},
    focusAt:(x,y)=>{const p=iso(x,y);cameraTarget={x:pan.x+width/2-p.x,y:pan.y+height*.45-p.y,dt:1/60};},
    worldView:()=>[[0,0],[width,0],[width,height],[0,height]].map(([x,y])=>unproject(x,y,origin,scale))});
  $('#open-village').onclick=()=>{
    if(!$('#village-book').hidden){closePanels();return;}
    showPanel($(`[data-panel="${lastVillagePanel}"]`).hidden?'building-panel':lastVillagePanel);
  };
  economyUI=installEconomyUI({avatar,paintPortraits,snapshot:()=>state,game:()=>game,changed:()=>{state=JSON.parse(game.snapshot());updateUI();save();},notify:toast,openTown:()=>showPanel('town-panel'),locate:id=>{const b=state.village.buildings.find(b=>b.id===id);if(b){closePanels();const p=iso(b.x,b.y);cameraTarget={x:pan.x+width/2-p.x,y:pan.y+height*.42-p.y,dt:1/60};}}});
  previousVillage = state.village;
  for (const event of ["pointerdown", "keydown"]) document.addEventListener(event, () => { void sound.start(); });
  for (const [id, key] of [["ambience-volume", "ambienceVolume"], ["effects-volume", "effectsVolume"]]) {
    const input = $("#" + id); input.value = Math.round(settings[key] * 100);
    $("#" + id + "-value").textContent = `${input.value}%`;
    input.oninput = () => {
      settings[key] = Number(input.value) / 100;
      $("#" + id + "-value").textContent = `${input.value}%`;
      $("#settings-status").textContent = saveSettings(settings) ? "Saved on this device." : "Applied for this session. Device storage is unavailable.";
    };
  }
  for (const id of ["next-crop", "replant-crop"]) $("#"+id).onchange = () => {
    game.configure_crop(Number($("#building-choice").value), $("#next-crop").value, $("#replant-crop").checked);
    state = JSON.parse(game.snapshot()); updateUI(); save();
  };

  $("#building-neighbours").innerHTML = state.residents.map(r => `<button data-visitor="${r.id}">${escapeHtml(r.name)}</button>`).join("");
  $("#building-choice").onchange = () => { $("#building-response").textContent = ""; updateBuildingPanel(); };
  $('#remove-sandbox-building').onclick=()=>{
    const b=state.village.buildings.find(b=>b.id===Number($('#building-choice').value));
    if(!b||state.village.mode!=='sandbox')return;
    pendingRemoval=b.id;
    $('#sandbox-remove-note').textContent=`Remove ${kinds[b.kind][0].toLowerCase()} ${b.id+1} and its crops or contents? You can rebuild for free in Sandbox.`;
    $('#sandbox-remove-dialog').showModal();
  };
  $('#sandbox-remove-close').onclick=()=>{pendingRemoval=null;$('#sandbox-remove-dialog').close();};
  $('#sandbox-remove-confirm').onclick=()=>{
    if(pendingRemoval!==null&&game.remove_sandbox_building(pendingRemoval)) {
      residentAnimations.clear();state=JSON.parse(game.snapshot());updateUI();save();toast('The plot is clear. Build something new whenever you like.');
    }
    pendingRemoval=null;$('#sandbox-remove-dialog').close();
    ($('#building-choice').disabled?$('#building-panel [data-close-panel]'):$('#building-choice')).focus();
  };
  $("#building-neighbours").onclick = event => {
    const button = event.target.closest("[data-visitor]");
    if (!button) return;
    $("#building-response").textContent = game.visit_building(Number(button.dataset.visitor), Number($("#building-choice").value));
    state = JSON.parse(game.snapshot());
    updateUI();
    save();
  };

  $("#build-solar").onclick=()=>setTool("solar_farm");
  $("#build-streetlight").onclick=()=>setTool("streetlight");
  $("#power-loads").onchange=event=>{
    const input=event.target.closest('[data-power-building]');if(!input)return;
    game.set_power_enabled(Number(input.dataset.powerBuilding),input.checked);
    state=JSON.parse(game.snapshot());updateUI();save();
  };
  for (const id of ["feed-hens", "use-eggs"]) {
    $("#" + id).onchange = () => {
      game.set_food_preferences($("#feed-hens").checked, $("#use-eggs").checked);
      state = JSON.parse(game.snapshot());
      updateUI();
      save();
    };
  }
  $("#open-situations").onclick = openSituations;
  $("#journal-situations").onclick = openSituations;
  $("#close-situation").onclick = () => $("#situation-dialog").close();
  $("#situation-content").onclick = (event) => {
    const button = event.target.closest("[data-situation-response]");
    if (!button) return;
    const result = game.respond_situation(button.dataset.situationResponse);
    state = JSON.parse(game.snapshot());
    updateUI();
    save();
    toast(result === "ok" ? "The collective has agreed. Close the situation to give everyone time." : result);
    $("#close-situation").focus();
  };
  for (const button of document.querySelectorAll("[data-panel]")) {
    button.onclick = () => {
      if(button.dataset.panel==='goals-panel'){openJournal();return;}
      const isOpen = button.getAttribute("aria-expanded") === "true";
      if (isOpen && !villagePanels.has(button.dataset.panel)) { closePanels(); if (tool) setTool(null); }
      else showPanel(button.dataset.panel);
    };
  }
  for (const button of document.querySelectorAll("[data-close-panel]")) {
    button.onclick = () => {
      const id = button.closest("[id]").id;
      closePanels();
      if (tool) setTool(null);
      $(villagePanels.has(id)?'#open-village':`[data-panel="${id}"]`).focus();
    };
  }
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
  buildMenu = installBuildMenu(kinds, buildingImages, () => { if (tool) setTool(null); });
  $("#tools").onclick = (e) => {
    const b = e.target.closest("[data-kind]");
    if (b) setTool(b.dataset.kind);
  };
  $("#open-journal").onclick = openJournal;
  $("#close-journal").onclick = () => $("#quest-dialog").close();
  $('#quest-dialog').addEventListener('close',()=>{$('[data-panel="goals-panel"]').setAttribute('aria-expanded','false');$('[data-panel="goals-panel"]').focus();});
  $('#journal-chapters').onclick=e=>{const button=e.target.closest('[data-chapter]');if(!button)return;journalPage=Number(button.dataset.chapter);updateQuests();$(`#journal-chapters [data-chapter="${journalPage}"]`).focus({preventScroll:true});};
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
      for (const x of document.querySelectorAll("[data-speed]")) {
        x.classList.toggle("active", x === b);
        x.setAttribute("aria-pressed", String(x === b));
      }
    };
  $("#save").onclick = () => save(true);
  function downloadVillage(raw, name) {
    const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $("#export-save").onclick = () => downloadVillage(game.snapshot(), `solar-friends-${state.village.mode||'story'}.json`);
  $("#export-recovery").onclick = () => downloadVillage(storage.rejected, "solar-friends-recovery.json");
  $("#import-save").onclick = () => $("#import-file").click();
  $("#restore-backup").onclick = () => {
    const candidate = new Game();
    try {
      const raw = storage.readBackup();
      if (raw === null) { toast("No backup yet. Imports and new villages create one automatically."); return; }
      if (!candidate.restore(raw)) { toast("This backup could not be read. Your current village is unchanged."); return; }
      pendingImport = candidate.snapshot();
      $("#import-summary").textContent = "Restore the previous village? Your current village will take its place in the backup.";
      $("#import-dialog").showModal();
    } catch { toast("Device storage is unavailable. Import an exported village instead."); }
    finally { candidate.free(); }
  };
  $("#import-file").onchange = async (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 5_000_000) { toast("Choose a village save smaller than 5 MB."); return; }
    const candidate = new Game();
    try {
      const raw = await file.text();
      if (!candidate.restore(raw)) throw new Error("invalid");
      pendingImport = candidate.snapshot();
      $("#import-summary").textContent = `Load ${file.name}? Your current village will be backed up on this device.`;
      $("#import-dialog").showModal();
    } catch { toast("This file is not a valid village save. Your village is unchanged."); }
    finally { candidate.free(); }
  };
  $("#cancel-import").onclick = () => { pendingImport = null; $("#import-dialog").close(); };
  $("#confirm-import").onclick = () => {
    if (sandbox || artworkPreview || directScenario) return;
    if (!pendingImport || sandbox || artworkPreview || directScenario) return;
    try {
      const mode=JSON.parse(pendingImport).village.mode || 'story';
      const target=modeStores[mode];
      const existing=target.read();
      if(existing!==null)target.backup(existing);
      target.write(pendingImport);
      storage=target;
    } catch {
      $("#save-warning").hidden = false;
      toast("Could not back up and save the import. Your current village is unchanged.");
      $("#import-dialog").close();
      return;
    }
    game.restore(pendingImport);
    pendingImport = null;
    residentAnimations.clear();
    state = JSON.parse(game.snapshot());
    selected = null; tool = null; closePanels();
    $("#person").hidden = true; $("#placement").hidden = true;
    $("#import-dialog").close(); $("#settings-dialog").close();
    resetPolish(); updateUI(); save(); toast("Your village is ready. Welcome back.");
  };
  for (const id of ["import-save", "restore-backup", "new-scenario"]) $("#" + id).disabled = artworkPreview || !!directScenario;
  $("#save-warning").onclick = () => $("#settings").click();
  $('#new-scenario').onclick = () => requestNewMode(state.village.mode || 'story');
  $('#cancel-restart').onclick = () => {pendingMode=null;$('#restart-dialog').close();};
  $('#confirm-restart').onclick = () => {if(pendingMode)startMode(pendingMode);};
  $("#placement-grid").checked = settings.placementGrid;
  $("#settings").onclick = () => {
    try { storage.readRecovery(); } catch { /* A download already held in memory remains available. */ }
    $("#export-recovery").hidden = storage.rejected === null;
    $("#settings-dialog").showModal();
  };
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
  $("#zoom-in").onclick = () => {setZoom(zoom + 0.15);render();};
  $("#zoom-out").onclick = () => {setZoom(zoom - 0.15);render();};
  $("#center").onclick = () => {
    cameraTarget = null;
    setZoom(1.3);
    pan = { x: 0, y: 0 };
  };
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moved: false };
  });
  canvas.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
    if (drag) {
      cameraTarget = null;
      const dx = e.clientX - drag.x,
        dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) > 5) drag.moved = true;
      if (drag.moved) pan = { x: drag.px + dx, y: drag.py + dy };
    }
  });
  canvas.addEventListener("pointerup", (e) => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    if (moved) return;
    const rect = canvas.getBoundingClientRect(),
      x = e.clientX - rect.left,
      y = e.clientY - rect.top;
    pointer = { x, y };
    if (tool) {
      const p = uniso(x, y),
        result = tool === "road" ? game.toggle_road(p.x, p.y) : game.place(tool, p.x, p.y);
      if (result === "ok") {
        if (tool !== "road") {
          toast(state.village.mode==='sandbox'?`${kinds[tool][0]} is ready.`:`${kinds[tool][0]} planned. Let's build it together.`);
          setTool(null);
        }
        state = JSON.parse(game.snapshot());
        save();
      } else toast(result);
    } else {
      const r = residentAt(x, y);
      if (r) selectPerson(r.id);
      else {
        const cell = uniso(x, y);
        const b = [...state.village.buildings].reverse().find(b => {
          return occupies(b,cell.x,cell.y);
        });
        if (b) inspectBuilding(b.id);
      }
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
      setZoom(zoom - e.deltaY * 0.001);
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
    if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.repeat&&!document.querySelector('dialog[open]')&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)) {
      const shortcuts={KeyB:'build-panel',KeyV:$(`[data-panel="${lastVillagePanel}"]`).hidden?'building-panel':lastVillagePanel,KeyP:'community-panel',KeyI:'supplies-panel'};
      if(shortcuts[e.code]){e.preventDefault();const id=shortcuts[e.code];if(!$(`[data-panel="${id}"]`).hidden)showPanel(id);}
      if(e.code==='KeyJ'&&!$('[data-panel="goals-panel"]').hidden){e.preventDefault();openJournal();}
      if(e.code==='KeyM'){e.preventDefault();if(tool)setTool(null);closePanels();selected=null;$('#person').hidden=true;$('#village-map').focus();}
    }
    if (e.code === "Escape" && !document.querySelector("dialog[open]")) {
      e.preventDefault();
      if (tool) setTool(null);
      else if (selected !== null) $(".close-person").click();
      else {
        const active = document.querySelector('[data-panel][aria-expanded="true"]');
        if(active){const focus=villagePanels.has(active.dataset.panel)?$('#open-village'):active;closePanels();focus.focus();}
        else openMainMenu();
      }
    }
  });
  window.addEventListener("resize", resize);
  window.addEventListener("pagehide", () => save());
  document.addEventListener("visibilitychange", () => {
    last = 0;
    if (document.hidden) { save(); sound.update(false, false, 0, false); }
  });
  resize();
  updateUI();
  $("#loading").hidden = true;
  requestAnimationFrame(frame);
}
// Both the workbench and automated checks use this interface. Mutations require
// a sandbox; the original Game object stays untouched until it is restored.
function refreshDevScene() {
  setZoom(zoom);
  residentAnimations.clear(); groundKey = null; time = 0; weatherTime = 0; animationDelta = 0;
  state = JSON.parse(game.snapshot()); selected = null; tool = null;
  previousVillage = state.village; cameraTarget = null; milestoneQueue.length = 0;
  clearTimeout(celebrationTimer); showingMilestone = false; $("#milestone").hidden = true;
  clearTimeout(toastTimer); $("#toast").hidden = true;
  closePanels(); $("#person").hidden = true; $("#placement").hidden = true;
  for (const id of ['import-save', 'restore-backup', 'new-scenario']) $("#" + id).disabled = !!sandbox || artworkPreview || !!directScenario;
  updateUI(); render();
}
const devAPI = {
  snapshot: () => JSON.parse(game.snapshot()),
  inspect: () => JSON.parse(game.dev_inspect()),
  observe: () => game.dev_observe(true),
  isSandbox: () => !!sandbox,
  scenario: () => sandboxName || (artworkPreview ? 'Artwork preview' : 'Saved village'),
  async loadScenario(id) {
    if (loadingScenario) throw new Error('A scenario is already loading.');
    loadingScenario = true;
    const candidate = new Game();
    try {
      let raw;
      if (id === 'copy') raw = game.snapshot();
      else {
        const fresh = JSON.parse(candidate.snapshot());
        const response = await fetch('./artwork/village-preview.json');
        if (!response.ok || !candidate.restore(await response.text())) throw new Error('Could not load the village fixture.');
        raw = JSON.stringify(makeScenario(id, fresh, JSON.parse(candidate.snapshot())));
      }
      if (!candidate.restore(raw)) throw new Error('Scenario failed simulation validation.');
    } catch (error) { candidate.free(); throw error; }
    finally { loadingScenario = false; }
    if (!sandbox) sandbox = { game, paused, zoom, pan: { ...pan }, time };
    else game.free();
    game = candidate; sandboxName = id; game.dev_observe(true);
    if (!paused) togglePause();
    refreshDevScene(); devTools?.refresh();
  },
  importSandbox(raw) {
    if(loadingScenario)throw new Error('Wait for the scenario to finish loading.');
    if(raw.length>5_000_000)throw new Error('Choose a checkpoint smaller than 5 MB.');
    const candidate=new Game();
    if(!candidate.restore(raw)){candidate.free();throw new Error('This checkpoint is not a valid village. The current scene is unchanged.');}
    if(!sandbox)sandbox={game,paused,zoom,pan:{...pan},time};else game.free();
    game=candidate;sandboxName='imported';game.dev_observe(true);if(!paused)togglePause();
    refreshDevScene();devTools?.refresh();
  },
  returnToVillage() {
    if (loadingScenario) throw new Error('Wait for the scenario to finish loading.');
    if (!sandbox) return;
    game.free();
    ({ game, zoom, pan, time } = sandbox);
    const wasPaused = sandbox.paused;
    sandbox = null; sandboxName = '';
    if (paused !== wasPaused) togglePause();
    refreshDevScene(); devTools?.refresh();
    if (directScenario) location.assign('./');
  },
  advance(minutes) {
    if (!sandbox) throw new Error('Load a sandbox before advancing time.');
    if (!paused) togglePause();
    advanceGame(game, minutes); residentAnimations.clear(); state = JSON.parse(game.snapshot()); updateUI(); render();
    return devAPI.snapshot();
  },
  run() { if (!sandbox) throw new Error('Load a sandbox first.'); if (paused) togglePause(); },
  fixedView() { cameraTarget = null; if (!paused) togglePause(); zoom = 1; pan = { x: 0, y: 0 }; time = 0; weatherTime = 0; animationDelta = 0; residentAnimations.clear(); resize(); render(); },
  locate(id) {
    const r = state.residents.find(r => r.id === id);
    if (!r) return;
    cameraTarget = null;
    const point = project(r.x, r.y, origin, scale);
    pan.x += width / 2 - point.x; pan.y += height / 2 - point.y;
    render();
  },
  capture() {
    devAPI.fixedView();
    const a = document.createElement('a'); a.download = 'solar-friends-scene.png'; a.href = canvas.toDataURL('image/png'); a.click();
  },
};
try {
  await init({ module_or_path: "./pkg/solar_friends_bg.wasm?v=devtools-1" });
  let chickenSource, cropSource;
  if (artworkPreview && previewParams.has('art-draft')) {
    const draft = readArtDraft(previewParams.get('art-draft'));
    if (draft.config) {
      const canonical = Object.values(allBuildingArt).find(art => art.name === draft.sprite.name.replace(' · night', ''));
      if (canonical) Object.assign(canonical, { width: draft.config.width, anchor: draft.config.anchor, ...(draft.config.axes ? {axes:draft.config.axes} : {}) });
    }
    if (draft.candidate) {
      const path = draft.sprite.file.replace('../', '');
      const allImages = [...Object.values(buildingImages), ...Object.values(nightBuildingImages), forestArt, terrain, ...animations, ...idleAnimations, ...activityAnimations];
      for (const image of allImages) if (new URL(image.src).pathname.endsWith('/' + path)) image.src = draft.candidate;
      if (path === 'art/chickens.png') chickenSource = draft.candidate;
      if (path === 'art/crops.png') cropSource = draft.candidate;
    }
  }
  await Promise.all([
    loadChickenArt(chickenSource),
    ...Object.values(buildingImages).map((image) => image.decode()),
    ...Object.values(nightBuildingImages).map((image) => image.decode()),
    economyImage.decode(),
    forestArt.decode(),
    terrain.decode(),
    ...animations.map((image) => image.decode()),
    ...idleAnimations.map((image) => image.decode()),
    ...activityAnimations.map((image) => image.decode()),
    loadCropArt(cropSource),
  ]);
  for (const image of animations) preparedFrames(image,{referenceRow:2});
  for (const image of [...idleAnimations,...activityAnimations]) preparedFrames(image);
  game = new Game();
  let saved;
  if (artworkPreview) {
    const response = await fetch(residentPreview ? './artwork/resident-preview.json' : './artwork/village-preview.json');
    if (!response.ok) throw new Error('Artwork preview could not load');
    saved = await response.text();
    if (nightPreview) {
      const fixture = JSON.parse(saved);
      for (const building of fixture.village.buildings) if (building.kind === 'garden') building.crop.growth = 180;
      fixture.village.minutes = Math.floor(fixture.village.minutes / 1440) * 1440 + 21 * 60;
      saved = JSON.stringify(fixture);
    }
  }
  if (saved !== null && saved !== undefined && !game.restore(saved)) {
    if (artworkPreview) throw new Error("The artwork preview fixture is invalid");
    try { storage.quarantine(saved); } catch { $("#save-warning").hidden = false; }
    $("#recovery-notice").hidden = false;
    $("#export-recovery").hidden = false;
    toast("This save could not load. Your original data is preserved; export it in Settings.");
  }
  state = JSON.parse(game.snapshot());
  gameActive=artworkPreview || !!directScenario;
  setup();
  installMenu();
  devTools = installDevTools(devAPI);
  window.solarDev = Object.freeze(devAPI);
  if (directScenario) { await devAPI.loadScenario(directScenario); devTools.open(); }
  if(!artworkPreview && !directScenario) openMainMenu();
  if (artworkPreview) {
    const notice = document.createElement('a');
    notice.href = './';
    notice.className = 'artwork-preview-notice';
    notice.textContent = `${previewParams.has('art-draft') ? 'ART DRAFT · ' : ''}${nightPreview ? 'Night artwork' : residentPreview ? 'Resident animation' : 'Artwork'} preview · Return to your village ↗`;
    document.body.append(notice);
    togglePause();
    save();
  }
} catch (error) {
  console.error(error);
  $("#load-status").textContent =
    "The village could not load. Please reload, or check that the WebAssembly build is being served.";
}
