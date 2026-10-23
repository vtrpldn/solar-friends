import {creationPresentation} from './creation-presentation.js';
import {paintResourceSite} from './resource-site-art.js';
import {renderScenarioJournal,resetScenarioJournalUI} from './scenario-journal-ui.js';
import {residentAppearanceInfo,residentLookKeys} from './resident-look.js';
import {createResidentAppearanceLibrary} from './resident-appearance-library.js';
import {paintPreparedResidentPortrait} from './resident-portrait.js';
import {installResidentIdentity} from './resident-identity.js';
import {relationshipStrength} from './relationships.js';
import {residentStory} from './resident-story.js';
import {loadRegionalArt} from './regional-art.js';
import {terrainRevision} from './terrain-revision.js';
import {ContentLibrary} from './content-library.js';
import {PlayerSession} from './player-session.js';
let playerSession=null;
import {paintWorldGround,paintWorldTree,paintWorldBuilding,paintWorldCrops} from './world-renderer.js';
import {constructionOpacity,drawBuildingState} from './building-state-art.js';
import {paintImage} from './paint-cache.js';
import { performanceMeter } from './dev/performance.js';
import { sampleFrame } from './frame-state.js';
import {usesLogistics,usesUtilities,installSandboxRulesUI} from './sandbox-rules.js';
import {renderResidentSkills} from './resident-skills.js';
import {drawElectricalConnections,electricalOverlayRevision} from './electricity-ui.js';
import {drawBattery} from './battery-art.js';
import {drawWaterConnections,waterOverlayRevision} from './water-connections.js';
import {installLandMap} from './land-map.js';
import {gatheringInfo} from './gathering-ui.js';
import {drawCarriedMaterials,drawSupplyPile,drawCarriedWater,drawWaterPile} from './logistics-art.js';
import {sourceKinds,sourceMaterial,sourceCare} from './resource-sites.js';
import {makeArtPreview} from './dev/art-preview.js';
import {installMaintenanceUI} from './maintenance-ui.js';
import {installGameUI,itemIcon} from './game-ui.js';
import {economyImage} from './economy-art.js';
import {advanceSimulation,simulationSpeed} from './simulation-speed.js';
import {sleepLabel,residentVisible,residentIsAway,tripLabel} from './resident-presence.js';
import {installEconomyUI,recipeSummary} from './economy-ui.js';
import { footprintCorners, occupies } from './building-footprints.js';
import { installBuildMenu, paintIcon } from './build-menu.js';
import { buildingLighting, connectionLabel, updatePowerUI } from './power.js';
import { drawNightEmission, paintDepthLight } from './night-lighting.js';
import { weatherConditions, drawGroundWeather, drawWeatherAir } from './weather.js';
import { weatherSummary, updateClimateForecast } from './climate-ui.js';
import { readArtDraft } from './dev/art-draft.js';
import { installDevTools } from './dev/tools.js';
import { makeScenario, advanceGame } from './dev/scenarios.js';
import { advanceResidentAnimation, drawResidentAnimation, residentActivity, idleLabels } from './resident-animation.js?v=2';
import { RESIDENT_WIDTH, FRAME_ANCHOR, preparedFrames } from './sprite-frames.js';
import {farmNames,farmNotes,updateAgricultureUI} from './agriculture-ui.js';
import { loadCropArt, cropTypes, cropDuration } from './crop-art.js';
import { allBuildingArt, buildingArtKey, nightAmount } from './building-art.js?v=night-1';
import { situationView } from "./situations.js";
import { flock, drawChicken, loadChickenArt } from "./chickens.js?v=painted-hens-1";
import { quests, buildingUnlocked, questStatus, goalRoute, unlockQuest, questCompleted, questAvailable, completedQuests } from "./quests.js?v=modes-1";
import { loadSettings, saveSettings } from "./settings.js";
import { placementReason, movePlacementReason, milestones } from "./polish.js";
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
import init, { Game } from "./pkg/solar_friends.js";
import {
  paintTerrain,
  soilAppearance,
  MAP_SIZE,
  riverCenter,riverCurve,
  riverBank,
} from "./terrain.js?v=manual-roads-1";
const $ = (s) => document.querySelector(s);
const settings = loadSettings();
const sound = new VillageAudio(settings);
let cameraTarget = null, previousVillage = null, celebrationTimer, landMap;
const milestoneQueue = [];
let showingMilestone = false;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const previewParams = new URLSearchParams(location.search);
const meter=performanceMeter(previewParams.has('performance'));
const residentPreview = previewParams.has("resident-preview");
const nightPreview = previewParams.has("night-preview");
const artworkPreview = nightPreview || residentPreview || previewParams.has("artwork-preview");
const directScenario = previewParams.get('dev-scenario');
let sandboxRulesUI,residentIdentity;
let sandbox = null, sandboxName = '', devTools, loadingScenario = false;
const canvas = $("#world");
let ctx = canvas.getContext("2d");
const lightLayer=document.createElement('canvas'),lightContext=lightLayer.getContext('2d');
const kinds = {
  ...Object.fromEntries(Object.entries(farmNames).map(([k,n])=>[k,[n,farmNotes[k]]])),
  hydro:['River generator','Small riverbank wheel · generates all day and night'],
  eco_toilet:['Ecological toilet','Private dry toilet · sealed waste collection · handwash'],
  banana_treatment:['Banana treatment bed','Treat sewage in a sealed banana basin'],
  wetland:['Reed bed','Filter greywater into irrigation water'],
  biodigester:['Biodigester','Sealed waste + scraps → cooking gas and cured compost'],
  shed:['Community shed','Open shelter for shade, rain cover and quiet breaks'],
  warehouse:['Storage house','Store 300 extra construction materials'],
  road: ["Road", "Click to add or remove a road tile"],
  home: ["Home", "Three beds and a good night’s rest"],
  greenhouse: ["Greenhouse", "Retain moisture · raise seedlings · needs stored water"],
  garden: ["Garden", "Plant, water, grow, then harvest"],
  kitchen: ["Kitchen", "Meals taste better together"],
  well: ["Cistern", "Catch rainfall · store 75 more water"],
  grove: ["Food forest", "Gather fresh fruit when the pantry needs it"],
  compost: ["Compost", "Two organic residues enrich the next harvest"],
  square: ["Square", "Gatherings bring neighbours closer"],
  coop: ["Chicken coop", "A sheltered home for three roaming hens"],
  workshop: ["Workshop", "Craft tools for building and harvests"],
  solar_farm: ["Solar farm", "Collect sunshine · store energy for shared lights"],
  streetlight: ["Street light", "Light village paths · needs shared power"],
};
const tasks = {
  haul: "Hauling building supplies",
  visit: "Visiting a village building",
  arrive: "Arriving at our new home",
  sanitation: "Using the ecological toilet",
  idle: "Enjoying a quiet moment",
  sleep: "Sleeping until morning",
  eat: "Sitting down to eat",
  rest: "Resting in the shade",
  garden: "Tending the garden",
  build: "Building together",
  building_work: "Working on a building crew",
  gather: "Foraging fresh food",
  source: "Collecting local materials",
  prepare: "Preparing building materials",
  outside: "Working at a neighbouring farm",
  pickup: "Driving to collect town supplies",
  return: "Returning to the village",
  cook: "Making a shared meal",
  water: "Moving water or closed service containers",
  utility: "Working on village services",
  socialize: "Finding some company",
  compost: "Turning organic residues",
  restore: "Restoring the soil",
  craft: "Crafting useful tools",
  gathering: "Sharing food and stories",
  nature_walk: "Enjoying a nature walk",
  birdwatch: "Watching the birds",
  stretch: "Enjoying gentle stretches",
  daydream: "Sitting and daydreaming",
  stargaze: "Watching the stars",
};
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
for(const [kind,art]of Object.entries(allBuildingArt))if(art.emptyFile){const image=new Image();image.src=`art/${art.emptyFile}`;buildingImages[kind+':empty']=image;nightBuildingImages[kind+':empty']=image;}
const terrain = new Image();
terrain.src = "art/terrain-atlas.png";
const animations = residentLookKeys.map((name) => {
  const image = new Image();
  image.src = `art/animations/${name}.png`;
  return image;
});
const idleAnimations = residentLookKeys.map(name => {
  const image = new Image(); image.src = `art/animations/${name}-idle.png`; return image;
});
const activityAnimations = residentLookKeys.map(name => {
  const image = new Image(); image.src = `art/animations/${name}-activities.png`; return image;
});
const residentAppearances=createResidentAppearanceLibrary({base:animations,idle:idleAnimations,activities:activityAnimations});
let residentArtworkLoading=false,residentArtworkRevision=0;
function prepareResidentCast(snapshot){const appearances=snapshot.residents.map(p=>p.appearance);residentAppearances.setActive(appearances);return Promise.all(appearances.filter(a=>!residentAppearances.isReady(a,{sheets:['base','idle','activities']})).map(a=>residentAppearances.prepare(a)));}
function ensureResidentArtwork(snapshot,ready,failed=()=>{}){
  const revision=++residentArtworkRevision,appearances=snapshot.residents.map(p=>p.appearance);residentAppearances.setActive(appearances);
  if(appearances.every(a=>residentAppearances.isReady(a,{sheets:['base','idle','activities']}))){if(residentArtworkLoading)$('#loading').hidden=true;residentArtworkLoading=false;return false;}
  residentArtworkLoading=true;$('#loading').hidden=false;$('#load-status').textContent='Preparing resident artwork…';
  prepareResidentCast(snapshot).then(()=>{if(revision===residentArtworkRevision){residentArtworkLoading=false;$('#loading').hidden=true;ready();}},error=>{if(revision===residentArtworkRevision){$('#load-status').textContent='Resident artwork could not load. Reload to retry; your saved village is preserved.';console.error(error);failed(error);}});
  return true;
}
const residentAnimations = new Map();
const residentSurfaces = new Map();
let animationDelta = 0;
let weatherTime = 0;
let groundLayer,
  groundKey = null;
const forestArt = new Image();
forestArt.src = "art/mata-atlantica-atlas.png";
const natureArt=new Image();natureArt.src="art/landscape-details.png";
let game,
  state,
  selected = null,
  tool = null,
  buildMenu, economyUI, gameUI, maintenanceUI,
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
  responseContext = null,
  encouragable = false;
