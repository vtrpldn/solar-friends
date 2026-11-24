// Arrival skip, camp-site preview and the camp as it is carried over and set up.
import * as THREE from "three";
import {
  campLocation,
  campPlacementError,
  campSiteFacts,
  canRepitchCamp,
  chooseCamp,
  repitchCamp,
  skipArrival,
} from "./simulation.js";
import { CAMP_LOADS, campFacing, campPoint, campRect } from "./camp.js";
import { carDoor } from "./town-trip.js";
import {
  createTent,
  createCampGear,
  createCampBundle,
  createCampMarker,
  CAMP_TENT_SPOTS,
} from "../library/camping.js";

const OK = "#f6f2cf",
  BAD = "#d0714d";
function campItem(id) {
  if (id === "marker") return createCampMarker();
  if (!CAMP_TENT_SPOTS[id]) return createCampGear(id);
  const tent = createTent(id === "tent-a" ? 0 : 1);
  tent.position.set(CAMP_TENT_SPOTS[id][0], 0, CAMP_TENT_SPOTS[id][1]);
  const holder = new THREE.Group();
  holder.add(tent);
  return holder;
}
export function installCampUI({
  state,
  scene,
  campGroup,
  actors,
  world,
  hit,
  camera,
  finish,
  placing,
  message,
  persist,
  refresh,
}) {
  // --- The camp itself -----------------------------------------------------
  let drawn = "",
    drawnSite = "";
  const rising = [];
  function syncCamp(now) {
    const s = state(),
      c = s.camp ? campLocation(s) : null;
    const present = c
      ? CAMP_LOADS.filter((_, k) => !s.unpack || s.unpack.delivered.includes(k)).map((l) => l.id)
      : [];
    if (s.unpack) present.push("marker");
    const site = JSON.stringify(c && [c.x, c.z, c.rotation || 0]);
    const signature = site + present.join();
    if (signature !== drawn) {
      const kept = site === drawnSite ? new Set(campGroup.children.map((o) => o.userData.load)) : new Set();
      if (site !== drawnSite) {
        campGroup.clear();
        rising.length = 0;
      }
      for (const old of [...campGroup.children]) if (!present.includes(old.userData.load)) campGroup.remove(old);
      for (const id of present) {
        if (kept.has(id)) continue;
        const item = finish(campItem(id));
        item.userData.load = id;
        // Only gear that arrives during play goes up before the player's eyes.
        if (site === drawnSite && s.unpack && id !== "marker") {
          item.scale.set(1, 0.05, 1);
          rising.push({ item, from: now });
        }
        campGroup.add(item);
      }
      drawn = signature;
      drawnSite = site;
    }
    if (c) {
      campGroup.position.copy(world(c.x, c.z));
      campGroup.rotation.y = campFacing(c);
    }
    for (let i = rising.length - 1; i >= 0; i--) {
      const t = Math.min(1, (now - rising[i].from) / 1400);
      rising[i].item.scale.y = 0.05 + 0.95 * t * t * (3 - 2 * t);
      if (t >= 1) rising.splice(i, 1);
    }
    return rising.length > 0;
  }
  // --- What is still in the cars, and what is in someone's arms -------------
  const pile = new THREE.Group();
  scene.add(pile);
  let piled = "";
  function syncLoads() {
    const s = state();
    const carried = s.people.map((r) => (r.unpack?.phase === "carry" ? r.unpack.load : null));
    const waiting = s.unpack
      ? CAMP_LOADS.map((_, k) => k).filter((k) => !s.unpack.delivered.includes(k) && !carried.includes(k))
      : [];
    const signature = waiting.join() + "|" + carried.join();
    if (signature === piled) return;
    piled = signature;
    pile.clear();
    const stacked = [0, 0];
    for (const k of waiting) {
      const load = CAMP_LOADS[k],
        door = carDoor(load.car),
        n = stacked[load.car]++;
      const bundle = finish(createCampBundle(load.id));
      // Stacked on the ground just behind each car's tailgate.
      bundle.position.copy(world(door.x + (load.car ? 0.55 : -0.55), door.z - 0.9 + (n % 2) * 0.45));
      bundle.position.y += 0.2 + Math.floor(n / 2) * 0.4;
      bundle.rotation.y = n * 0.7;
      pile.add(bundle);
    }
    for (const [i, actor] of actors.entries()) {
      const held = actor.userData.campBundle;
      if (held && held.userData.load !== carried[i]) {
        actor.remove(held);
        actor.userData.campBundle = null;
      }
      if (carried[i] !== null && !actor.userData.campBundle) {
        const bundle = finish(createCampBundle(CAMP_LOADS[carried[i]].id));
        bundle.userData.load = carried[i];
        bundle.position.set(0, 1.02, 0.36);
        actor.add(bundle);
        actor.userData.campBundle = bundle;
      }
    }
  }
  // --- Site preview --------------------------------------------------------
  const preview = new THREE.Group();
  preview.visible = false;
  scene.add(preview);
  // The real camp, in its own colours, seen through; rust when it cannot stand here.
  const ghostCamp = new THREE.Group(),
    ghostMaterials = new Map();
  for (const load of CAMP_LOADS) ghostCamp.add(campItem(load.id));
  ghostCamp.traverse((o) => {
    if (!o.isMesh) return;
    if (!ghostMaterials.has(o.material)) {
      const see = new THREE.MeshBasicMaterial({ color: o.material.color, transparent: true, opacity: 0.74, depthWrite: false, side: THREE.DoubleSide });
      see.userData.own = o.material.color.clone().lerp(new THREE.Color("#fff6d8"), 0.25);
      ghostMaterials.set(o.material, see);
    }
    o.material = ghostMaterials.get(o.material);
    o.castShadow = false;
    o.receiveShadow = false;
  });
  const bad = new THREE.Color(BAD);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: OK, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }),
  );
  ground.rotation.x = -Math.PI / 2;
  const outline = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]].map(([x, z]) => new THREE.Vector3(x, 0, z))),
    new THREE.LineBasicMaterial({ color: OK, depthTest: false }),
  );
  outline.renderOrder = 11;
  const walk = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineDashedMaterial({ color: "#fff3bf", dashSize: 0.7, gapSize: 0.5, depthTest: false }),
  );
  walk.renderOrder = 11;
  walk.frustumCulled = false;
  const riverMark = new THREE.Mesh(
    new THREE.RingGeometry(0.45, 0.62, 28),
    new THREE.MeshBasicMaterial({ color: "#8fd0e6", side: THREE.DoubleSide, depthTest: false }),
  );
  riverMark.rotation.x = -Math.PI / 2;
  riverMark.renderOrder = 11;
  preview.add(ground, outline, ghostCamp, walk, riverMark);

  const card = document.createElement("aside");
  card.id = "camp-site";
  card.hidden = true;
  card.setAttribute("aria-live", "polite");
  document.body.append(card);
  const skip = document.createElement("button");
  skip.id = "skip-arrival-button";
  skip.textContent = "Skip · Esc";
  skip.hidden = true;
  const move = document.createElement("button");
  move.id = "move-camp";
  move.textContent = "Move camp";
  move.title = "The camp can move until the first load is set down there.";
  move.hidden = true;
  document.getElementById("message").after(skip, move);

  let rotation = 0,
    moving = false,
    site = null,
    shown = null,
    pending = false,
    lastPointer = null;
  const arriving = () => !!state().arrivalAnimating;
  function pitching() {
    const s = state();
    if (s.arrivalAnimating || placing()) return false;
    if (s.stage === "arrival") return true;
    if (moving && !canRepitchCamp(s)) stopMoving("The first load is down. The camp stays where it is.");
    return moving;
  }
  function stopMoving(text) {
    moving = false;
    hide();
    move.classList.remove("active");
    if (text !== undefined) message(text);
  }
  function hide() {
    preview.visible = false;
    card.hidden = true;
    site = null;
    shown = null;
  }
  // Keep the middle of the tents under the cursor, whichever way they face.
  function siteAt(point) {
    const middle = campPoint({ x: 0, z: 0, rotation }, 1, -1.5);
    return {
      x: Math.round(point.x / 2 + 32 - middle.x),
      z: Math.round(point.z / 2 + 32 - middle.z),
      rotation,
    };
  }
  function hover(e) {
    if (!pitching()) return false;
    lastPointer = { clientX: e.clientX, clientY: e.clientY };
    const point = hit(e);
    if (!point) {
      hide();
      return true;
    }
    site = siteAt(point);
    if (!pending) {
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        draw();
      });
    }
    return true;
  }
  const row = (label, value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
  function draw() {
    if (!site || !pitching()) return;
    const key = `${site.x},${site.z},${site.rotation}`;
    if (key === shown) return;
    shown = key;
    const s = state(),
      error = campPlacementError(s, site.x, site.z, site.rotation),
      facts = campSiteFacts(s, site.x, site.z, site.rotation),
      rect = campRect(site);
    const colour = error ? BAD : OK;
    for (const see of ghostMaterials.values()) see.color.copy(see.userData.own).lerp(bad, error ? 0.75 : 0);
    ground.material.color.set(colour);
    outline.material.color.set(colour);
    const lift = (x, z) => new THREE.Vector3((x - 32) * 2, facts.height + 0.06, (z - 32) * 2);
    const centre = lift(rect.x + (rect.w - 1) / 2, rect.z + (rect.d - 1) / 2);
    ground.position.copy(centre);
    ground.scale.set(rect.w * 2, rect.d * 2, 1);
    outline.position.copy(centre).setY(facts.height + 0.1);
    outline.scale.set(rect.w * 2, 1, rect.d * 2);
    ghostCamp.position.copy(lift(site.x, site.z));
    ghostCamp.rotation.y = campFacing(site);
    walk.visible = !error && !!facts.carsPath;
    if (walk.visible) {
      const points = [];
      for (let i = 1; i < facts.carsPath.length; i++) {
        const a = facts.carsPath[i - 1],
          b = facts.carsPath[i],
          steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z)));
        for (let n = i === 1 ? 0 : 1; n <= steps; n++) {
          const p = world(a.x + ((b.x - a.x) * n) / steps, a.z + ((b.z - a.z) * n) / steps);
          p.y += 0.14;
          points.push(p);
        }
      }
      walk.geometry.dispose();
      walk.geometry = new THREE.BufferGeometry().setFromPoints(points);
      walk.computeLineDistances();
    }
    riverMark.visible = !error && !!facts.riverAccess;
    if (riverMark.visible) {
      riverMark.position.copy(world(facts.riverAccess.x, facts.riverAccess.z));
      riverMark.position.y += 0.16;
    }
    preview.visible = true;
    const metres = (n) => (n === null ? "no path" : `${n} m on foot`);
    card.className = error ? "blocked" : "";
    card.innerHTML =
      `<strong>${error ? "Cannot pitch here" : "Camp site"}</strong>` +
      (error ? `<p>${error}</p>` : "") +
      `<dl>${row("Cars and supplies", metres(facts.carsMetres))}${row("River", metres(facts.riverMetres))}` +
      `${row("Ground", facts.fallMetres < 0.15 ? "level" : `falls ${facts.fallMetres.toFixed(1)} m across the site`)}` +
      `${row("Trees within 12 m", facts.trees || "none")}</dl>` +
      `<small>${["<kbd>R</kbd> turn", error ? "" : "click to pitch", moving ? "<kbd>Esc</kbd> cancel" : ""].filter(Boolean).join(" · ")}</small>`;
    card.hidden = false;
    place();
  }
  // The readout sits beside the site, never under the cursor or off screen.
  const corner = new THREE.Vector3();
  function place() {
    if (card.hidden || !site) return;
    const rect = campRect(site);
    let right = -Infinity,
      top = Infinity,
      bottom = -Infinity,
      left = Infinity;
    for (const [dx, dz] of [[0, 0], [rect.w, 0], [0, rect.d], [rect.w, rect.d]]) {
      corner.copy(world(rect.x - 0.5 + dx, rect.z - 0.5 + dz)).project(camera);
      const x = ((corner.x + 1) / 2) * innerWidth,
        y = ((1 - corner.y) / 2) * innerHeight;
      right = Math.max(right, x);
      left = Math.min(left, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
    const w = card.offsetWidth,
      h = card.offsetHeight;
    let x = right + 18;
    if (x + w > innerWidth - 12) x = left - w - 18;
    const y = Math.max(86, Math.min(innerHeight - h - (state().stage === "arrival" ? 70 : 220), (top + bottom) / 2 - h / 2));
    card.style.transform = `translate(${Math.round(Math.max(12, x))}px, ${Math.round(y)}px)`;
  }
  function rotate(direction = 1) {
    rotation = (rotation + direction + 4) % 4;
    if (lastPointer) hover(lastPointer);
  }
  // Returns true when the click belonged to the arrival or the camp.
  function click(e) {
    const s = state();
    if (skipNow()) return true;
    if (!pitching()) return false;
    const point = hit(e);
    if (!point) return true;
    const chosen = siteAt(point),
      error = campPlacementError(s, chosen.x, chosen.z, chosen.rotation);
    if (error) {
      message(error);
      return true;
    }
    const pitched = s.stage === "arrival"
      ? chooseCamp(s, chosen, { unpack: true })
      : repitchCamp(s, chosen);
    if (!pitched) return true;
    stopMoving();
    message(s.log[0]);
    persist();
    refresh();
    return true;
  }
  function skipNow() {
    if (!skipArrival(state())) return false;
    persist();
    refresh();
    return true;
  }
  skip.onclick = skipNow;
  move.onclick = () => {
    if (moving) return stopMoving("");
    if (!canRepitchCamp(state())) return;
    moving = true;
    move.classList.add("active");
    message("Choose the new camp site. Esc keeps the camp where it is.");
  };
  addEventListener(
    "keydown",
    (e) => {
      if (document.querySelector("dialog[open]") || e.target.closest?.("input,textarea,select,[contenteditable]") ||
        e.ctrlKey || e.metaKey || e.altKey) return;
      const onControl = e.target.closest?.("button,summary,a");
      const handled = arriving()
        ? ["Escape", "Enter", "Space"].includes(e.code) && !(onControl && e.code !== "Escape") && skipNow()
        : pitching() && (e.code === "KeyR"
          ? (rotate(e.shiftKey ? -1 : 1), true)
          : e.code === "Escape" && moving && (stopMoving(""), true));
      if (handled) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true,
  );
  return {
    hover,
    click,
    pitching,
    // Once per rendered frame. Returns true while something is still animating.
    update(now) {
      const s = state();
      const busy = syncCamp(now);
      syncLoads();
      skip.hidden = !s.arrivalAnimating;
      const canMove = !s.arrivalAnimating && !placing() && canRepitchCamp(s);
      move.hidden = !canMove;
      if (!pitching() && preview.visible) hide();
      if (preview.visible) place();
      return busy || preview.visible;
    },
  };
}
