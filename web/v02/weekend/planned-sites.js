import * as THREE from "three";
import { METRES_PER_CELL } from "../library/scale.js";

// Planned sites are marked the way a builder would set one out: a lime line
// around the true footprint, corner stakes with string, and
// a translucent ghost of the finished building. Each state adds a physical cue, never only a colour:
//   waiting  – survey pennant, empty pallet
//   supplied – pennant, pallet stacked with the delivered loads
//   building – pennant struck, sawhorse on site, ghost fading as walls rise
// Markers and lines are merged into two draw calls however many sites are
// planned; ghosts share one geometry per building type and five materials.

const GHOST_FADE_END = 0.6; // The real frame carries the shape from here on.
const STACK_TIERS = 3;

export function plannedSiteState(project, definition, loads) {
  if (!definition || definition.natural || project.natural || project.felled) return null;
  if (!(definition.work > 0) || project.work >= definition.work) return null;
  const progress = Math.max(0, project.work / definition.work);
  const delivered = loads > 0 ? Math.min(1, (project.delivered || 0) / loads) : 1;
  const state = project.work > 0 ? "building" : delivered >= 1 ? "supplied" : "waiting";
  // Materials leave the pallet as they are built into the structure.
  const stock = state === "building" ? 1 - progress : delivered;
  return {
    state,
    progress,
    tiers: stock <= 0 ? 0 : Math.max(1, Math.round(stock * STACK_TIERS)),
    pennant: state !== "building",
    sawhorse: state === "building",
    // Quantised so a site under construction rebuilds the shared mesh rarely.
    ghost: Math.ceil(Math.max(0, 1 - progress / GHOST_FADE_END) * 5) / 5,
  };
}

const COLORS = {
  stake: "#8a6a45",
  stakeTop: "#f4ecd6",
  string: "#f4ecd6",
  pole: "#efe6cf",
  pennant: "#d9643a",
  pallet: "#a98658",
  stackA: "#d2b077",
  stackB: "#bd9458",
  sawhorse: "#9a7648",
};
for (const key of Object.keys(COLORS)) COLORS[key] = new THREE.Color(COLORS[key]);
const CHALK = new THREE.Color("#f7efd6");
const GHOST = "#fff6dc", GHOST_OPACITY = 0.34;