const requestContext = r => JSON.stringify([r.help?.id,r.help?.phase,r.help?.reason,r.task,r.trip?.phase]);
const modeStores = Object.fromEntries(['story','sandbox'].map(mode => [mode,new VillageStorage(undefined,`${SAVE_KEY}-${mode}`)]));
let storage = modeStores.story;
let gameActive = false, menuWasPaused = false, pendingMode = null;
const villagePanels = new Set(["building-panel","supplies-panel","projects-panel","town-panel","power-panel"]);
let lastVillagePanel = "building-panel";
let journalPage = 0, scenarioGoalRegion = null, challengeFailureShown = false;
const legacyStorage = new VillageStorage();
let pendingImport = null;
let pendingRemoval = null, movingBuilding = null, movingBattery = null;
const escapeHtml = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function avatar(id) {
  const look=residentAppearanceInfo(state.residents.find(r=>r.id===id).appearance);
  return `<span class="avatar" style="background:${look.accent}20"><canvas data-portrait="${look.version===2?'parts':residentLookKeys.indexOf(look.key)}" data-portrait-resident="${id}" width="96" height="108" aria-hidden="true"></canvas></span>`;
}
let residentRosterSignature='';
function syncResidentRoster(){
  const people=[...state.residents].sort((a,b)=>a.id-b.id),signature=JSON.stringify(people.map(r=>[r.id,r.name,r.appearance]));if(signature===residentRosterSignature)return;residentRosterSignature=signature;
  $('#residents').innerHTML=people.map(r=>`<button class="resident" data-resident="${r.id}" aria-label="Meet ${escapeHtml(r.name)}">${avatar(r.id)}<span class="info"><b>${escapeHtml(r.name)}</b><small></small><span class="energy-tiny"><i></i></span></span><span class="arrow">›</span></button>`).join('');
  if(selected!==null&&!people.some(r=>r.id===selected)){selected=null;$('#person').hidden=true;}
  paintPortraits($('#residents'));
}
function paintPortraits(root=document) {
  for (const portrait of root.querySelectorAll('[data-portrait]')) {
    const person=state.residents.find(r=>r.id===Number(portrait.dataset.portraitResident));
    if(!person)continue;
    const frame=residentAppearances.portraitFrame(person.appearance);
    if(frame&&portrait._paintedFrame!==frame){paintPreparedResidentPortrait(portrait,frame);portrait._paintedFrame=frame;}
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
  if(playerSession){
    playerSession.save().then(()=>{ $("#save-status").textContent="Scenario checkpoint saved";$("#save-warning").hidden=true;if(manual)toast("Scenario checkpoint saved."); }).catch(error=>{ $("#save-status").textContent="Scenario saving unavailable";$("#save-warning").hidden=false;if(manual)toast(error.message); });
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
        button.querySelector('small').textContent=`Day ${1+Math.floor(v.minutes/1440)} · ${v.buildings.length} ${v.buildings.length===1?'building':'buildings'}${mode==='story'?` · ${completedQuests(v).filter(Boolean).length}/${quests.length} chapters`:''}`;
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
  if(ensureResidentArtwork(JSON.parse(candidate.snapshot()),()=>{enterVillage(candidate,mode);save();},()=>candidate.free()))return false;
  playerSession?.dispose({freeGame:false});playerSession=null;
  document.querySelector(".creation-session")?.remove();document.body.classList.remove("in-creation-run");
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
    if(enterVillage(candidate,mode)!==false)save();
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
  $('#menu-create').onclick=()=>{location.href='./editor.html';};
  $('#menu-scenarios').onclick=()=>{location.href='./editor.html?library=1';};
  $('#menu-settings').onclick=()=>$('#settings').click();
  $('#menu-help').onclick=openHelp;
}
function setZoom(value) {
  const limitsBefore=zoomLimits(width,height),previousScale=Math.max(.18,limitsBefore.base*zoom);
  zoom=clampZoom(width,height,value);
  const ratio=Math.max(.18,limitsBefore.base*zoom)/previousScale;
  // Preserve the same world point at the viewing centre, including a minimap
  // flight that has not finished yet. Larger zoom ranges must not lose the map.
  const anchor={x:0,y:0};
  for(const point of [pan,cameraTarget].filter(Boolean)){
    point.x=anchor.x+(point.x-anchor.x)*ratio;
    point.y=anchor.y+(point.y-anchor.y)*ratio;
  }
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
  paintWorldTree(ctx,{x,y,size:s,species},{project:iso,scale,width,height,forest:forestArt,details:natureArt,night:nightAmount(state.village.minutes)});
}
function materialSite(site,alpha=1){paintResourceSite(ctx,site,{project:iso,scale,width,height,forest:forestArt,details:natureArt,night:nightAmount(state.village.minutes),alpha});}

function sprite(kind, x, y, alpha = 1, id) {
  const complete=state.village.buildings.find(b=>b.id===id)?.progress>=100;
  paintWorldBuilding(ctx,{key:kind,x,y,alpha,emptyAnimals:!complete||state.village.buildings.find(b=>b.id===id)?.agriculture.stocked===false},{project:iso,scale,images:buildingImages,nightImages:nightBuildingImages,night:nightAmount(state.village.minutes),light:buildingLighting(state.environment.power,id,kind,complete)});
}
function buildingSprite(kind, x, y, alpha = 1, id) {
  if(kind==='home'&&id==null&&$('#home-material-method').value==='adobe'){sprite(['adobe-gable','adobe-veranda'][state.village.buildings.filter(b=>b.kind==='home').length%2],x,y,alpha,id);return;}
  sprite(buildingArtKey({kind,id},state.village.buildings,state.village.economy.projects),x,y,alpha,id);
}
function placementValid(kind, x, y) {
  if(movingBattery!==null)return game.battery_plot_available(movingBattery,x,y);
  return !(movingBuilding===null?placementReason(state.village,kind,x,y):movePlacementReason(state.village,movingBuilding,x,y));
}
let batteryPreviewKey='',batteryPreviewReason='';
function placementMessage(kind,x,y){
  if(movingBattery===null)return movingBuilding===null?placementReason(state.village,kind,x,y):movePlacementReason(state.village,movingBuilding,x,y);
  const key=JSON.stringify([movingBattery,x,y,state.village.minutes,state.village.power.battery_jobs]);
  if(key!==batteryPreviewKey){batteryPreviewKey=key;const quote=JSON.parse(game.battery_move_quote(movingBattery,x,y));batteryPreviewReason=quote.allowed?'':quote.reason;}
  return batteryPreviewReason;
}
function activityLabel(r) {
  if(r.task==='haul')return r.reason;
  if(r.trip)return tripLabel(r,state.environment.economy.jobs.find(j=>j.id===r.id));
  if(r.task === "sleep")return sleepLabel(r);
  if(r.task==='garden'){
    const kind=state.village.buildings.find(b=>b.id===r.activity_building)?.kind;
    if(kind==='goat_pasture')return 'Caring for the dairy goats';
    if(kind==='apiary')return 'Inspecting the hives and gathering honey';
    if(kind==='orchard')return 'Tending our fruit trees';
  }
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
      : event.kind === "building_work" ? event.action==='move'?"Building moved · ready in its new place.":event.action==='salvage'?"Salvage finished · recovered materials await collection.":"Demolition finished · the plot is clear."
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
  economyUI?.resetForVillage();
  previousVillage = state.village; milestoneQueue.length = 0;
  clearTimeout(celebrationTimer); showingMilestone = false; $("#milestone").hidden = true;
  movingBuilding = null; movingBattery = null; pendingRemoval = null;
  cameraTarget = null; pointer = null; setZoom(1.3); pan = { x: 0, y: 0 };
}

function building(b) {
  const p = iso(b.x, b.y),
    work=(state.village.building_jobs||[]).find(j=>j.building===b.id),
    complete = b.progress >= 100 || (work?.original_progress||0)>=100;

  const project=state.village.economy.projects.find(p=>p.building===b.id);
  const stages=state.environment.economy.projects.find(p=>p.building===b.id)?.stages.length||1;
  buildingSprite(b.kind,b.x,b.y,constructionOpacity(complete,work,project?.stage||0,stages),b.id);
  if (complete && ['garden','greenhouse'].includes(b.kind)) {
    ctx.save();if(work?.stage==='rebuild')ctx.globalAlpha*=.45;
    paintWorldCrops(ctx,b,{project:iso,scale,night:nightAmount(state.village.minutes),health:state.environment.economy.processes.growing.find(plot=>plot.building===b.id)?.health??1});
    ctx.restore();
  }
  if(complete&&!work)return;
  const stageInfo=state.environment.economy.projects.find(project=>project.building===b.id);
  drawBuildingState(ctx,{work,complete,progress:b.progress,point:p,corners:footprintCorners(b.kind,b.x,b.y).map(([x,y])=>iso(x,y)),scale,kind:b.kind,stage:project?.stage||0,label:stageInfo?.paused?'Paused':stageInfo?.stage||'Blueprint'});
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
  const animation = advanceResidentAnimation(residentAnimations.get(r.id), { ...r, sourceCare: r.task==="source" && sourceCare(state.village.economy.sources[r.activity_material]||{}), sourceMaterial: r.task === "source" ? state.village.economy.sources[r.activity_material]?.material : null, worksiteKind: state.village.buildings.find(b=>b.id===r.activity_building)?.kind, visitingKind: r.task === "visit" ? state.village.buildings.find(b => b.id === r.visit_building)?.kind : null }, state.village.minutes, animationDelta);
  residentAnimations.set(r.id, animation);
  if (!residentSurfaces.has(r.id)) {
    const surface = document.createElement('canvas'); surface.width = surface.height = 128;
    residentSurfaces.set(r.id, surface);
  }
  drawResidentAnimation(ctx, residentSurfaces.get(r.id),
    residentAppearances.provider(r.appearance), animation, p.x, py, RESIDENT_WIDTH * s);
  if(state.village.logistics?.shipments.some(h=>h.resident===r.id&&h.carrying))drawCarriedMaterials(ctx,p,s,animation.facing,nightAmount(state.village.minutes));
  const waterLoad=state.village.water_supply.trips.find(h=>h.resident===r.id&&h.carrying);if(waterLoad)drawCarriedWater(ctx,p,s,animation.facing,waterLoad.class,nightAmount(state.village.minutes));
  if(state.village.power.network?.nodes.some(n=>n.owner.kind==='carrier'&&n.owner.id===r.id))drawBattery(ctx,{x:p.x+animation.facing*8*s,y:p.y-12*s},s*.65,nightAmount(state.village.minutes),1,true);
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
let terrainSample;
function render() {
  if(residentArtworkLoading)return;
  $('#relocation-guidance').hidden=!tool||(movingBattery===null&&movingBuilding===null);
  if(!$('#relocation-guidance').hidden)$('#relocation-guidance').textContent=$('#placement').textContent;
  const weather = weatherConditions(state.environment,state.village.minutes);
  canvas.dataset.weather = weather.label;
  if (cameraTarget) {
    const blend = reducedMotion.matches ? 1 : 1 - Math.exp(-cameraTarget.dt * 9);
    pan.x += (cameraTarget.x - pan.x) * blend;
    pan.y += (cameraTarget.y - pan.y) * blend;
    if (Math.hypot(cameraTarget.x - pan.x, cameraTarget.y - pan.y) < 0.5) cameraTarget = null;
  }
  if(ctx.canvas.dataset.cameraMoving!==String(!!cameraTarget))ctx.canvas.dataset.cameraMoving=String(!!cameraTarget);
  scale = Math.min(width / 1900, height / 1050) * zoom;
  scale = Math.max(0.18, scale);
  origin = { x: width * 0.5 + pan.x, y: height * 0.5 - (MAP_SIZE - 1) * 17 * scale + pan.y };
  canvas.dataset.cameraCenter=JSON.stringify(unproject(width/2,height/2,origin,scale));
  const worldMap=state.village.scenario?.definition?.map;
  const weatherView = {map:worldMap,conditions:weather,buildings:state.village.buildings,project:iso,scale,time:weatherTime,width,height,reducedMotion:reducedMotion.matches};
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#dfe6c9";
  ctx.fillRect(0, 0, width, height);
  const visibleRoads=state.village.roads.filter(([x,y])=>!state.village.buildings.some(b=>occupies(b,x,y)));
  if(terrainSample?.land!==state.village.land)terrainSample={land:state.village.land,soil:soilAppearance(state.village.land.soil),trees:state.village.land.vegetation.filter(t=>!t.cleared)};
  const soil=terrainSample.soil;
  // Conservative screen bounds include tall crowns and their shadows.
  const standingTrees=terrainSample.trees;
  const onScreenTree=f=>{const p=iso(f.x,f.y),margin=220*scale;return p.x>=-margin&&p.x<=width+margin&&p.y>=-margin&&p.y<=height+margin;};
  for(const [key,value] of Object.entries({forestSeed:state.village.land.seed,forestCount:standingTrees.length,soilCells:soil.length}))if(canvas.dataset[key]!==String(value))canvas.dataset[key]=String(value);
  const key = JSON.stringify([state.village.land.seed,worldMap?.river,worldMap?.biome,terrainRevision(worldMap),visibleRoads,state.village.economy.sources.filter(s=>s.active).map(s=>[s.x,s.y]),soil]);
  if (groundKey !== key) {
    groundLayer = paintTerrain(terrain, visibleRoads,state.village.economy.sources.filter(s=>s.active),soil,state.village.land.seed,worldMap);
    groundKey = key;
  }
  paintWorldGround(ctx,groundLayer,origin,scale);
  const goalRegion=tool&&worldMap?.regions?.find(r=>r.id===scenarioGoalRegion);
  canvas.dataset.goalRegion=goalRegion?.id??'';
  if(goalRegion){const {x,y,width:w,height:h}=goalRegion;polygon([[x-.5,y-.5],[x+w-.5,y-.5],[x+w-.5,y+h-.5],[x-.5,y+h-.5]].map(([x,y])=>{const p=iso(x,y);return [p.x,p.y];}),'#ebc55935','#ffe5a1');const p=iso(x+(w-1)/2,y-.5);ctx.fillStyle='#49351e';ctx.font='bold 14px Georgia';ctx.textAlign='center';ctx.fillText(goalRegion.title,p.x,p.y-10);}

  // Sparse currents move along the channel in world coordinates.
  for (let i = 0; riverCenter(0,worldMap)!==null && i < Math.ceil(MAP_SIZE*1.1); i++) {
    const y = ((i * 0.93 + time * 0.12) % MAP_SIZE) - 0.5;
    const offset = Math.sin(i * 2.3) * 0.7;
    const a = iso(riverCurve(y,worldMap) + offset, y);
    const b = iso(riverCurve(y + 0.35,worldMap) + offset, y + 0.35);
    line(a.x, a.y, b.x, b.y, "#d2eee34d", Math.max(0.6, scale));
  }
  landMap?.draw({tile,pointer:pointer?uniso(pointer.x,pointer.y):null,tool});
  drawPlacementGrid();
  // Foundations and road tiles share the same half-tile boundary lattice.
  drawGroundWeather(ctx,weatherView);
  drawWaterConnections(ctx,iso,scale,state);
  drawElectricalConnections(ctx,iso,scale,state);
  const darkness = nightAmount(state.village.minutes);
  if(darkness>0){
    if(lightLayer.width!==canvas.width||lightLayer.height!==canvas.height){lightLayer.width=canvas.width;lightLayer.height=canvas.height;}
    lightContext.resetTransform();lightContext.clearRect(0,0,lightLayer.width,lightLayer.height);lightContext.setTransform(ctx.getTransform());
  }
  const objects = [
    ...(state.village.power.network?.nodes||[]).filter(n=>n.owner.kind==='ground').map(n=>({depth:n.x+n.y+.4,draw:()=>drawBattery(ctx,iso(n.x,n.y),scale,nightAmount(state.village.minutes))})),
    ...state.village.water_supply.tanks.filter(p=>p.owner.kind==='ground'&&p.water.some(n=>n>.001)).map(p=>({depth:p.x+p.y+1.2,draw:()=>drawWaterPile(ctx,iso(p.x,p.y),scale,p,nightAmount(state.village.minutes))})),
    ...(state.village.logistics?.stores||[]).filter(p=>p.owner.kind!=='warehouse'&&p.items.some(n=>n)).map(p=>({depth:p.x+p.y+1.3,draw:()=>drawSupplyPile(ctx,iso(p.x+.4,p.y+1),scale,p.items.reduce((a,b)=>a+b,0),nightAmount(state.village.minutes))})),
    ...state.village.economy.sources.filter(s=>s.active).map(site=>({depth:site.x+site.y,draw:()=>materialSite(site)})),
    ...standingTrees.filter(onScreenTree).map((f) => ({
      depth: f.x + f.y,
      draw: () => tree(f.x, f.y, f.size, f.species),
    })),
    ...state.village.buildings.map((b) => ({
      depth: b.x + b.y,
      draw: () => building(b),
      light: () => {
        if(b.progress<100)return;
        const c=state.environment.power.connections.find(c=>c.id===b.id);
        if(!['grid','roof'].includes(c?.source)||c.light_level<=0)return;
        const p=iso(b.x,b.y),key=buildingArtKey(b,state.village.buildings,state.village.economy.projects);
        drawNightEmission(ctx,nightBuildingImages[key],allBuildingArt[key],key,p.x,p.y,scale,darkness*c.light_level);
      },
    })),
    ...flock(state.village).map((hen) => ({
      depth: hen.x + hen.y + 0.1,
      draw: () => drawChicken(ctx, iso(hen.x, hen.y), scale, hen),
    })),
    ...state.residents.map((r) => ({
      depth: r.x + r.y + 0.6,
      draw: () => resident(r),
      occlude: () => {
        if(!residentVisible(r,state.village))return;
        const surface=residentSurfaces.get(r.id),animation=residentAnimations.get(r.id),p=iso(r.x,r.y);
        if(!surface||!animation)return;
        const w=RESIDENT_WIDTH*scale;ctx.save();ctx.translate(p.x,p.y);ctx.scale(animation.facing,animation.breath);ctx.drawImage(surface,-w/2,-w*FRAME_ANCHOR,w,w);ctx.restore();
      },
    })),
  ];
  objects.sort((a, b) => a.depth - b.depth).forEach(o=>{
    o.draw();
    if(darkness>0){const world=ctx;try{ctx=lightContext;paintDepthLight(ctx,o.occlude||o.draw,o.light);}finally{ctx=world;}}
  });
  landMap?.drawFocus(tile);
  for(const job of state.village.building_jobs||[]){if(job.stage!=='pack'||!job.destination)continue;const b=state.village.buildings.find(b=>b.id===job.building);polygon(footprintCorners(b.kind,...job.destination).map(([x,y])=>{const p=iso(x,y);return[p.x,p.y];}),'#a5b77422','#b9cf8b');}

  if (tool && pointer) {
    const t = uniso(pointer.x, pointer.y);
    const reason = placementMessage(tool,t.x,t.y);
    polygon(footprintCorners(tool,t.x,t.y).map(([x,y]) => {
      const p = iso(x,y); return [p.x,p.y];
    }), reason ? "#cd745a66" : "#f5f1b277", reason ? "#a74431" : "#fff8cf");
    if(movingBattery!==null)drawBattery(ctx,iso(t.x,t.y),scale,nightAmount(state.village.minutes),.55);
    else if(tool.startsWith('source_'))materialSite({material:sourceMaterial(tool),x:t.x,y:t.y,active:true,planted:true,growth:0.4,remaining:16,maximum:32},.55);
    else if (tool !== "road") buildingSprite(tool, t.x, t.y, 0.55,movingBuilding??undefined);
    $("#placement").textContent = reason || (movingBattery!==null?'Choose a battery plot · resident packing, transport and installation · Esc to cancel':movingBuilding!==null ? "Choose the new plot · residents will pack and rebuild · Esc to cancel" : `${tool === "road" ? "Road · Click to add or remove" : `Place ${kinds[tool][0].toLowerCase()} · ${tool?.startsWith('source_')?recipeSummary(state,tool):!usesLogistics(state.village)?'Free · instant':'Blueprint · materials in Construction'}`} · Drag to pan · Esc to cancel`);
    $("#placement").classList.toggle("invalid", Boolean(reason));
    if(!$('#relocation-guidance').hidden){$('#relocation-guidance').textContent=$('#placement').textContent;$('#relocation-guidance').classList.toggle('invalid',Boolean(reason));}
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
  const twilight = Math.max(0, 1 - Math.abs(altitude) / 0.3) * 0.16;
  ctx.fillStyle = `rgba(237,150,84,${twilight})`;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = `rgba(17,31,65,${darkness * 0.62})`;
  ctx.fillRect(0, 0, width, height);
  if(darkness>0){ctx.save();ctx.globalCompositeOperation='screen';ctx.drawImage(lightLayer,0,0,lightLayer.width,lightLayer.height,0,0,width,height);ctx.restore();}
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
function openHelp(){const dialog=$("#help-dialog");dialog.showModal();dialog.scrollTop=0;}
function showPanel(id,supplyPage) {
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
  if(id==='supplies-panel'&&supplyPage)gameUI.selectSupplyPage(supplyPage);
  $("#" + id).querySelector("button").focus();
  updateUI();
}
function selectPerson(id) {
  closePanels();
  if (tool) setTool(null);
  selected = id;
  response = "";
  responseContext = null;
  encouragable = false;
  $("#person").hidden = false;
  const r = state.residents.find((p) => p.id === id);
  const p = iso(r.x, r.y);
  cameraTarget = residentIsAway(r)?null:{ x: pan.x + width * 0.4 - p.x, y: pan.y + height * 0.47 - p.y, dt: 1 / 60 };
  $("#person").innerHTML =
    `<div class="resident-book-tools"><b>${escapeHtml(r.name)}</b><button class="close-person" aria-label="Close resident details">×</button></div><button class="edit-resident-identity" type="button">Name and appearance</button><span class="eyebrow">A NEIGHBOUR, NOT A NUMBER</span><div class="person-heading"><div class="person-portrait">${avatar(r.id)}</div><div><h2>${escapeHtml(r.name)}</h2>${r.pronouns?`<p>${escapeHtml(r.pronouns)}</p>`:""}<p class="traits">${escapeHtml(r.trait_name)}</p></div></div>${r.biography?`<p class="person-biography">${escapeHtml(r.biography)}</p>`:""}<p class="person-activity"></p><p class="quote"></p>${["Energy", "Fullness", "Connection", "Wellbeing"].map((n) => `<div class="stat" data-stat="${n}"><span${n==='Wellbeing'?' title="Reflects needs, home comfort and current worries."':''}>${n}</span><div class="meter"><i></i></div><span class="value"></span></div>`).join("")}<p class="request-title">Ask for a hand</p><p class="request-guide">Choose one chore. They’ll help once, then return to their own routine. Meals, rest and outside commitments still come first.</p><section class="help-order" aria-label="Your request" hidden><b class="help-phase" role="status"></b><small class="help-task"></small><p class="help-reason"></p><small class="help-time"></small><button class="cancel-help">Cancel this request</button></section><div class="response" role="status" hidden></div><button class="persuade" hidden>Explain why the community needs help</button><p class="request-pause" hidden></p><button class="resume-request" hidden>Resume time</button><div class="requests">${[
      ["garden", "Tend the farm"],
      ["build", "Help build"],
      ["building_work", "Help building crew"],
      ["gather", "Forage food"],
      ["source", "Source materials"],
      ["prepare", "Prepare materials"],
      ["water", "Water & sanitation"],
      ["cook", "Make a meal"],
      ["rest", "Take a rest"],
      ["socialize", "Spend time together"],
      ["compost", "Turn scraps"],
      ["craft", "Craft tools · 8 timber"],
    ]
      .map(([t, n]) => `<button data-task="${t}">${itemIcon(({garden:"food",build:"frames",building_work:"frames",gather:"food",source:"timber",prepare:"walls",water:"water",cook:"meals",rest:"journal",socialize:"heart",compost:"compost",craft:"tools"})[t])}<span>${n}</span></button>`)
      .join(
        "",
      )}</div><section class="resident-occupation"><b class="occupation-title"></b><small class="occupation-income"></small><p class="occupation-description"></p><label><input class="occupation-toggle" type="checkbox"> Take outside shifts</label><small class="occupation-schedule-note"></small></section><details class="resident-learning"><summary>Learning by doing</summary><div class="skill-journal"></div><label class="sandbox-learning"><input class="learning-toggle" type="checkbox"> Residents learn through useful work</label></details><details class="work-preferences"><summary>Community work</summary><p>Guide future chores. Meals, rest and outside shifts come first.</p>${[["construction","Building"],["hauling","Hauling"],["food","Food"],["materials","Materials"],["care","Water & compost"]].map(([key,label])=>`<label><span>${label}</span><select data-work-preference="${key}" aria-label="${escapeHtml(r.name)}: ${label} preference"><option value="0">Less often</option><option value="1">Share equally</option><option value="2">Prefer</option></select></label>`).join("")}<small class="work-today"></small><small class="work-preference-response" role="status"></small></details><p class="friendship-note"></p>`;
  $("#person .edit-resident-identity").onclick=()=>residentIdentity.open(id);
  $(".close-person").onclick = () => {
    selected = null;
    $("#person").hidden = true;
    updateUI();
    $(`[data-citizen="${id}"]`).focus();
  };
  $('#person .learning-toggle').onchange=event=>{game.set_resident_learning(event.target.checked);state=JSON.parse(game.snapshot());updateUI();save();};
  $('#person .occupation-toggle').onchange=event=>{game.set_resident_job(id,event.target.checked);state=JSON.parse(game.snapshot());updateUI();save();};
  $('#person .work-preferences').onchange=event=>{
    const input=event.target.closest('[data-work-preference]');
    if(!input)return;
    const result=game.set_work_preference(id,input.dataset.workPreference,Number(input.value));
    state=JSON.parse(game.snapshot());
    updateUI();save();
    $('#person .work-preference-response').textContent=result==='ok'?'Noted. This guides the next chore.':result;
  };
  paintPortraits();
  $(".close-person").focus();
  $("#person .requests").onclick = (e) => {
    const b = e.target.closest("[data-task]");
    if (b) request(b.dataset.task, false);
  };
  $("#person .persuade").onclick = () => request(lastTask, true);
  $("#person .resume-request").onclick = () => { if(paused)togglePause(); updateUI(); const status=$("#person .help-order");status.setAttribute("tabindex","-1");status.focus({preventScroll:true}); };
  $('#person .cancel-help').onclick=()=>{
    const result=game.cancel_help(id);
    response=result==='ok'?'Request cancelled.':result;
    encouragable=false;state=JSON.parse(game.snapshot());responseContext=requestContext(state.residents.find(r=>r.id===id));updateUI();save();
    $('#person .requests button:not([hidden])')?.focus();
  };
  updateUI();
}
function request(task, encourage) {
  lastTask = task;
  response = game.request(selected, task, encourage);
  encouragable = response.includes("talk about why");
  state = JSON.parse(game.snapshot());
  responseContext = requestContext(state.residents.find(r=>r.id===selected));
  updateUI();
  save();
  const help=state.residents.find(r=>r.id===selected)?.help;
  const accepted=help&&!['complete','cancelled'].includes(help.phase)&&help.task===task;
  if(accepted)toast(`${state.residents.find(r=>r.id===selected).name} accepted your request.${paused?' Resume time to let them begin.':''}`);
  const feedback=$(accepted?'#person .help-order':encouragable?'#person .persuade':'#person .response');
  feedback.scrollIntoView({block:'nearest'});
  feedback.setAttribute('tabindex','-1');feedback.focus({preventScroll:true});
}
function replaceMarkup(element, html) {
  if (element._markup !== html) {
    element.innerHTML = html;
    element._markup = html;
  }
}
function questAction(route) {
  const v=state.village;
  let label='',onClick=()=>{},disabled=false,explanation=null;
  if(route?.type==='plan'){label=`Plan ${kinds[route.kind][0].toLowerCase()} · free blueprint`;onClick=()=>{if(route.recipe){$('#home-material-method').value=route.recipe;$('#home-material-method').dispatchEvent(new Event('change'));}setTool(route.kind);};}
  if(route?.type==='visit'){label=(v.building_jobs||[]).some(j=>j.building===route.id)?'Review crew work':`Visit ${kinds[v.buildings.find(b=>b.id===route.id).kind][0].toLowerCase()}`;onClick=()=>inspectBuilding(route.id);}
  if(route?.type==='project'){
    label=route.project.paused?'Review paused project':route.project.ready?'View construction project':'Review project supplies';
    onClick=()=>showPanel('projects-panel');
    const missing=route.project.missing.map((n,i)=>n?`${n} ${state.environment.economy.materials[i].name.toLowerCase()}`:'').filter(Boolean).join(', ');
    explanation=route.project.paused?'This project is paused. Resume it in Village → Construction when you are ready.':route.project.ready?`${route.project.stage}: materials are ready. Neighbours work when they have energy, after meals and rest. Review the project or plan other essentials while it is underway.`:`The ${route.project.stage.toLowerCase()} stage is waiting for ${missing}. Open Village → Construction for the recipe and Trade for missing equipment. Choose delivery or a resident pickup; small orders can come back the same day.`;
  }
  if(route?.type==='supper'||route?.type==='tool_library'){
    const supper=route.type==='supper', gathering=gatheringInfo(v), underway=supper&&gathering.active;
    label=underway?(gathering.preparing?'Preparing welcome supper':'Welcome supper underway'):supper?'Host welcome supper · 5 meals':'Support tool library · R$ 120';
    disabled=underway;
    if(underway)explanation=gathering.summary;
    onClick=()=>{
      const result=supper?game.host_gathering():game.contribute_tool_library();
      toast(result==='ok'?(supper?'Welcome supper is planned. Its prepared meals will reach the shared table.':'The shared tool library is funded.'):result);
      state=JSON.parse(game.snapshot());updateUI();save();
    };
  }
  const chapterPanels={build:['build-panel','Review village buildings'],town:['town-panel','Open Town'],land:['projects-panel','Open Land & materials'],preparation:['projects-panel','Review material preparation'],supplies:['supplies-panel','Open Supplies'],power:['power-panel','Open Power'],people:['community-panel','Meet our neighbours']};
  if(chapterPanels[route?.type]){
    const [panel,text]=chapterPanels[route.type];label=text;
    onClick=()=>{showPanel(panel,route.page);if(route.type==='land'||route.type==='preparation'){const el=$(route.type==='land'?'#land-sources':'#preparation-recipes');el.closest('details').open=true;el.scrollIntoView({block:'nearest'});}};
  }
  if(route?.type==='land_map'){label='Read the land';onClick=()=>{if(!landMap.isOpen())$('#land-map-toggle').click();};}
  if(route?.type==='weather'){label='Read the weather forecast';onClick=()=>$('#weather-open').click();}
  if(route?.type==='situations'){label='Hear our community check-in';onClick=openSituations;}
  if(route?.type==='gathering'){const gathering=gatheringInfo(v);label=gathering.active?'Review gathering meals':`Plan a shared meal · ${gathering.portions} meal${gathering.solo?'':'s'}`;onClick=()=>{if(gathering.active){showPanel('supplies-panel','pantry');return;}const result=game.host_gathering();toast(result==='ok'?'The gathering is planned. Neighbours will deliver its meals.':result);state=JSON.parse(game.snapshot());updateUI();save();};}
  return {label,disabled,explanation,run(){
    if($('#quest-dialog').open)$('#quest-dialog').close();
    $('[data-panel="goals-panel"]').setAttribute('aria-expanded','false');
    onClick();
  }};
}
function goalValue(value){return Number.isInteger(value)?value:Number(value).toFixed(1);}
function optionalMarkup(v,q,chapter,locked){
  const options=q.options?.(v)||[];
  if(!options.length)return '';
  return `<details class="journal-options" data-choices="${chapter}"><summary>Other paths · optional</summary><p>Choose what helps our village. These paths do not block the next chapter. Markers reflect the current village; completed chapters and measured outcomes stay credited.</p>${options.map((o,index)=>`<section class="journal-option ${o.done?'done':''}"><span aria-hidden="true">${o.guide?'·':o.done?'✓':'◇'}</span><div><b>${o.label}</b><small>${o.guide?'Guide':`${goalValue(o.value)}/${o.target}${o.unit?' '+o.unit:''}`}</small><p>${escapeHtml(residentStory(state,o.hint))}</p><button data-quest-option="${chapter}:${index}" ${locked?'disabled':''}>${o.guide?'Explore this guide':o.done?'Review':'Explore this path'}</button></div></section>`).join('')}</details>`;
}
function objectiveMarkup(objectives, completed = false) {
  const current = completed ? -1 : objectives.findIndex((o) => !o.done);
  return objectives
    .map(
      (o, i) =>
        `<div class="objective ${completed || o.done ? "done" : ""} ${i === current ? "current" : ""}"><span>${completed || o.done ? "✓" : i + 1}</span><b>${o.label}</b><small>${goalValue(completed ? o.target : o.value)}/${o.target}${o.unit?' '+o.unit:''}</small></div>`,
    )
    .join("");
}
function openJournal() {
  if(tool)setTool(null);
  closePanels();selected=null;$('#person').hidden=true;
  if(state.village.scenario?.definition?.journal){const report=JSON.parse(game.scenario_journal());const active=report.chapters.findIndex(c=>c.completed_at===null);journalPage=active<0?report.chapters.length-1:active;}else journalPage = state.village.progress.tracked;
  updateQuests();
  $("#quest-dialog").showModal();
  $('[data-panel="goals-panel"]').setAttribute('aria-expanded','true');
}
function updateQuests() {
  if(state.village.scenario?.definition?.journal){
    const challengeReport=JSON.parse(game.scenario_journal());
    if(challengeReport.challenge?.status==='failed'&&!challengeFailureShown&&!document.querySelector('dialog[open]')){challengeFailureShown=true;queueMicrotask(openJournal);}
    journalPage=renderScenarioJournal(JSON.parse(game.scenario_journal()),{title:state.village.scenario.definition.title,page:journalPage,open:openJournal,replace:replaceMarkup,residents:state.residents,avatar,onRestart:async()=>{if(!playerSession)return;try{if(!paused)togglePause();await playerSession.restartScenario();refreshDevScene();updateQuests();}catch(error){toast(error.message);}},onContinue:async()=>{try{if(game.continue_scenario_freely()){state=JSON.parse(game.snapshot());updateQuests();await playerSession?.save();toast('Free continuation · the original challenge remains failed.');}}catch(error){toast(error.message);}},onAction:({action,credited})=>{
      if(action.kind==='goal'){const report=JSON.parse(game.scenario_journal()),index=report.chapters.findIndex(c=>c.goals.some(g=>g.id===action.goal));if(index>=0){journalPage=index;updateQuests();[...document.querySelectorAll('[data-scenario-goal]')].find(el=>el.dataset.scenarioGoal===action.goal)?.scrollIntoView({block:'nearest'});}return;}
      if(['supplies','water','power','housing'].includes(action.kind)){questAction(action.kind==='water'?{type:'supplies',page:'water'}:action.kind==='power'?{type:'power'}:action.kind==='housing'?{type:'build'}:{type:'supplies',page:'pantry'}).run();return;}
      if(action.kind==='people'){questAction({type:'people'}).run();if(Number.isInteger(action.resident)&&state.residents.some(p=>p.id===action.resident))selectPerson(action.resident);return;}
      if(action.kind==='delivery'){questAction({type:'supplies',page:'stores'}).run();$('#materials-stores').open=true;const button=[...document.querySelectorAll('[data-store-target]')].find(el=>Number(el.dataset.storeTarget)===action.destination);(button?.closest('.storage-location')||$('#storage-locations')).scrollIntoView({block:'nearest'});button?.focus({preventScroll:true});return;}
      questAction({type:['cultivation','operation'].includes(action.kind)?'visit':action.kind==='land'?'land':action.kind==='trade'?'town':action.kind==='production'?(action.material==='meals'?'supplies':'preparation'):credited?'build':'plan',kind:action.building,id:action.id,page:action.kind==='production'&&action.material==='meals'?'pantry':undefined}).run();
      const region=state.village.scenario?.definition?.map.regions?.find(r=>r.id===action.region);if(region){scenarioGoalRegion=region.id;const p=iso(region.x+(region.width-1)/2,region.y+(region.height-1)/2);cameraTarget={x:pan.x+width/2-p.x,y:pan.y+height*.4-p.y,dt:1/60};}
    }});paintPortraits($('#quest-list'));return;
  }
  resetScenarioJournalUI();
  const v = state.village,
    p = v.progress;
  const completions = completedQuests(v);
  if(v.mode !== 'sandbox') {
  const id = p.tracked,
    quest = quests[id],
    done = completions[id];
  const opening=JSON.parse(game.story_opening());
  const objectives = quest.objectives(v,opening),
    next = objectives.find((o) => !o.done);
  const finished=completions.every(Boolean);
  const completedCount = done ? objectives.length : objectives.filter(o => o.done).length;
  $("#goal-label").textContent = finished ? "A flourishing village" : done ? "A shared dream fulfilled" : quest.title;
  $("#goal-next").textContent = finished ? `${quests.length}/${quests.length} chapters complete · keep growing` : done ? "Follow our next chapter →" : next ? `${next.label} · ${next.value}/${next.target}` : "Let village life unfold";
  $("#goal-meter").value = completedCount; $("#goal-meter").max = objectives.length;
  $("#goal-meter").setAttribute("aria-label", `${quest.title}: ${completedCount} of ${objectives.length} objectives`);
  $("#goal-shortcut").title = residentStory(state,done ? quest.after : next?.hint || quest.story);
  $("#goal-shortcut").onclick = () => done ? openJournal() : showPanel("goals-panel");
  $("#tutorial-count").textContent = `${quest.theme} · CHAPTER ${id + 1} OF ${quests.length}`;
  $("#tutorial-title").textContent = quest.title;
  $("#tutorial-copy").textContent = residentStory(state,done ? quest.after : next?.hint || quest.story);
  $("#quest-speaker").textContent = done
    ? "✓ Quest complete"
    : `A wish from ${residentStory(state,quest.person)}`;
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
  const action=$("#tutorial-action"),shortcut=$("#goal-action"),choice=questAction(route);
  action.disabled=choice.disabled;shortcut.disabled=choice.disabled;
  if(choice.explanation)$('#tutorial-copy').textContent=choice.explanation;
  action.hidden=!route;action.textContent=choice.label;action.onclick=choice.run;
  shortcut.hidden=done||!route;shortcut.textContent=choice.label.replace(' · free blueprint','');shortcut.onclick=choice.run;
  $("#open-journal").textContent =
    done && id === 0
      ? "Choose our next quest →"
      : `Village journal · ${completions.filter(Boolean).length}/${quests.length}`;
  $("#village-needs").textContent =
    `${Math.min(state.residents.length, v.buildings.filter((b) => b.kind === "home" && b.progress >= 100).length * 3)}/${state.residents.length} beds · ${v.meals} prepared meals`;
  $("#quest-total").textContent =
    `${completions.filter(Boolean).length} of ${quests.length} chapters complete`;
  replaceMarkup($('#journal-chapters'),quests.map((q,i)=>`<button data-chapter="${i}" aria-pressed="${i===journalPage}"><span class="chapter-number">${completions[i]?'✓':i+1}</span><span><b>${q.title}</b><small>${questStatus(v,i)}</small></span></button>`).join(''));
  const openChoices=[...$('#quest-list').querySelectorAll('.journal-options[open]')].map(el=>el.dataset.choices);
  const focusedOption=document.activeElement?.dataset?.questOption;
  replaceMarkup(
    $("#quest-list"),
    quests
      .map((q, i) => {
        const status = questStatus(v, i),
          locked = !questAvailable(v,i);
        return `<article class="quest-card ${completions[i] ? "complete" : ""} ${locked ? "locked" : ""}" ${i===journalPage?'':'hidden'}>
      <div class="quest-card-art ${q.art}">${i ? `<canvas data-quest-art="${q.art}" role="img" aria-label="${allBuildingArt[q.art]?.name || q.theme} illustration"></canvas>` : "<span>☀</span>"}</div>
      <div class="quest-card-content"><span class="eyebrow">${q.theme} · ${status}</span><h3>${q.title}</h3><p class="quest-story">${escapeHtml(residentStory(state,q.story))}</p>
      ${!completions[i] ? `<p class="quest-guidance"><b>Next step</b> ${escapeHtml(residentStory(state,q.objectives(v,opening).find(o=>!o.done)?.hint || "Let village life unfold."))}</p>` : ""}
      ${objectiveMarkup(q.objectives(v,opening), completions[i])}
      ${optionalMarkup(v,q,i,locked)}
      <p class="journal-reward"><b>${completions[i] ? "Unlocked" : "Unlocks"}</b> ${q.reward}</p>
      ${completions[i] ? `<p class="quest-after">${escapeHtml(residentStory(state,q.after))}</p>` : ""}
      <button data-track="${i}" ${locked ? "disabled" : ""}>${locked ? `Complete ${quests[i-1]?.title} first` : i === id ? "Following this quest" : completions[i] ? "Explore the reward →" : "Follow this quest →"}</button></div></article>`;
      })
      .join(""),
  );
  for(const chapter of openChoices){const el=$(`#quest-list [data-choices="${chapter}"]`);if(el)el.open=true;}
  if(focusedOption)$(`[data-quest-option="${focusedOption}"]`)?.focus({preventScroll:true});
  for(const button of $('#quest-list').querySelectorAll('[data-quest-option]'))button.onclick=()=>{
    const [chapter,index]=button.dataset.questOption.split(':').map(Number),objective=quests[chapter].options(v)[index];
    let route=goalRoute(state,objective);
    if(objective.done&&route?.type==='tool_library')route={type:'town'};
    const selected=questAction(route);if(!selected.disabled)selected.run();
  };
  for(const canvas of $('#quest-list').querySelectorAll('[data-quest-art]')){
    if(!canvas._painted){const key=canvas.dataset.questArt;paintIcon(canvas,key,buildingImages[key],allBuildingArt[key]);canvas._painted=true;}
  }
  }
  const has = (kind) =>
    v.buildings.some((b) => b.kind === kind && b.progress >= 100);
  $("#village-craft").hidden =
    !has("compost") && !has("square") && !gatheringInfo(v).active;
  $("#compost-stock").hidden = !has("compost");
  $("#compost-stock").textContent =
    `${p.scraps} scraps → ${p.compost} compost · ${p.enriched_harvests} enriched ${p.enriched_harvests === 1 ? "harvest" : "harvests"}`;
  $("#tools-control").hidden = !has("workshop") && p.tool_uses===0;
  $("#tools-stock").textContent =
    `${p.tool_uses} tool ${p.tool_uses===1?'use':'uses'} owned across the village · ${p.tools_crafted} ${p.tools_crafted===1?'batch':'batches'} crafted`;
  $("#use-tools").checked = p.use_tools;
  const gathering=gatheringInfo(v);
  $("#gathering-control").hidden = !has("square") && !gathering.active;
  $("#gathering-status").textContent = gathering.summary;
  $("#shared-table").hidden = !has("square") && !p.gathering_delivery;
  $("#shared-table-status").textContent = gathering.summary;
  for(const button of document.querySelectorAll('[data-cancel-gathering]'))button.hidden=!gathering.active;
  $("#host-gathering").disabled = gathering.active || p.gathering_day === Math.floor(v.minutes / 1440);
  $("#host-gathering").textContent = gathering.active
    ? gathering.solo ? gathering.preparing?"Preparing a meal…":"A quiet mealtime…" : gathering.preparing ? "Preparing our gathering…" : "Neighbours are gathering…"
    : p.gathering_day === Math.floor(v.minutes / 1440) ? gathering.solo?"Next meal tomorrow":"Next gathering tomorrow" : gathering.solo?"Plan a quiet meal":"Host a gathering";
}
const buildingPurposes = {
  orchard:'Establish a lasting source of fruit for the village.',
  goat_pasture:'Keep a small dairy herd fed, watered and cared for.',
  apiary:'Produce honey and help nearby flowering crops.' ,
  hydro:'Produces 1.8 energy/hour day and night (less on dry days, more during rain). Adds 18 battery capacity. Workers approach from land.',
  eco_toilet:'Residents use this private toilet once a day and wash their hands with one fresh water. Waste stays sealed until processed.',
  banana_treatment:'A sealed banana evapotranspiration bed treats one toilet waste every four game hours (six per day). It produces no water or food. Open Water & waste to pause it and reserve waste for biogas.',
  wetland:'A lined reed bed filters 12 greywater into 8 irrigation water over six hours. Reclaimed water is never used for drinking or cooking.',
  biodigester:'Two sealed waste + two organic residues take eight hours to produce four cooking gas and two digestate. Digestate cures for a full day before becoming compost.',
  shed:'An open shared roof provides daytime shade and rain shelter. Residents rest and spend quiet time here, with separate places for everyone. It has no overnight beds.',
  warehouse:'A communal store adds 300 spaces for construction materials, including incoming supplies. Manage its contents in Supplies.',
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
  workshop: "Deliver eight timber to this workbench to craft twelve tool supplies. Finished tools must be carried to projects and planted beds.",
  square: "Meet neighbours: recover connection and energy. The square also hosts community gatherings.",
};
function updateBuildingPanel() {
  const chooser = $("#building-choice");
  const previous = chooser.value;
  const markup = state.village.buildings.map(b => `<option value="${b.id}">${kinds[b.kind][0]} ${b.id + 1}${(state.village.building_jobs||[]).some(j=>j.building===b.id)?" · crew working":b.progress < 100 ? " · building" : ""}</option>`).join("");
  chooser.disabled=!state.village.buildings.length;
  if (chooser.innerHTML !== markup) {
    chooser.innerHTML = markup;
    if ([...chooser.options].some(o => o.value === previous)) chooser.value = previous;
  }
  const b = state.village.buildings.find(b => b.id === Number(chooser.value));
  $('#building-work-controls').hidden=!b;
  const crew=b&&(state.village.building_jobs||[]).find(j=>j.building===b.id);
  $('#building-work-actions').hidden=!!crew;
  $('#cancel-building-work').hidden=!crew||crew.stage==='rebuild';
  const crewMembers=crew?state.residents.filter(r=>r.task==='building_work'&&r.activity_building===b.id):[];
  const crewNote=paused?'Paused · resume time for resident work.':crewMembers.length?crewMembers.map(r=>`${r.name} ${Math.hypot(r.x-r.target_x,r.y-r.target_y)<=.08?'working':'on the way'}`).join(' · '):'Queued · neighbours will finish meals, rest or outside commitments first.';
  $('#building-work-status').textContent=crew?`${crew.stage==='pack'?'Packing':crew.stage==='rebuild'?'Rebuilding':crew.action==='salvage'?'Careful salvage':'Demolition'} · ${Math.floor(crew.work/(crew.stage==='pack'?24:crew.stage==='rebuild'?36:crew.action==='demolish'?18:54)*100)}%. ${crewNote}`:'Demolition clears quickly with no material return. Salvage takes three times the work and recovers half of recorded materials. Moving packs and rebuilds the same building.';
  $('#building-work-actions [data-building-work="move"]').disabled=!b||b.progress<100;

  $("#building-purpose").textContent = b ? buildingPurposes[b.kind] : "Place your first building to get started.";
  if(b?.kind==='workshop'){
    const tools=state.village.progress.tool_uses, timber=state.environment.economy.materials[0].available;
    $('#building-purpose').textContent=`${tools} tool uses owned across the village. ${tools>24?'Enough tools for now; neighbours can take a break.':timber<8?'The next batch needs eight unreserved timber.':'A saved batch needs eight timber delivered here. Follow its progress in Construction → Preparing materials.'}`;
  }
  $("#building-power").textContent=b?connectionLabel(state.environment.power.connections.find(c=>c.id===b.id),state.environment.power):"";
  updateAgricultureUI(game,state,inspectBuilding);
  $("#building-activity").hidden=!!farmNames[b?.kind];
  $("#building-visits details").hidden=!!farmNames[b?.kind];
  const farming = b && ["garden", "greenhouse"].includes(b.kind);
  $("#crop-controls").hidden = !farming;
  if (farming) {
    const c = b.crop, outlook=JSON.parse(game.crop_outlook(b.id)), spec = cropTypes[outlook.crop];
    $("#next-crop").value = c.next_kind;
    $("#replant-crop").checked = c.replant;
    $("#crop-status").textContent = `${spec.name} · ${!c.planted ? (c.replant ? "ready to plant" : "replanting paused") : c.growth >= cropDuration(c) ? "ready to harvest" : `${Math.floor(c.growth / cropDuration(c) * 100)}% grown${c.moisture <= 0 ? " · needs water" : ""}`}. At current soil and supplies: ${outlook.harvest_min}–${outlook.harvest_max} ${outlook.product}.`;
    $("#crop-details").textContent = `Root-zone wetness ${Math.round(outlook.soil.moisture*100)}% · retention ×${outlook.soil.retention.toFixed(2)} · tree shade ${Math.round(outlook.soil.shade*100)}%. Growth ×${outlook.growth_multiplier.toFixed(2)}. Harvest size depends on the gardener. ${spec.note}. ${outlook.pollinated?"Bees improve this harvest. ":""}${outlook.rotations} soil-building rotations. ${outlook.previous_crop?"Last harvested: "+cropTypes[outlook.previous_crop].name+".":""}`;
    $("#nursery-status").textContent = b.kind === "greenhouse" ? `One seedling per ${(outlook.nursery_minutes/60).toFixed(1)} moist growing hours at current soil and light · ${outlook.seedlings_here} vegetable seedlings at this greenhouse · ${state.village.seedlings} across the village. Seedlings stay at this greenhouse until neighbours carry them to outdoor beds for a 25% growth head start. Watering uses 2 reclaimed irrigation water first, then fresh water. Covered soil dries more slowly; rain cannot water this bed.` : `${outlook.seedlings_here} vegetable seedlings at this garden · ${state.village.seedlings} across the village. Only a delivered seedling gives this bed a 25% head start.`;
  }
  const visitors = b ? state.residents.filter(r => r.task === "visit" && r.visit_building === b.id) : [];
  $("#building-activity").textContent = !b ? "" : b.progress < 100 ? "Open Village → Construction for stage materials, purchases and priorities." : visitors.length
    ? visitors.map(r => `${r.name}: ${Math.hypot(r.x-r.target_x,r.y-r.target_y) > 0.1 ? "on the way" : "using the building"}`).join(" · ")
    : `${b.visits} visits completed. ${b.next_visit > state.village.minutes && !["home", "square"].includes(b.kind) ? "Production recovers in " + Math.ceil(b.next_visit - state.village.minutes) + " game minutes." : "Ready for a visit."}`;
  const utility = b && ["solar_farm", "streetlight", "hydro", "banana_treatment", "wetland", "biodigester", "warehouse"].includes(b.kind);
  $("#building-visits").hidden = utility;
  $('#building-visits h3').textContent=farmNames[b?.kind]?'Ask a neighbour to tend this plot':b?.kind==='kitchen'?'Ask a neighbour to cook':b?.kind==='workshop'?'Ask a neighbour to craft':'Ask a neighbour to visit';
  if(b?.kind==='workshop'&&b.progress>=100){
    const site=state.village.production.sites.find(s=>s.building===b.id),batch=site&&state.village.production.batches.find(q=>q.site===site.id&&!['complete','cancelled'].includes(q.phase));
    const worker=batch&&state.residents.find(r=>r.activity_batch===batch.id||r.help?.batch===batch.id&&r.help.finished==null);
    $('#building-activity').textContent=site?.paused?'Worksite paused. Resume it in Construction → Preparing materials.':batch?`Saved batch #${batch.id}: ${batch.output} ${state.environment.economy.materials[batch.material].name.toLowerCase()} · ${Math.floor(batch.work/10*100)}% prepared. ${worker?worker.name+(worker.task==='haul'?' is bringing the inputs.':worker.task==='craft'?' is helping with this batch.':"’s request is saved through their break."):'Neighbours will continue when they have the energy.'} Track it in Construction → Preparing materials.`:'No batch queued. Ask a neighbour to craft, or set a village reserve in Construction → Preparing materials.';
  }
  if(b?.kind==='kitchen'&&b.progress>=100){
    const site=state.village.production.sites.find(s=>s.building===b.id),batch=site&&state.village.production.batches.find(q=>q.site===site.id&&!['complete','cancelled'].includes(q.phase));
    const worker=batch&&state.residents.find(r=>r.activity_batch===batch.id||r.help?.batch===batch.id&&r.help.finished==null);
    $('#building-activity').textContent=site?.paused?'Kitchen paused. Resume it in Supplies → Kitchen.':batch?`Saved pot #${batch.id}: ${batch.output} meals · ${Math.floor(batch.work/10*100)}% cooked. ${batch.phase==='awaiting_water'?(state.environment.economy.production.recipes.find(d=>d.site===site.id)?.service_blocker||'Waiting for fresh water and greywater space.'):worker?worker.name+(worker.task==='haul'?' is bringing ingredients.':worker.task==='cook'?' is helping with this pot.':"’s request is saved through their break."):'Neighbours will continue when they have the energy.'} Track it in Supplies → Kitchen.`:'No pot queued. Ask a neighbour to cook, or set a meal reserve in Supplies → Kitchen.';
  }
  if (utility) $("#building-activity").textContent = b.progress < 100 ? "Open Village → Construction for materials and installation. It connects when construction finishes." : ["solar_farm","streetlight","hydro"].includes(b.kind)?"Works automatically. Manage shared lighting in Power.":"Works automatically. Open Supplies for its stores and processing controls.";
  if(crew)$("#building-activity").textContent="Closed for crew work. Stored crops and equipment return with a completed move.";
  gameUI?.updateBuilding(state);
  for (const button of $("#building-neighbours").querySelectorAll("button")) button.disabled = !b || b.progress < 100 || !!state.residents.find(r=>r.id===Number(button.dataset.visitor))?.trip;
}
function inspectBuilding(id) {
  showPanel("building-panel");
  updateBuildingPanel();
  $("#building-choice").value = String(id);
  $("#building-response").textContent = "";
  updateBuildingPanel();
}
function updateCircularUI(v) {
  const c=v.circular,passive=state.environment.economy.processes,ready=kind=>v.buildings.some(b=>b.kind===kind&&b.progress>=100),liquids=JSON.parse(game.water_report());
  $('#circular-controls').hidden=!buildingUnlocked(v,'kitchen')&&!buildingUnlocked(v,'eco_toilet');
  $('#circular-stock').textContent=`${liquids.present[3].toFixed(1)} sealed sewage (${liquids.sealed[3].toFixed(1)} in digesters) · ${liquids.present[2].toFixed(1)} greywater (${liquids.sealed[2].toFixed(1)} filtering). Storage and receiving space belong to each site.`;
  $('#circular-output').textContent=`${c.reclaimed.toFixed(1)} / ${liquids.capacities[1].toFixed(0)} irrigation storage · ${c.biogas.toFixed(0)} / 12 cooking gas`;
  const toilets=v.buildings.filter(b=>b.kind==='eco_toilet'&&b.progress>=100).map(b=>liquids.tanks.find(p=>p.owner.kind==='building'&&p.owner.id===b.id)).filter(p=>p?.open);
  const wetToilets=toilets.filter(p=>p.water[0]-p.reserved_pickup[0]>=1),usable=wetToilets.some(p=>!usesUtilities(v)||p.room[2]>=.7&&p.room[3]>=1);
  $('#toilet-status').textContent=!ready('eco_toilet')?'Build an ecological toilet for private daily routines.':!toilets.length?'The toilets are closed for building work.':!wetToilets.length?'Handwashing needs one fresh water delivered to an open toilet.':!usable?'A toilet’s local greywater or sewage buffer is full. Neighbours can carry a closed container to treatment or the service point; installed lines save trips.':`${c.toilet_visits} daily visits completed. Residents make their own way there while awake.`;
  const filters=passive?.stations.filter(s=>s.kind==='filtration')||[];
  $('#wetland-status').textContent=!ready('wetland')?'Build a reed bed to reuse household greywater.':filters.length===1?filters[0].reason:`${filters.length} reed beds. Each keeps its own saved batch; review its inputs and status below.`;
  const beds=v.buildings.filter(b=>b.kind==='banana_treatment'&&b.progress>=100).length;
  const operatingBeds=passive?.stations.filter(s=>s.kind==='banana'&&!s.paused&&!s.closed).length||0;
  $('#banana-status').textContent=!beds?'Build a banana treatment bed to treat sealed toilet waste.':!c.banana_treatment||!operatingBeds?'Banana treatment paused. Waste remains available for biogas.':`${passive.stations.filter(s=>s.kind==='banana').map(s=>s.reason).join(' ')} ${(c.waste_treated??0).toFixed(1)} treated so far · no water or food outlet.`;
  $('#banana-treatment').checked=c.banana_treatment??true;
  $('#banana-treatment').disabled=!beds;
  const curing=passive?.batches.filter(row=>row.batch.kind==='curing'&&['processing','paused','awaiting_output'].includes(row.batch.phase))||[];
  const digesters=passive?.stations.filter(s=>s.kind==='digestion')||[];
  $('#digester-status').textContent=!digesters.length&&!curing.length?'Build a biodigester to turn sealed waste and scraps into cooking fuel.':`${digesters.length===1?digesters[0].reason:`${digesters.length} digesters.`} ${c.pending_compost} digestate curing${curing.length?` · next compost in ${Math.ceil(c.curing/60)} hours`:''}. Review each process below.`;
  $('#auto-digest').checked=c.auto_feed;$('#filter-greywater').checked=c.filter_water;$('#use-biogas').checked=c.use_biogas;
  $('#auto-digest').disabled=!ready('biodigester');$('#filter-greywater').disabled=!ready('wetland');
}
function updateSupplies(v) {
  maintenanceUI?.update();
  updateCircularUI(v);
  $('#hen-controls').hidden=!buildingUnlocked(v,'coop');
  $('#egg-control').hidden=!buildingUnlocked(v,'coop');
  const s = v.supplies;
  const coops = v.buildings.filter(b => b.kind === "coop" && b.progress >= 100);
  const occupiedCoops=coops.filter(b=>b.agriculture.stocked!==false);
  const fed = occupiedCoops.filter(b => b.poultry.remaining > 0);
  const shared=v.progress.gathering_delivery;
  const sharedReserve=shared&&['preparing','ready','serving'].includes(shared.phase)&&shared.spent_after==null?Math.min(shared.portions,v.meals):0;
  replaceMarkup($("#pantry-stock"), [["food",Math.floor(v.food),"Ingredients"],["eggs",s.eggs,"Eggs"],["meals",v.meals,"Ready meals"],["milk",state.environment.economy.materials[25].stored,"Fresh milk"],["honey",state.environment.economy.materials[26].stored,"Honey"]].map(([icon,count,label])=>`<span>${itemIcon(icon)}<span><b>${count}</b><small>${label}</small></span></span>`).join(""));
  const foodReserve=state.environment.economy.food_reserve;
  $("#pantry-outlook").textContent = !usesLogistics(v) ? "Sandbox replenishes ingredients and meals. Neighbours keep their daily routines and have time for hobbies." : `${foodReserve.unclaimed_at_stores} unclaimed edible portions at stores · ${foodReserve.carried} carried · ${foodReserve.committed_to_cooking} ingredients held in cooking. Ingredients, prepared meals, milk and honey can be eaten directly; eggs need cooking. Clear paths still matter.`;
  $("#pantry-flow").textContent = `${Math.floor(s.gathered)} ingredients gathered / ${Math.floor(s.used)} used · ${s.eggs_laid} eggs laid · ${s.meals_cooked} meals cooked · ${s.portions_eaten} portions eaten`;
  $("#use-eggs").checked = s.use_eggs;
  $("#feed-hens").checked = s.feed_hens;
  const pots=v.production.batches.filter(b=>b.material===17&&!['complete','cancelled'].includes(b.phase));
  $("#kitchen-status").textContent = !v.buildings.some(b => b.kind === "kitchen" && b.progress >= 100)
    ? "Build a kitchen to stretch your harvest into meals."
    : pots.length ? `${pots.length} saved ${pots.length===1?'pot':'pots'} in progress. Ingredients and work stay with each kitchen through breaks.`
    : v.meals >= v.production.targets[17] ? "The meal reserve is covered. Neighbours can take a break or help with another chore."
    : v.food < (s.use_eggs && s.eggs >= 2 ? 2 : 3) ? "Waiting for ingredients."
    : "Neighbours queue a pot when the reserve needs topping up and there is room for its meals.";
  $("#coop-status").textContent = !coops.length ? "Build a coop to start producing eggs."
    : !occupiedCoops.length?"Our coops are empty. Deliver a three-hen group, then request stocking in Buildings.": `${fed.length} of ${occupiedCoops.length} occupied coops fed${fed.length ? ` · next eggs in ${Math.ceil(Math.min(...fed.map(b => b.poultry.remaining)) / 60)} daylight hours` : ""}. ${!s.feed_hens ? "New feeding is paused." : s.eggs + fed.length * 3 + 3 > 12 ? "Enough eggs laid or on the way. Feeding pauses until some are used." : v.food < 9 ? "New feeding waits until there are 9 ingredients." : "Neighbours bring feed to each coop when they have the energy."}`;
  const weatherLine=state.environment.weather ? weatherSummary(state.environment.weather,v.minutes) : state.environment.dry_day ? "Dry today; rain returns tomorrow afternoon" : "Rain today from 14:00 to 17:00";
  $("#pantry-weather").textContent = `${Math.floor(v.water)} / ${Math.round(state.environment.water_capacity)} water. ${weatherLine}. Gardens pause safely when dry.`;
  updateClimateForecast(state);
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
  syncResidentRoster();
  const free = state.village.mode==='sandbox', instant = !usesLogistics(state.village);
  sandboxRulesUI?.update();
  const creation=creationPresentation(playerSession?state.village.scenario?.definition:null,{playtest:playerSession?.isTest});
  const title=creation?.title??'Vila Aurora';for(const id of ['#village-heading','#minimap-title'])if($(id).textContent!==title)$(id).textContent=title;if($('#village-heading').title!==title)$('#village-heading').title=title;
  $('#mode-badge').textContent=creation?.badge??(free?'Sandbox':'Story');
  $('#mode-label').textContent=`${free?'SANDBOX':'STORY'}`;
  const authoredJournal=!!state.village.scenario?.definition?.journal;
  $('.goal-tracker').hidden=free&&!authoredJournal;
  $('[data-panel="goals-panel"]').hidden=free&&!authoredJournal;
  $('[data-panel="projects-panel"]').hidden=false;
  // Trade also holds optional supplier settings in free Sandbox.
  $('[data-panel="town-panel"]').hidden=false;
  $('[data-panel="power-panel"]').hidden=!buildingUnlocked(state.village,'solar_farm');
  $('#new-scenario').textContent=free?'New sandbox':'New story';
  $('#help-intro').textContent=free?(instant?'Sandbox unlocks every building. New buildings are instant and free; pantry, tools and funds replenish. Settings lets you add construction, living-land and utility constraints.':'Sandbox unlocks every building. Supplies and resident labour are needed for new construction; plan projects in Construction and purchases in Trade. Living-land and utility rules are separate choices in Settings.'):'Follow the journal’s thirteen Story chapters to unlock village life. Plan blueprints in Construction and buy missing supplies in Trade.';
  replaceMarkup($('#help-start'),instant?'<b>Build freely.</b> Open Build, choose any building, then click a clearing. Select it in Buildings to change crops, invite a visitor, or queue resident demolition, salvage or relocation.':free?'<b>Plan your own village.</b> Every building is unlocked. Choose a blueprint in Build, manage its supplies and priority in Construction, and let residents carry and build when they have the energy. Adjust the other simulation rules in Settings.':'<b>Start with the essentials.</b> Open Journal and follow A Shared Beginning: a cistern, homes, a garden and a kitchen. Plan their materials in Village → Construction; residents build when they have the energy.');
  if(creation){$('#help-intro').textContent=creation.intro;replaceMarkup($('#help-start'),creation.start);}
  economyUI?.update();
  updateSituations();
  const v = state.village;
  updateSupplies(v);
  updatePowerUI(state,kinds);
  updateBuildingPanel();
  for (const k of ["wood", "water"])
    $("#" + k).textContent = Math.floor(v[k]);
  const foodReserve=state.environment.economy.food_reserve;
  $('#food').textContent=foodReserve?.unclaimed_at_stores??Math.floor(v.food+v.meals);
  $('#food').closest('button').title='Unclaimed ingredients, meals, milk and honey at stores · open pantry for claims, cargo and cooking inputs';
  $("#community-count").textContent=state.residents.length;
  $("#community-count").setAttribute("aria-label",`${state.residents.length} ${state.residents.length===1?"resident":"residents"}`);
  $("#happiness").textContent =
    Math.round(state.residents.reduce((s, r) => s + r.happiness, 0) / Math.max(1,state.residents.length)) + "%";
  const mins = Math.floor(v.minutes) % 1440;
  $("#date").textContent =
    `Day ${Math.floor(v.minutes / 1440) + 1} · ${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  const night = mins < 360 || mins >= 1140;
  $(".season-icon").textContent = night ? "☾" : "☀";
  $(".season small").textContent = state.environment.raining ? 'Rainfall' : weatherConditions(state.environment,v.minutes).wet>.1 ? 'After the rain' : mins < 360 || mins >= 1260 ? 'Night' : mins < 720 ? 'Morning' : mins < 1080 ? 'Afternoon' : 'Evening';
  if(state.environment.weather?.enabled){const season=state.environment.weather.forecast[0].season;$('.season small').textContent=`${season==='wet'?'Wet':'Dry'} season · ${$('.season small').textContent}`;}
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
  $("#water-capacity").textContent = `Water / ${Math.round(env.water_capacity)}`;
  $("#weather-status").textContent = env.weather ? weatherSummary(env.weather,v.minutes) : env.raining
    ? "Afternoon rain · filling cisterns"
    : env.dry_day
      ? "Dry day · fetch treated water"
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
    $('#person .occupation-income').textContent=job.available?`R$ ${job.income/100} for the shared fund · 09:00–17:00`:'No outside shift scheduled';
    $('#person .occupation-toggle').disabled=!job.available;
    $('#person .occupation-description').textContent=job.description;
    $('#person .occupation-toggle').checked=job.enabled;
    const workToday=v.workforce.days.find(day=>day.day===Math.floor(v.minutes/1440))?.residents[r.id]?.reduce((sum,n)=>sum+n,0)||0;
    $('#person .work-today').textContent=`${Math.round(workToday)} min of village chores today, including travel. Work follows energy, meals, rest and personal commitments.`;
    for(const [i,key] of ['construction','hauling','food','materials','care'].entries()){
      const input=$(`#person [data-work-preference="${key}"]`);
      if(input!==document.activeElement)input.value=String(v.workforce.preferences[r.id][i]);
    }
    $('#person .occupation-toggle').setAttribute('aria-label',`Schedule ${r.name}'s outside job`);
    $('#person .occupation-schedule-note').textContent=r.trip?.purpose==='work'?'This shift is committed. Turning this off stops future shifts.':job.enabled?(v.minutes%1440>=600?'Next outside shift tomorrow at 09:00. Lunch is provided off-site.':'Leaves 09:00–10:00 when rested. Lunch is provided off-site.'):'Optional · staying available for village life.';
    for(const button of $('#person').querySelectorAll('[data-task]'))button.disabled=!!r.trip;
    $("#person .quote").hidden = r.task === "idle" || (!!response && r.requested && response.endsWith(r.reason));
    $("#person .quote").textContent = "“" + (r.task === "idle" ? idleLabels[residentActivity(r, v.minutes)] + "." : r.reason) + "”";
    renderResidentSkills($('#person .skill-journal'),state,r.id,escapeHtml);
    $('#person .sandbox-learning').hidden=v.mode!=='sandbox';
    $('#person .learning-toggle').checked=state.environment.skills.enabled;
    const stats = {
      Energy: r.energy,
      Fullness: 100 - r.hunger,
      Connection: r.social,
      Wellbeing: r.happiness,
    };
    for (const [n, v] of Object.entries(stats)) {
      const el = $(`[data-stat="${n}"]`);
      el.querySelector("i").style.width = v + "%";
      el.querySelector(".value").textContent = Math.round(v);
    }
    const friendships = state.village.progress.friendships;
    const friends = state.residents.filter(
      (other) => other.id !== r.id && relationshipStrength(friendships,r.id,other.id) > 0,
    );
    $(".friendship-note").textContent = friends.length
      ? "Shared memories: " +
        friends
          .map((other) => `${other.name} (${relationshipStrength(friendships,r.id,other.id)})`)
          .join(", ")
      : "Friendships grow when neighbours attend gatherings together.";
    $('[data-task="building_work"]').hidden=!(state.village.building_jobs||[]).length;
    for (const task of ["compost", "craft"]) {
      $(`[data-task="${task}"]`).hidden = !state.village.buildings.some(
        (b) =>
          b.kind === (task === "craft" ? "workshop" : "compost") &&
          b.progress >= 100,
      );
    }
    const help=r.help,activeHelp=help&&!['complete','cancelled'].includes(help.phase);
    $('#person .help-order').hidden=!help;
    $('#person .requests').hidden=!!activeHelp;
    $('#person .request-guide').textContent=activeHelp
      ? 'One request at a time. Follow their progress below, or cancel this request before choosing another chore.'
      : 'Choose one chore. They’ll help once, then return to their own routine. Meals, rest and outside commitments still come first.';
    $('#person .resume-request').textContent=`Resume time · let ${r.name} continue`;

    if(help){
      const titles={accepted:`${r.name} accepted`,travelling:`${r.name} is on the way`,working:`${r.name} is helping`,paused:'Taking care of their needs first',blocked:'Waiting to continue',complete:'Request completed',cancelled:'Request cancelled'};
      const names={build:'Help build',building_work:'Help the building crew',garden:'Tend the farm',gather:'Forage food',source:'Source materials',prepare:'Prepare materials',water:'Water & sanitation',cook:'Make a meal',rest:'Take a rest',socialize:'Spend time together',compost:'Turn scraps',craft:'Craft tools',eat:'Have a meal',outside:'Outside shift'};
      const target=help.building==null?null:v.buildings.find(b=>b.id===help.building);
      const text={'.help-phase':titles[help.phase],'.help-task':(names[help.task]||help.task)+(target?` · ${kinds[target.kind][0]} at ${target.x}, ${target.y}`:''),'.help-reason':help.reason,'.help-time':`Accepted day ${1+Math.floor(help.created/1440)} · ${String(Math.floor(help.created%1440/60)).padStart(2,'0')}:${String(Math.floor(help.created%60)).padStart(2,'0')}`};
      for(const [selector,value] of Object.entries(text)){const el=$('#person '+selector);if(el.textContent!==value)el.textContent=value;}
      $('#person .cancel-help').hidden=!activeHelp;
    }
    const activity=(r.requested ? 'Your request · ' : '') + (!r.trip && r.task!=='sleep' && Math.hypot(r.x-r.target_x,r.y-r.target_y)>.08 ? 'On the way · ' : '') + activityLabel(r);
    const activityEl=$("#person .person-activity");
    if(activityEl.textContent!==activity)activityEl.textContent=activity;
    if(response&&responseContext!==null&&responseContext!==requestContext(r)){response="";encouragable=false;responseContext=null;}
    $("#person .response").hidden = !response;
    const reply=$("#person .response");
    if(reply.textContent!==response)reply.textContent=response;
    $("#person .persuade").hidden = !encouragable || !!r.trip;
    $("#person .request-pause").hidden = !paused || !(r.requested||activeHelp);
    $("#person .request-pause").textContent = `The village is paused. Resume time to let ${r.name} continue.`;
    $("#person .resume-request").hidden = !paused || !(r.requested||activeHelp);
  }
  for (const button of document.querySelectorAll(".build-tool")) {
    const unlocked = buildingUnlocked(v, button.dataset.kind);
    button.classList.toggle("locked", !unlocked);
    button.classList.remove("unaffordable");
    const quest = unlockQuest[button.dataset.kind],scenarioLocked=v.progress.scenario_journal?.locked_buildings?.includes(button.dataset.kind);
    if(button.dataset.kind.startsWith('source_')){const option=state.environment.economy.source_options.find(s=>s.key===button.dataset.kind);button.querySelector('small').textContent=instant?'Free plot':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(option.cost/100);button.title=option.description+' · '+recipeSummary(state,option.key);button.setAttribute('aria-label','Place '+option.name);button.setAttribute('aria-pressed',String(button.dataset.kind===tool));continue;}
    button.querySelector("small").textContent = unlocked
      ? button.dataset.kind === "road" ? "Free" : !usesLogistics(v) ? "Free · instant" : "Free blueprint"
      : scenarioLocked?"Story locked":"Quest reward";
    button.title = unlocked
      ? `${kinds[button.dataset.kind][1]} · ${instant?'Free · instant construction':recipeSummary(state,button.dataset.kind,button.dataset.kind==='home'?$('#home-material-method').value:'standard')}`
      : scenarioLocked?"Follow this scenario’s journal to unlock this building.":`Complete ${quests[quest].title} to unlock`;
    button.setAttribute(
      "aria-label",
      unlocked
        ? !usesLogistics(v) ? `Build ${kinds[button.dataset.kind][0]}, free and instant` : `Plan ${kinds[button.dataset.kind][0]}, free blueprint`
        : `View quest to unlock ${kinds[button.dataset.kind][0]}`,
    );
    button.classList.toggle("active", button.dataset.kind === tool);
    button.setAttribute("aria-pressed", String(button.dataset.kind === tool));
  }
  gameUI?.update(state,!!sandbox||artworkPreview||!!directScenario,selected);
}
function setTool(kind) {
  scenarioGoalRegion=null;
  movingBuilding = null;
  movingBattery = null;
  $('#relocation-guidance').hidden=true;
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
    ? tool === "road" ? "Road · Click to add or remove · Free · Esc to finish" : `Place ${kinds[tool][0].toLowerCase()} · ${tool?.startsWith('source_')?recipeSummary(state,tool):!usesLogistics(state.village)?'Free · instant':'Blueprint · materials in Construction'} · Esc to cancel`
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
  if(paused&&game&&state&&gameUI){state=sampleFrame(game,state,true);reportElapsed=0;updateUI();}
}
let paintedState = null, paintedView = "", reportElapsed = Infinity;
function frame(stamp) {
  if(residentArtworkLoading){last=stamp;requestAnimationFrame(frame);return;}
  meter.start(stamp);
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
    meter.mark('simulation');
    reportElapsed += elapsed;
    state = sampleFrame(game, state, reportElapsed >= .25);
    if (reportElapsed >= .25) reportElapsed = 0;
  }
  meter.mark('sample');
  $("#auto-speed").hidden = !running || !game.fast_forward_ready();
  const viewKey = [width,height,zoom,pan.x,pan.y,tool,selected,pointer?.x,pointer?.y,!!drag?.moved,reducedMotion.matches,paused,$("#pipe-overlay")?.checked,waterOverlayRevision(),$("#cable-overlay")?.checked,electricalOverlayRevision()].join("|");
  if (running || cameraTarget || state !== paintedState || viewKey !== paintedView) {
    render(); gameUI?.drawMap(state,selected); paintedState = state; paintedView = viewKey;
  }
  meter.mark('paint');
  uiElapsed += dt;
  saveElapsed += elapsed;
  if (uiElapsed > 0.3) {
    if (running) { updateUI(); announceMilestones(); }
    uiElapsed = 0;
  }
  if (saveElapsed > 15) {
    save();
    saveElapsed = 0;
  }
  meter.finish(running);
  requestAnimationFrame(frame);
}
function setup() {
  for(const option of state.environment.economy.source_options)kinds[option.key]=[option.name,option.description];
  gameUI=installGameUI({images:buildingImages,residents:state.residents,avatar,paintPortraits,selectPerson,
    showPanel,closePanels,openDev:()=>{$('#help-dialog').close();devTools.open();},
    focusAt:(x,y)=>{const p=iso(x,y);cameraTarget={x:pan.x+width/2-p.x,y:pan.y+height*.45-p.y,dt:1/60};},
    worldView:()=>[[0,0],[width,0],[width,height],[0,height]].map(([x,y])=>unproject(x,y,origin,scale))});
  $('#open-village').onclick=()=>{
    if(!$('#village-book').hidden){closePanels();return;}
    showPanel($(`[data-panel="${lastVillagePanel}"]`).hidden?'building-panel':lastVillagePanel);
  };
  landMap=installLandMap({game:()=>game,snapshot:()=>state,changed:()=>{state=JSON.parse(game.snapshot());updateUI();save();},notify:toast,render:()=>{paintedState=null;render();}});
  const focusUtility=plan=>{
    const points=[plan.start.edge,...plan.cells,plan.end.edge].map(([x,y])=>iso(x,y));
    const middleX=(Math.min(...points.map(p=>p.x))+Math.max(...points.map(p=>p.x)))/2;
    const middleY=(Math.min(...points.map(p=>p.y))+Math.max(...points.map(p=>p.y)))/2;
    const freeWidth=Math.max(180,$('#village-book').getBoundingClientRect().left-20);
    cameraTarget={x:pan.x+freeWidth/2-middleX,y:pan.y+height*.46-middleY,dt:1/60};
    ctx.canvas.dataset.cameraMoving='true';
  };
  sandboxRulesUI=installSandboxRulesUI({game:()=>game,snapshot:()=>state,changed:()=>{state=JSON.parse(game.snapshot());updateUI();save();},notify:toast});
  economyUI=installEconomyUI({avatar,paintPortraits,focusUtility,moveBattery:id=>{
    setTool(null);closePanels();selected=null;movingBattery=id;tool='battery';cameraTarget=null;
    $('#person').hidden=true;$('#placement').hidden=false;$('#placement').textContent='Choose a battery plot · resident packing, transport and installation · Esc to cancel';
    $('#relocation-guidance').textContent=$('#placement').textContent;$('#relocation-guidance').hidden=false;canvas.style.cursor='crosshair';
  },snapshot:()=>state,game:()=>game,changed:()=>{state=JSON.parse(game.snapshot());updateUI();save();},notify:toast,openTown:()=>showPanel('town-panel'),planSource:material=>setTool(sourceKinds[material]),locate:id=>{const b=state.village.buildings.find(b=>b.id===id);if(b){closePanels();const p=iso(b.x,b.y);cameraTarget={x:pan.x+width/2-p.x,y:pan.y+height*.42-p.y,dt:1/60};}}});
  maintenanceUI=installMaintenanceUI({game:()=>game,snapshot:()=>state,changed:()=>{state=JSON.parse(game.snapshot());updateUI();save();},notify:toast,developer:()=>!!sandbox||artworkPreview||!!directScenario,openTown:()=>showPanel('town-panel'),openUpkeep:()=>showPanel('supplies-panel','ecology'),focusAt:(x,y)=>{const p=iso(x,y);cameraTarget={x:pan.x+width*.29-p.x,y:pan.y+height*.45-p.y,dt:1/60};}});
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
  $("#farm-stocking").onclick=()=>{const b=state.village.buildings.find(b=>b.id===Number($("#building-choice").value));if(b&&game.request_animal_stocking(b.id,!b.agriculture.stocking_requested)){state=JSON.parse(game.snapshot());save();updateUI();}};
  $("#farm-active").onchange=()=>{game.configure_agriculture(Number($("#building-choice").value),$("#farm-active").checked);state=JSON.parse(game.snapshot());save();updateUI();};
  for (const id of ["next-crop", "replant-crop"]) $("#"+id).onchange = () => {
    game.configure_crop(Number($("#building-choice").value), $("#next-crop").value, $("#replant-crop").checked);
    state = JSON.parse(game.snapshot()); updateUI(); save();
  };

  $("#building-neighbours").innerHTML = state.residents.map(r => `<button data-visitor="${r.id}">${escapeHtml(r.name)}</button>`).join("");
  $("#building-choice").onchange = () => { $("#building-response").textContent = ""; updateBuildingPanel(); };
  $('#building-work-actions').onclick=event=>{
    const button=event.target.closest('[data-building-work]'),b=state.village.buildings.find(b=>b.id===Number($('#building-choice').value));if(!button||!b)return;
    if(button.dataset.buildingWork==='move'){
      closePanels();selected=null;movingBuilding=b.id;tool=b.kind;cameraTarget=null;$('#placement').hidden=false;$('#placement').textContent='Choose a new plot · residents will pack and rebuild · Esc to cancel';$('#relocation-guidance').textContent=$('#placement').textContent;$('#relocation-guidance').hidden=false;toast('Choose a new plot for this building.');return;
    }
    const quote=JSON.parse(game.building_work_quote(b.id)),salvage=button.dataset.buildingWork==='salvage';
    const returns=quote.salvage.map((n,i)=>n?`${n} ${state.environment.economy.materials[i].name.toLowerCase()}`:'').filter(Boolean).join(', ');
    pendingRemoval={id:b.id,action:button.dataset.buildingWork};
    $('#building-work-title').textContent=salvage?'Salvage this building?':'Demolish this building?';
    $('#building-work-note').textContent=`${kinds[b.kind][0]} ${b.id+1}: ${salvage?`careful dismantling takes three times the demolition work. Returns ${returns||'no complete recoverable units'}.`:'fast removal returns no building materials.'} Residents must reach the site and finish the work. Crops and the building are removed; owned supplies remain recoverable. Cistern contents stay in containers at the original plot. Charged batteries remain as separate equipment; manage their relocation or salvage in Power.`;
    $('#building-work-dialog').showModal();
  };
  $('#building-work-close').onclick=()=>{pendingRemoval=null;$('#building-work-dialog').close();};
  $('#building-work-confirm').onclick=()=>{
    if(pendingRemoval){const result=game.queue_building_work(pendingRemoval.id,pendingRemoval.action,0,0);toast(result==='ok'?`Crew job queued. ${paused?'Resume time to let residents work.':'Neighbours will work when they have the energy.'}`:result);state=JSON.parse(game.snapshot());updateUI();save();}
    pendingRemoval=null;$('#building-work-dialog').close();
  };
  $('#cancel-building-work').onclick=()=>{const result=game.cancel_building_work(Number($('#building-choice').value));toast(result==='ok'?'Crew job cancelled.':result);state=JSON.parse(game.snapshot());updateUI();save();};
  $("#building-neighbours").onclick = event => {
    const button = event.target.closest("[data-visitor]");
    if (!button) return;
    $("#building-response").textContent = game.visit_building(Number(button.dataset.visitor), Number($("#building-choice").value));
    state = JSON.parse(game.snapshot());
    updateUI();
    save();
  };

  $("#build-hydro").onclick=()=>setTool("hydro");
  $("#build-solar").onclick=()=>setTool("solar_farm");
  $("#build-streetlight").onclick=()=>setTool("streetlight");
  $("#power-loads").onchange=event=>{
    const input=event.target.closest('[data-power-building]');if(!input)return;
    game.set_power_enabled(Number(input.dataset.powerBuilding),input.checked);
    state=JSON.parse(game.snapshot());updateUI();save();
  };
  for(const id of ['auto-digest','filter-greywater','use-biogas']) $('#'+id).onchange=()=>{
    game.configure_sanitation($('#auto-digest').checked,$('#filter-greywater').checked,$('#use-biogas').checked);
    state=JSON.parse(game.snapshot());updateUI();save();
  };
  $('#banana-treatment').onchange=()=>{
    game.configure_banana_treatment($('#banana-treatment').checked);
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
  residentIdentity=installResidentIdentity({appearances:residentAppearances,catalog:JSON.parse(game.scenario_catalog()).resident_appearances,game:()=>game,snapshot:()=>state,changed:id=>{
    state=JSON.parse(game.snapshot());residentAnimations.delete(id);residentSurfaces.delete(id);
    residentAppearances.setActive(state.residents.map(person=>person.appearance));
    const person=state.residents.find(p=>p.id===id),button=$(`#residents [data-resident="${id}"]`);
    if(button){button.querySelector('.avatar').outerHTML=avatar(id);button.querySelector('b').textContent=person.name;button.setAttribute('aria-label',`Meet ${person.name}`);}
    selectPerson(id);updateUI();paintPortraits();render();save();
  }});
  syncResidentRoster();
  paintPortraits();
  $("#residents").onclick = (e) => {
    const b = e.target.closest("[data-resident]");
    if (b) selectPerson(+b.dataset.resident);
  };
  buildMenu = installBuildMenu(kinds, buildingImages, () => { if (tool) setTool(null); });
  $('#home-material-method').onchange=()=>{
    const method=$('#home-material-method').value,key=method==='adobe'?'adobe-gable':method==='local'?'home-veranda':'home';
    const button=$('.build-tool[data-kind="home"]');
    paintIcon(button.querySelector('canvas'),key,buildingImages[key],allBuildingArt[key]);
    button.querySelector('b').textContent=method==='adobe'?'Adobe home':'Home';
    updateUI();
  };
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
        ? "The shared meal is planned. Its prepared portions will reach the table before mealtime starts."
        : result,
    );
    state = JSON.parse(game.snapshot());
    updateUI();
    save();
  };
  for(const button of document.querySelectorAll('[data-cancel-gathering]'))button.onclick=()=>{
    const result=game.cancel_gathering();
    toast(result==='ok'?'Gathering cancelled. Unserved meals remain recoverable.':result);
    state=JSON.parse(game.snapshot());updateUI();save();
  };
  $("#use-tools").onchange = (e) => {
    game.set_tools_enabled(e.target.checked);
    state = JSON.parse(game.snapshot());
    updateUI();
    save();
  };
  $('#season-weather').onchange=e=>{
    if(typeof game.set_seasons_enabled!=='function'||!game.set_seasons_enabled(e.target.checked))return;
    state=JSON.parse(game.snapshot());updateUI();render();save();
  };
  $('#weather-open').onclick=()=>{
    showPanel('supplies-panel','water');
    const forecast=$('#weather-forecast');forecast.open=true;forecast.querySelector('summary').focus({preventScroll:true});
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
    const imported=JSON.parse(pendingImport);
    residentAppearances.setActive(imported.residents.map(person=>person.appearance));
    if(imported.residents.some(person=>!residentAppearances.isReady(person.appearance,{sheets:['base','idle','activities']}))){
      const confirm=$('#confirm-import'),cancel=$('#cancel-import'),label=confirm.textContent;confirm.disabled=cancel.disabled=true;confirm.textContent='Preparing resident artwork…';
      ensureResidentArtwork(imported,()=>{confirm.disabled=cancel.disabled=false;confirm.textContent=label;confirm.click();},()=>{const recover=()=>{confirm.disabled=cancel.disabled=false;confirm.textContent=label;$('#import-summary').textContent='Resident artwork could not load. Retry or cancel; your current village and saved data are unchanged.';};if(!ensureResidentArtwork(JSON.parse(game.snapshot()),recover))recover();});return;
    }
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
  $("#help").onclick = openHelp;
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
    if(landMap.pin(uniso(x,y),tool)){render();return;}
    if (tool) {
      const p = uniso(x, y),
        result = movingBattery!==null?game.queue_battery_work(movingBattery,'move',p.x,p.y):movingBuilding!==null?game.queue_building_work(movingBuilding,"move",p.x,p.y):tool === "road" ? game.toggle_road(p.x, p.y) : tool.startsWith('source_')?game.place_source(sourceMaterial(tool),p.x,p.y):game.place_with_recipe(tool, p.x, p.y, tool==='home'?$('#home-material-method').value:'standard');
      if (result === "ok") {
        if (tool !== "road") {
          toast(movingBattery!==null?'Battery move queued. A neighbour will pack, carry and install it.':movingBuilding!==null?'Move queued. Residents will pack here and rebuild at the new plot.':tool.startsWith('source_')?`${kinds[tool][0]} established. Check Construction → Our land resources for growth and harvests.`:!usesLogistics(state.village)?`${kinds[tool][0]} is ready.`:`${kinds[tool][0]} planned. Let's build it together.`);
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
        else{
          const bank=state.village.power.network?.nodes.find(n=>n.owner.kind==='ground'&&n.x===cell.x&&n.y===cell.y);
          if(bank){showPanel('power-panel');$(`[data-battery="${bank.id}"]`)?.scrollIntoView({block:'nearest'});}
        }
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
      if(landMap?.isOpen()){landMap.close();return;}
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
  window.addEventListener('solar:dev-reload', event => {
    try {
      sessionStorage.setItem('solar-dev-reload', JSON.stringify({
        url:location.href, raw:game.snapshot(), active:gameActive, paused, speed, zoom, pan,
        dialogs:[...document.querySelectorAll('dialog[open]')].map(dialog=>dialog.id),
        scene:sandboxName, parent:sandbox ? {...sandbox, game:undefined, raw:sandbox.game.snapshot()} : null,
      }));
    } catch { event.preventDefault(); toast('Reload paused: export your checkpoint before refreshing.'); }
  });
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
function installCreationSession(){
  const session=playerSession;
  document.body.classList.add('in-creation-run');
  const bar=document.createElement('nav');bar.className='creation-session';bar.setAttribute('aria-label','Scenario session');
  const label=document.createElement('strong');label.textContent=session.isTest?'Playtest · '+session.record.title:session.record.title;label.title=label.textContent;bar.append(label);
  if(session.record.release){const note=document.createElement('small');note.textContent=`Version ${session.record.release.content_revision} · by ${session.record.release.author}`;note.title=note.textContent;bar.append(note);}
  if(session.record.definition.start.resident_balance==='unrestricted'){const note=document.createElement('small');note.textContent='Unrestricted starting skills';bar.append(note);}
  const button=(text,action)=>{const b=document.createElement('button');b.textContent=text;b.onclick=async()=>{b.disabled=true;try{await action();}catch(error){toast(error.message);}finally{b.disabled=false;}};bar.append(b);};
  button('Save checkpoint',()=>session.save());
  if(session.isTest)button('Restart test',async()=>{await session.restartTest();refreshDevScene();if(!paused)togglePause();});
  button(session.isTest?'Return to editor':'Scenario library',async()=>{
    if(!paused)togglePause();
    await session.finishTest();
    location.href=session.isTest&&session.record.projectId?'./editor.html?project='+encodeURIComponent(session.record.projectId):'./editor.html?library=1';
  });
  document.body.append(bar);
  refreshDevScene();
  if(session.isTest&&!paused)togglePause();
  const camera=session.record.definition.map.camera;
  if(camera){const point=iso(camera[0],camera[1]);pan.x+=width/2-point.x;pan.y+=height/2-point.y;render();}
  if(session.recovered)toast('Recovered your last scenario checkpoint.');
}
function refreshDevScene() {
  if(ensureResidentArtwork(JSON.parse(game.snapshot()),refreshDevScene))return;
  economyUI?.resetForVillage();
  challengeFailureShown=false;
  setZoom(zoom);
  residentAnimations.clear(); groundKey = null; time = 0; weatherTime = 0; animationDelta = 0;
  state = JSON.parse(game.snapshot()); selected = null; tool = null; movingBuilding = null; movingBattery = null; pendingRemoval = null;
  previousVillage = state.village; cameraTarget = null; milestoneQueue.length = 0;
  clearTimeout(celebrationTimer); showingMilestone = false; $("#milestone").hidden = true;
  clearTimeout(toastTimer); $("#toast").hidden = true;
  closePanels(); $("#person").hidden = true; $("#placement").hidden = true;
  for (const id of ['import-save', 'restore-backup', 'new-scenario']) $("#" + id).disabled = !!sandbox || artworkPreview || !!directScenario || !!playerSession;
  updateUI(); render();
}
const devAPI = {
  utilityEndpoints: kind=>JSON.parse(game.utility_endpoints(kind)),
  utilityPreview: (kind,from,to)=>JSON.parse(game.utility_preview(kind,from,to)),
  snapshot: () => JSON.parse(game.snapshot()),
  inspect: () => JSON.parse(game.dev_inspect()),
  observe: () => game.dev_observe(true),
  isSandbox: () => !!sandbox,
  scenario: () => sandboxName || (artworkPreview ? 'Artwork preview' : 'Saved village'),
  async loadScenario(id) {
    if (loadingScenario||residentArtworkLoading) throw new Error('Wait for the current scene and resident artwork to finish loading.');
    loadingScenario = true;
    const candidate = new Game();
    try {
      let raw;
      if (id === 'copy') raw = game.snapshot();
      else {
        candidate.start_mode('story');
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
    zoom=1.3;pan={x:0,y:0};refreshDevScene(); devTools?.refresh();
  },
  importSandbox(raw) {
    if(loadingScenario||residentArtworkLoading)throw new Error('Wait for the current scene and resident artwork to finish loading.');
    if(raw.length>5_000_000)throw new Error('Choose a checkpoint smaller than 5 MB.');
    const candidate=new Game();
    if(!candidate.restore(raw)){candidate.free();throw new Error('This checkpoint is not a valid village. The current scene is unchanged.');}
    const cast=JSON.parse(candidate.snapshot());if(cast.residents.some(p=>!residentAppearances.isReady(p.appearance,{sheets:['base','idle','activities']}))){candidate.free();return new Promise((resolve,reject)=>{ensureResidentArtwork(cast,()=>{try{resolve(devAPI.importSandbox(raw));}catch(error){reject(error);}},error=>{const fail=()=>reject(error);if(!ensureResidentArtwork(JSON.parse(game.snapshot()),fail,fail))fail();});});}
    if(!sandbox)sandbox={game,paused,zoom,pan:{...pan},time};else game.free();
    game=candidate;sandboxName='imported';game.dev_observe(true);if(!paused)togglePause();
    refreshDevScene();devTools?.refresh();
  },
  returnToVillage() {
    if (loadingScenario||residentArtworkLoading) throw new Error('Wait for the current scene and resident artwork to finish loading.');
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
    loadRegionalArt(),
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
    if(!residentPreview){
      const fresh=JSON.parse(game.snapshot()),baseline=new Game();
      try{
        if(!baseline.restore(saved))throw new Error('Artwork preview baseline is invalid');
        saved=JSON.stringify(makeArtPreview(fresh,JSON.parse(baseline.snapshot()),{night:nightPreview}));
      }finally{baseline.free();}
    }
  }
  if (saved !== null && saved !== undefined && !game.restore(saved)) {
    if (artworkPreview) throw new Error("The artwork preview fixture is invalid");
    try { storage.quarantine(saved); } catch { $("#save-warning").hidden = false; }
    $("#recovery-notice").hidden = false;
    $("#export-recovery").hidden = false;
    toast("This save could not load. Your original data is preserved; export it in Settings.");
  }
  const runId=new URLSearchParams(location.search).get('run');
  if(runId&&!artworkPreview&&!directScenario){
    const library=new ContentLibrary();
    try{playerSession=await PlayerSession.open(library,runId,Game);game.free();game=playerSession.game;}
    catch(error){library.close();toast(error.message);}
  }
  state = JSON.parse(game.snapshot());
  await prepareResidentCast(state);
  gameActive=artworkPreview || !!directScenario || !!playerSession;
  setup();
  installMenu();
  devTools = installDevTools(devAPI);
  window.solarDev = Object.freeze(devAPI);
  if (directScenario) { await devAPI.loadScenario(directScenario); devTools.open(); }
  if(!artworkPreview && !directScenario && !playerSession) openMainMenu();
  if(playerSession) installCreationSession();
  if (artworkPreview) {
    const notice = document.createElement('a');
    notice.href = './';
    notice.className = 'artwork-preview-notice';
    if(residentPreview){
      // This maintained pose fixture occupies its own clearing, independently
      // of the normal centered start. Frame the actual cast after projection.
      render();
      const people=state.residents.filter(r=>!residentIsAway(r));
      if(people.length){
        const xs=people.map(r=>r.x),ys=people.map(r=>r.y);
        const point=iso((Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2);
        pan.x+=width/2-point.x;pan.y+=height*.48-point.y;render();
      }
    }
    notice.textContent = `${previewParams.has('art-draft') ? 'ART DRAFT · ' : ''}${residentPreview?'Resident animation':`${nightPreview?'Night artwork':'Artwork'} · ${state.village.buildings.length} building variants`} preview · Return to your village ↗`;
    document.body.append(notice);
    togglePause();
    save();
  }
  // Dev-server reloads preserve the test scene separately from playable saves.
  const resumeRaw=sessionStorage.getItem('solar-dev-reload');
  if(resumeRaw){
    const resume=JSON.parse(resumeRaw);
    if(resume.url===location.href && game.restore(resume.raw)){
      if(resume.parent){
        const parent=new Game();
        if(!parent.restore(resume.parent.raw)){parent.free();throw new Error('Dev reload parent checkpoint needs recovery');}
        sandbox?.game.free();sandbox={...resume.parent,game:parent};sandboxName=resume.scene;
      }
      ({zoom,pan,speed}=resume);gameActive=resume.active;
      storage=modeStores[JSON.parse(resume.parent?.raw||resume.raw).village.mode||'story'];
      if(gameActive)$('#main-menu').close();
      if(paused!==resume.paused)togglePause();
      refreshDevScene();devTools.refresh();last=0;reportElapsed=Infinity;
      const dialogs=resume.dialogs||[];
      for(const dialog of document.querySelectorAll('dialog[open]'))if(!dialogs.includes(dialog.id))dialog.close();
      for(const id of dialogs){const dialog=document.getElementById(id);if(dialog&&!dialog.open)dialog.showModal();}
    }
    sessionStorage.removeItem('solar-dev-reload');
  }

  window.solarDevReloadReady=true;window.dispatchEvent(new Event('solar:dev-ready'));
} catch (error) {
  console.error(error);
  $("#load-status").textContent =
    "The village could not load. Please reload, or check that the WebAssembly build is being served.";
}