export function createPlannedSites({ world, footprint, definitions, loads, hasStages, model, widthScale = () => 1 }) {
  const group = new THREE.Group();
  group.name = "planned-sites";
  const solidMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
  const chalkMaterial = new THREE.MeshBasicMaterial({
    color: CHALK, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  // A depth-only pass first, so the ghost shows one even veil instead of every
  // overlapping rafter and wall adding up.
  const ghostDepth = new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true });
  const ghostVeils = new Map();
  const ghostVeil = (strength) => {
    if (!ghostVeils.has(strength)) ghostVeils.set(strength, new THREE.MeshStandardMaterial({
      color: GHOST, roughness: 1, flatShading: true, transparent: true, depthWrite: false,
      depthFunc: THREE.LessEqualDepth, opacity: GHOST_OPACITY * (0.35 + 0.65 * strength),
    }));
    return ghostVeils.get(strength);
  };
  const solid = new THREE.Mesh(new THREE.BufferGeometry(), solidMaterial);
  solid.castShadow = true;
  solid.receiveShadow = true;
  const chalk = new THREE.Mesh(new THREE.BufferGeometry(), chalkMaterial);
  const ghosts = new THREE.Group();
  group.add(ghosts);
  for (const object of [solid, chalk]) {
    object.frustumCulled = false;
    object.visible = false;
    // Markers are scenery: clicks pass through to the site beneath them.
    object.raycast = () => {};
    group.add(object);
  }

  const unitBox = new THREE.BoxGeometry(1, 1, 1).toNonIndexed().getAttribute("position").array;
  const ghostGeometries = new Map();
  function ghostGeometry(asset) {
    if (!ghostGeometries.has(asset)) {
      const root = model(asset), parts = [];
      root.updateMatrixWorld(true);
      root.traverse((object) => {
        if (!object.isMesh) return;
        const part = (object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone()).applyMatrix4(object.matrixWorld);
        parts.push(part.getAttribute("position").array);
        part.dispose();
      });
      root.traverse((object) => object.geometry?.dispose());
      const merged = new Float32Array(parts.reduce((n, part) => n + part.length, 0));
      let offset = 0;
      for (const part of parts) { merged.set(part, offset); offset += part.length; }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(merged, 3));
      ghostGeometries.set(asset, geometry);
    }
    return ghostGeometries.get(asset);
  }

  let signature = null, light = -1, sites = [];
  const noPick = () => {};
  const signatureOf = (s) => {
    let text = `${s.terrainPads?.length || 0}|${s.elevationSeed}`, roads = 0;
    const found = [];
    for (const p of s.projects) {
      if (p.key === "road") roads++;
      const def = definitions[p.key];
      const site = plannedSiteState(p, def, def && !def.natural ? loads(p) : 0);
      const move = p.removal?.mode === "move" ? p.removal.target : null;
      if (!site && !move) continue;
      found.push({ p, def, site, move });
      text += `;${p.id},${p.x},${p.z},${p.rotation || 0}`;
      if (site) text += `,${site.state[0]}${site.tiers}${site.ghost}`;
      if (move) text += `>${move.x},${move.z},${move.rotation}`;
    }
    return { text: `${text}|${roads}`, found };
  };

  function rebuild(s, found) {
    const solidPositions = [], solidColors = [], chalkPositions = [];
    ghosts.clear();
    const box = (x, y, z, sx, sy, sz, color) => {
      for (let i = 0; i < unitBox.length; i += 3) {
        solidPositions.push(x + unitBox[i] * sx, y + unitBox[i + 1] * sy, z + unitBox[i + 2] * sz);
        solidColors.push(color.r, color.g, color.b);
      }
    };
    // Cell centres sit on whole numbers, so a footprint's edges fall on halves.
    const ground = (cx, cz) => world(cx, cz);
    const chalkEdge = (ax, az, bx, bz) => {
      const a = ground(ax, az), b = ground(bx, bz), half = 0.13;
      const along = new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
      const nx = -along.z * half, nz = along.x * half, ex = along.x * half, ez = along.z * half;
      const ay = a.y + 0.07, by = b.y + 0.07;
      chalkPositions.push(
        a.x - ex + nx, ay, a.z - ez + nz, b.x + ex + nx, by, b.z + ez + nz, b.x + ex - nx, by, b.z + ez - nz,
        a.x - ex + nx, ay, a.z - ez + nz, b.x + ex - nx, by, b.z + ez - nz, a.x - ex - nx, ay, a.z - ez - nz,
      );
    };
    const roadCells = new Set();
    for (const p of s.projects) if (p.key === "road") roadCells.add(`${p.x},${p.z}`);

    const outline = (project, { stakes, strings, lines }) => {
      const [w, d] = footprint(project), x0 = project.x - 0.5, z0 = project.z - 0.5;
      if (lines) {
        for (let i = 0; i < w; i++) { chalkEdge(x0 + i, z0, x0 + i + 1, z0); chalkEdge(x0 + i, z0 + d, x0 + i + 1, z0 + d); }
        for (let i = 0; i < d; i++) { chalkEdge(x0, z0 + i, x0, z0 + i + 1); chalkEdge(x0 + w, z0 + i, x0 + w, z0 + i + 1); }
      }
      const corners = [[x0, z0], [x0 + w, z0], [x0 + w, z0 + d], [x0, z0 + d]].map(([x, z]) => ground(x, z));
      if (stakes) for (const c of corners) {
        box(c.x, c.y + 0.4, c.z, 0.09, 0.8, 0.09, COLORS.stake);
        box(c.x, c.y + 0.86, c.z, 0.11, 0.14, 0.11, COLORS.stakeTop);
      }
      if (strings) for (let i = 0; i < 4; i++) {
        const a = corners[i], b = corners[(i + 1) % 4], y = Math.max(a.y, b.y) + 0.66;
        // Footprints are axis-aligned, so each run of string is a thin box.
        box((a.x + b.x) / 2, y, (a.z + b.z) / 2, Math.abs(b.x - a.x) + 0.04, 0.035, Math.abs(b.z - a.z) + 0.04, COLORS.string);
      }
      return corners;
    };
    const pennant = (corner) => {
      box(corner.x, corner.y + 1.25, corner.z, 0.07, 2.5, 0.07, COLORS.pole);
      box(corner.x + 0.34, corner.y + 2.22, corner.z, 0.62, 0.42, 0.05, COLORS.pennant);
    };
    const drawGhost = (project, def, strength) => {
      if (!strength) return;
      const geometry = ghostGeometry(def.asset), [w, d] = footprint(project);
      for (const [material, order] of [[ghostDepth, 3], [ghostVeil(strength), 4]]) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(world(project.x + (w - 1) / 2, project.z + (d - 1) / 2));
        mesh.position.y += 0.02;
        mesh.rotation.y = ((project.rotation || 0) * Math.PI) / 2;
        mesh.scale.z = widthScale(project);
        mesh.renderOrder = order;
        mesh.raycast = noPick;
        ghosts.add(mesh);
      }
    };

    for (const { p, def, site, move } of found) {
      const road = p.key === "road", bridge = def.kind === "bridge";
      if (site) {
        if (road) {
          // A run of road tiles gets one outline around the whole run. Each
          // tile's own groundwork model already carries its stakes and string.
          const x0 = p.x - 0.5, z0 = p.z - 0.5;
          if (!roadCells.has(`${p.x},${p.z - 1}`)) chalkEdge(x0, z0, x0 + 1, z0);
          if (!roadCells.has(`${p.x},${p.z + 1}`)) chalkEdge(x0, z0 + 1, x0 + 1, z0 + 1);
          if (!roadCells.has(`${p.x - 1},${p.z}`)) chalkEdge(x0, z0, x0, z0 + 1);
          if (!roadCells.has(`${p.x + 1},${p.z}`)) chalkEdge(x0 + 1, z0, x0 + 1, z0 + 1);
        } else {
          // A bridge spans water: no lime line or string across the river.
          // The pennant flies from the corner nearest the usual camera, in
          // front of the ghost rather than veiled behind it.
          const corners = outline(p, { stakes: true, strings: !bridge, lines: !bridge });
          const [w, d] = footprint(p), W = w * METRES_PER_CELL, D = d * METRES_PER_CELL;
          if (site.pennant) pennant(corners[2]);
          drawGhost(p, def, site.ghost);
          if (!bridge) {
            // Supplies and the sawhorse sit in the corner nearest the usual camera.
            const centre = world(p.x + (w - 1) / 2, p.z + (d - 1) / 2), small = Math.min(W, D) < 4;
            const k = small ? 0.6 : 1, px = centre.x + W / 2 - 0.75 * k, pz = centre.z + D / 2 - 0.65 * k, y = centre.y;
            box(px, y + 0.05, pz, 1 * k, 0.1, 0.8 * k, COLORS.pallet);
            for (let tier = 0; tier < site.tiers; tier++)
              box(px, y + 0.1 + (tier + 0.5) * 0.2 * k, pz, (0.9 - tier * 0.06) * k, 0.2 * k, (0.7 - tier * 0.06) * k,
                tier % 2 ? COLORS.stackB : COLORS.stackA);
            if (site.sawhorse && !small) {
              const sx = px - 0.1, sz = pz - 1.5;
              box(sx, y + 0.74, sz, 1.3, 0.09, 0.14, COLORS.sawhorse);
              for (const dx of [-0.52, 0.52]) for (const dz of [-0.2, 0.2])
                box(sx + dx, y + 0.35, sz + dz, 0.07, 0.7, 0.07, COLORS.sawhorse);
              for (const dx of [-0.52, 0.52]) box(sx + dx, y + 0.3, sz, 0.05, 0.05, 0.42, COLORS.sawhorse);
            }
          }
        }
      }
      if (move) {
        // The reserved destination of a relocation is set out like a new site.
        const target = { ...p, ...move };
        const corners = outline(target, { stakes: !road, strings: !road && !bridge, lines: !bridge });
        if (!road) { pennant(corners[2]); drawGhost(target, def, 1); }
      }
    }

    const assign = (object, positions, colors, size) => {
      object.geometry.dispose();
      object.geometry = new THREE.BufferGeometry();
      object.geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      if (colors) object.geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, size));
      object.visible = positions.length > 0;
    };
    assign(solid, solidPositions, solidColors, 3);
    assign(chalk, chalkPositions);
    sites = found.map(({ p, site, move }) => ({ id: p.id, state: site?.state || null, moving: !!move }));
  }

  return {
    group,
    // Types without staged construction models would otherwise show their
    // finished model from the moment they are planned.
    hidesModel(project, definition) {
      return project.work === 0 && !definition.natural && !project.natural && definition.work > 0 &&
        project.key !== "field" && !hasStages(definition.asset);
    },
    // Cheap enough to call every frame: geometry is rebuilt only when a site changes.
    sync(s, night = 0) {
      const next = signatureOf(s);
      const changed = next.text !== signature;
      if (changed) {
        signature = next.text;
        rebuild(s, next.found);
      }
      const level = Math.round((1 - 0.58 * Math.max(0, Math.min(1, night))) * 50) / 50;
      if (level !== light) {
        // The unlit lime line dims with the daylight instead of glowing at night.
        light = level;
        chalkMaterial.color.copy(CHALK).multiplyScalar(level);
      }
      return changed;
    },
    sites: () => sites,
  };
}
