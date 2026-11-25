// The look of wild trees, stone outcrops and earth deposits.
// /v2/?nature-preview is an unsaved scene showing every deposit stage.
// Everything is derived from the land seed and each object's cell, so a
// village looks the same every time it is loaded.
import * as THREE from 'three';
import {landRandom, depositCapacity} from './land-layout.js';
import {riverBankAt} from './river-layout.js';
import {accessRoadAt} from './road-layout.js';
import {CELL_MIN, CELL_MAX} from './map-size.js';
import {DAY} from './weather.js';

const query = new URLSearchParams(globalThis.location?.search || '');
export const naturePreview = query.has('nature-preview');
// ?nature=plain falls back to the earlier catalog models, for comparison.
export const natureLook = query.get('nature') !== 'plain';
export const naturePreviewFocus = query.get('nature-preview') || 'deposits';

const FRESH_STUMP = 6 * DAY;
const DEPOSIT_STEPS = 5;
const materials = new Map();
const mat = hex => {
  if (!materials.has(hex)) materials.set(hex, new THREE.MeshStandardMaterial({color: hex, roughness: 1, flatShading: true}));
  return materials.get(hex);
};
const cellSeed = (seed, x, z, salt = 0) => (seed ^ Math.imul(x + 1, 73856093) ^ Math.imul(z + 1, 19349663) ^ salt) >>> 0;
function add(g, geometry, hex, x, y, z) {
  const mesh = new THREE.Mesh(geometry, mat(hex));
  mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}
// Shared corners move together, so facets stay closed while every rock differs.
function roughen(geometry, random, amount, radial = true) {
  const points = geometry.attributes.position, moved = new Map();
  for (let i = 0; i < points.count; i++) {
    const x = points.getX(i), y = points.getY(i), z = points.getZ(i);
    const key = `${Math.round(x * 100)},${Math.round(y * 100)},${Math.round(z * 100)}`;
    if (!moved.has(key)) moved.set(key, radial
      ? [1 + (random() - .5) * 2 * amount]
      : [(random() - .5) * amount, (random() - .5) * amount * .5, (random() - .5) * amount]);
    const shift = moved.get(key);
    if (radial) points.setXYZ(i, x * shift[0], y * shift[0], z * shift[0]);
    else points.setXYZ(i, x + shift[0], y + shift[1], z + shift[2]);
  }
  return geometry;
}
function boulderGeometry(random, flatTop = .55) {
  const geometry = roughen(new THREE.IcosahedronGeometry(1, 1), random, .24);
  const points = geometry.attributes.position;
  // Split planes: weathered rock breaks along flat faces, not round ones.
  for (let i = 0; i < points.count; i++) points.setY(i, Math.max(-.5, Math.min(flatTop, points.getY(i))));
  geometry.computeVertexNormals();
  return geometry;
}
function slabGeometry(random) {
  const geometry = roughen(new THREE.BoxGeometry(1, 1, 1, 2, 1, 2), random, .16, false);
  geometry.computeVertexNormals();
  return geometry;
}
// Every outcrop on one map dips the same way, like beds of one formation.
function bedding(seed) {
  const random = landRandom(seed ^ 0x5bd1e995);
  return {yaw: random() * Math.PI * 2, dip: .12 + random() * .2};
}
// The village paint turns greys into the game's slate; anything paler than
// these would be repainted as plaster pink.
const STONE = ['#7f7d79', '#73716d', '#8b8985', '#696764'], CUT_STONE = ['#9d9b97', '#959390'];
function placeRock(g, shared, bed, {x, z, size, slab = false, ground, sink = .3, tones = STONE, seed}) {
  const random = seed === undefined ? shared : landRandom(seed);
  const tone = tones[Math.floor(random() * tones.length)];
  const mesh = slab
    ? add(g, slabGeometry(random), tone, x, 0, z)
    : add(g, boulderGeometry(random, .35 + random() * .35), tone, x, 0, z);
  const [w, h, d] = size;
  mesh.scale.set(w, h, d);
  mesh.rotation.order = 'YXZ';
  mesh.rotation.set(bed.dip * (.7 + random() * .6), bed.yaw + (random() - .5) * (slab ? .5 : 2.4), (random() - .5) * .12);
  mesh.position.y = ground(x, z) + h * (slab ? .5 - sink : .5 - sink);
  return mesh;
}
function tuft(g, random, x, y, z, scale = 1) {
  const tones = ['#6f8a45', '#7d9550', '#5f7a3f'];
  for (let i = 0; i < 3; i++) {
    const blade = add(g, new THREE.ConeGeometry(.07 * scale, (.28 + random() * .22) * scale, 4), tones[i], x + (random() - .5) * .2 * scale, y + .12 * scale, z + (random() - .5) * .2 * scale);
    blade.rotation.set((random() - .5) * .6, random() * 3, (random() - .5) * .6);
  }
}

// A stone outcrop: tilted beds, fallen boulders and a rubble skirt. As stone is
// taken, beds are cut back to squared benches and dressed blocks stack up.
export function createOutcrop(seed, fraction, ground = () => 0, landSeed = seed) {
  const g = new THREE.Group(), random = landRandom(seed), bed = bedding(landSeed), step = Math.ceil(Math.min(1, fraction) * DEPOSIT_STEPS) / DEPOSIT_STEPS;
  const strike = bed.yaw + Math.PI / 2 + (random() - .5) * .5;
  const along = [Math.sin(strike), Math.cos(strike)], across = [Math.sin(bed.yaw), Math.cos(bed.yaw)];
  // Decide every piece first so extraction only removes, never reshuffles.
  const pieces = [];
  for (let i = 0; i < 4; i++) {
    const t = (i - 1.5) * 1.15 + (random() - .5) * .5, off = (random() - .5) * 1.5;
    pieces.push({slab: true, x: along[0] * t + across[0] * off, z: (along[1] * t + across[1] * off) * .8,
      size: [2.1 + random() * 1.3, .75 + random() * .65 + (i % 2) * .25, 1.5 + random() * .9], until: [.6, 1, .8, .4][i], seed: Math.floor(random() * 1e9)});
  }
  for (let i = 0; i < 7; i++) {
    const a = random() * Math.PI * 2, r = 1.6 + random() * 1.5, s = .45 + random() * .5;
    pieces.push({x: Math.cos(a) * r * 1.15, z: Math.sin(a) * r * .8, size: [s * (1 + random() * .5), s * (.7 + random() * .4), s * (1 + random() * .4)], until: .2 + random() * .7, seed: Math.floor(random() * 1e9)});
  }
  const rubble = Array.from({length: 22}, (_, i) => {
    const a = random() * Math.PI * 2, r = 2.3 + random() * 1.9, s = .12 + random() * .22;
    return {x: Math.cos(a) * r * 1.2, z: Math.sin(a) * r * .85, size: [s * 1.3, s, s * 1.1], sink: .2, from: i < 10 ? 0 : (i - 9) / 13, seed: Math.floor(random() * 1e9)};
  });
  const tufts = Array.from({length: 9}, () => {
    const a = random() * Math.PI * 2, r = 1.9 + random() * 2.2;
    return [Math.cos(a) * r * 1.2, Math.sin(a) * r * .85, random()];
  });
  for (const piece of pieces) {
    if (step < piece.until) {placeRock(g, random, bed, {...piece, ground}); continue;}
    if (!piece.slab) continue;
    // The quarried bed leaves a low squared bench in fresher, paler stone.
    const [w, , d] = piece.size, y = ground(piece.x, piece.z);
    const bench = add(g, slabGeometry(landRandom(piece.seed ^ 0x9e37)), CUT_STONE[0], piece.x, y + .08, piece.z);
    bench.scale.set(w * .85, .32, d * .8);
    bench.rotation.y = bed.yaw + .1;
    if (step < 1) {
      const lift = add(g, new THREE.BoxGeometry(w * .45, .3, d * .5), CUT_STONE[1], piece.x - along[0] * w * .18, y + .36, piece.z - along[1] * w * .18);
      lift.rotation.y = bed.yaw + .1;
    }
  }
  for (const piece of rubble) if (step >= piece.from) placeRock(g, random, bed, {...piece, ground, tones: piece.from ? CUT_STONE : STONE});
  if (step > 0 && step < 1) {
    // Dressed blocks wait beside the face until they are carried away.
    const count = 2 + Math.round(step * 4), bx = -across[0] * 2.6, bz = -across[1] * 2.1;
    for (let i = 0; i < count; i++) {
      const row = i % 3, level = Math.floor(i / 3);
      const block = add(g, new THREE.BoxGeometry(.62, .36, .4), CUT_STONE[i % 2], bx + along[0] * (row - 1) * .7, ground(bx, bz) + .18 + level * .37, bz + along[1] * (row - 1) * .7);
      block.rotation.y = strike + Math.PI / 2 + (random() - .5) * .25;
    }
  }
  // Grass closes in on an abandoned quarry; a working one stays trampled.
  for (const [x, z, chance] of tufts) if (step === 0 || step === 1 || chance > .6) tuft(g, random, x, ground(x, z), z, .9 + chance * .5);
  return g;
}

// A low dome that hugs the ground: trodden floor, damp hollows.
function patchGeometry(random) {
  const geometry = roughen(new THREE.IcosahedronGeometry(1, 1), random, .14);
  const points = geometry.attributes.position;
  for (let i = 0; i < points.count; i++) points.setY(i, Math.max(0, points.getY(i)));
  geometry.computeVertexNormals();
  return geometry;
}
const CLAY = ['#a9643f', '#b5744a', '#9c5a3a'], TOPSOIL = '#5e4634', DAMP = '#84523a', SPOIL = '#c08f62';
// An earth deposit: a clay hummock that is dug into from one side. The cut
// bank shows dark topsoil over red clay and walks back as earth is taken.
export function createEarthCut(seed, fraction, ground = () => 0) {
  const g = new THREE.Group(), random = landRandom(seed), step = Math.ceil(Math.min(1, fraction) * DEPOSIT_STEPS) / DEPOSIT_STEPS;
  const side = random() < .5 ? -1 : 1, lean = (random() - .5) * .5;
  // Digging advances along `face`, from the front edge towards the back.
  const face = [Math.cos(lean) * side, Math.sin(lean)], wide = [-face[1], face[0]];
  const front = 3.3, cut = front - step * 6.2;
  const lumps = Array.from({length: 9}, () => {
    const a = random() * Math.PI * 2, r = Math.sqrt(random()) * 2.4;
    return {x: Math.cos(a) * r * 1.2, z: Math.sin(a) * r * .8, radius: .9 + random() * .9, height: .26 + random() * .34, seed: Math.floor(random() * 1e9), tone: Math.floor(random() * 3)};
  });
  const tufts = Array.from({length: 12}, () => {
    const a = random() * Math.PI * 2, r = Math.sqrt(random()) * 3.4;
    return [Math.cos(a) * r * 1.2, Math.sin(a) * r * .85, random()];
  });
  const depth = (x, z) => x * face[0] + z * face[1];
  for (const lump of lumps) {
    if (depth(lump.x, lump.z) + lump.radius * .4 > cut) continue;
    const local = landRandom(lump.seed);
    const geometry = roughen(new THREE.IcosahedronGeometry(1, 1), local, .16);
    const points = geometry.attributes.position;
    for (let i = 0; i < points.count; i++) points.setY(i, Math.max(0, points.getY(i)));
    geometry.computeVertexNormals();
    const mound = add(g, geometry, CLAY[lump.tone], lump.x, ground(lump.x, lump.z) - .05, lump.z);
    mound.scale.set(lump.radius, lump.height, lump.radius * .85);
    mound.rotation.y = local() * Math.PI;
  }
  if (step > 0) {
    const centre = (front + cut) / 2, length = front - cut;
    // The worked floor: bare, slightly darker where it stays damp.
    const patches = Math.round(4 + length * 2);
    for (let i = 0; i < patches; i++) {
      const along = cut + .5 + random() * Math.max(.2, length - .9), aside = (random() - .5) * 4.6;
      const x = face[0] * along + wide[0] * aside, z = (face[1] * along + wide[1] * aside) * .9;
      const patch = add(g, patchGeometry(random), i % 3 ? DAMP : CLAY[2], x, ground(x, z) - .01, z);
      patch.scale.set(.8 + random() * .7, .07 + random() * .05, .7 + random() * .6);
      patch.rotation.y = random() * 3;
    }
    if (step < 1) {
      // The cut bank, in short spade-width sections that no longer line up.
      for (let i = -3; i <= 3; i++) {
        const bow = Math.abs(i) * Math.abs(i) * .09, back = cut - .25 + bow + (random() - .5) * .2;
        const x = face[0] * back + wide[0] * i * .72, z = (face[1] * back + wide[1] * i * .72) * .92;
        const height = (.5 + step * .5) * (1 - Math.abs(i) * .09) + random() * .12, y = ground(x, z);
        const yaw = Math.atan2(face[0], face[1]) + i * -.1 * side + (random() - .5) * .12;
        const wall = add(g, new THREE.BoxGeometry(.8, height, .5), CLAY[(i + 3) % 3], x, y + height / 2 - .05, z);
        wall.rotation.y = yaw;
        const soil = add(g, new THREE.BoxGeometry(.84, .13, .56), TOPSOIL, x, y + height + .01, z);
        soil.rotation.y = yaw;
        if (random() < .7) tuft(g, random, x - face[0] * .2, y + height + .05, z - face[1] * .2, .8);
      }
      // Loose spoil thrown clear of the face, and the barrow plank.
      for (let i = 0; i < 2 + Math.round(step * 3); i++) {
        const x = face[0] * (front - .3 - random() * .6) + wide[0] * (2.2 + random() * .9) * (i % 2 ? 1 : -1), z = face[1] * front * .6 + wide[1] * (1.8 + random() * .6) * (i % 2 ? 1 : -1);
        const heap = add(g, roughen(new THREE.ConeGeometry(.5 + random() * .3, .4 + random() * .25, 6), random, .12), SPOIL, x, ground(x, z) + .18, z);
        heap.rotation.y = random() * 3;
      }
      const px = face[0] * (centre + .2), pz = face[1] * (centre + .2);
      const plank = add(g, new THREE.BoxGeometry(2.2, .05, .26), '#b4834e', px, ground(px, pz) + .09, pz);
      plank.rotation.y = Math.atan2(face[0], face[1]) + Math.PI / 2 + .12;
    } else {
      // Exhausted: a shallow hollow with a low rim, left to grass over.
      for (let i = 0; i < 4; i++) {
        const x = (random() - .5) * 2.6, z = (random() - .5) * 1.6;
        const hollow = add(g, patchGeometry(random), '#6d4a38', x, ground(x, z), z);
        hollow.scale.set(.9 + random() * .6, .06, .7 + random() * .5);
      }
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2 + random() * .4, x = Math.cos(a) * 3.5, z = Math.sin(a) * 2.5;
        const rim = add(g, roughen(new THREE.ConeGeometry(.55 + random() * .3, .22 + random() * .12, 6), random, .14), CLAY[i % 3], x, ground(x, z) + .08, z);
        rim.rotation.y = random() * 3;
      }
    }
  }
  for (const [x, z, chance] of tufts) {
    const dug = depth(x, z) > cut;
    if (dug ? step === 1 && chance > .45 : chance > .35) tuft(g, random, x, ground(x, z) + (dug ? 0 : .12), z, .8 + chance * .5);
  }
  return g;
}

const TRUNK = {jequitiba: .4, pau_brasil: .26, jucara: .13, embauba: .15, pequi: .28, barbatimao: .24, umbuzeiro: .3, jurema: .2};
const BARK = {pau_brasil: '#8c5a47', jucara: '#99946f', embauba: '#6f8e6b', jurema: '#62503f'};
// What a felled tree leaves: the stump, and for a few days sawdust and brash.
export function createStump(species, seed, fresh) {
  const g = new THREE.Group(), random = landRandom(seed), r = (TRUNK[species] || .26) * (.9 + random() * .25), h = .28 + random() * .22;
  const bark = BARK[species] || '#80603f';
  add(g, new THREE.CylinderGeometry(r * .92, r * 1.2, h, 8), bark, 0, h / 2, 0).rotation.y = random() * 3;
  const top = add(g, new THREE.CylinderGeometry(r * .86, r * .9, .04, 8), fresh ? '#dcbb82' : '#a08a69', 0, h + .01, 0);
  top.rotation.set((random() - .5) * .2, 0, (random() - .5) * .2);
  if (r > .22) for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + random() * .8;
    const root = add(g, new THREE.CylinderGeometry(r * .15, r * .38, r * 1.3, 5), bark, Math.cos(a) * r * 1.05, .07, Math.sin(a) * r * 1.05);
    root.rotation.set(Math.sin(a) * -1.15, 0, Math.cos(a) * 1.15);
  }
  if (fresh) {
    const dust = add(g, roughen(new THREE.CylinderGeometry(1, 1, .025, 8), random, .2), '#d9c59a', random() - .5, .02, random() - .5);
    dust.scale.set(.9 + random() * .5, 1, .7 + random() * .4);
    for (let i = 0; i < 4; i++) {
      const a = random() * Math.PI * 2, d = 1.1 + random() * 1.1, len = .9 + random() * 1.1;
      const branch = add(g, new THREE.CylinderGeometry(.035, .06, len, 5), bark, Math.cos(a) * d, .07, Math.sin(a) * d);
      branch.rotation.set(Math.PI / 2, 0, random() * Math.PI);
      const leaves = add(g, new THREE.IcosahedronGeometry(.3, 0), i % 2 ? '#6c8742' : '#7b9149', Math.cos(a) * d + Math.sin(branch.rotation.z) * len * -.4, .14, Math.sin(a) * d + Math.cos(branch.rotation.z) * len * .1);
      leaves.scale.set(1.3, .35, 1);
      leaves.rotation.y = random() * 3;
    }
  } else if (random() < .7) {
    const moss = add(g, new THREE.IcosahedronGeometry(r * .55, 0), '#6f8748', Math.cos(seed) * r * .7, h * .7, Math.sin(seed) * r * .7);
    moss.scale.set(1, .45, 1);
  }
  return g;
}
// A dead tree left standing, and one that has come down.
export function createSnag(seed) {
  const g = new THREE.Group(), random = landRandom(seed), h = 2.8 + random() * 2.2, tone = '#857664';
  const limb = (from, to, base, tip) => {
    const start = new THREE.Vector3(...from), v = new THREE.Vector3(...to).sub(start);
    const m = add(g, new THREE.CylinderGeometry(tip, base, v.length(), 6), tone, 0, 0, 0);
    m.position.copy(start).addScaledVector(v, .5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize());
  };
  limb([0, 0, 0], [.15, h * .55, .05], .24, .17);
  limb([.15, h * .55, .05], [.05, h, -.05], .17, .07);
  for (let i = 0; i < 3; i++) {
    const a = random() * Math.PI * 2, y = h * (.5 + i * .14), len = .7 + random() * .9;
    limb([.1, y, 0], [.1 + Math.cos(a) * len, y + len * .55, Math.sin(a) * len], .08, .03);
  }
  return g;
}
export function createFallenLog(seed) {
  const g = new THREE.Group(), random = landRandom(seed), len = 2.4 + random() * 2, r = .16 + random() * .12;
  const log = add(g, new THREE.CylinderGeometry(r * .8, r, len, 7), '#7c6650', 0, r * .85, 0);
  log.rotation.z = Math.PI / 2;
  for (let i = 0; i < 3; i++) {
    const moss = add(g, new THREE.IcosahedronGeometry(r * 1.1, 0), i % 2 ? '#6f8748' : '#7f9552', (random() - .5) * len * .8, r * 1.5, (random() - .5) * .1);
    moss.scale.set(1.5, .35, .9);
  }
  return g;
}
export function createFieldStone(seed, landSeed, size) {
  const g = new THREE.Group(), random = landRandom(seed);
  placeRock(g, random, bedding(landSeed), {x: 0, z: 0, size: [size * (1 + random() * .5), size * (.6 + random() * .3), size * (1 + random() * .3)], ground: () => 0, sink: .25});
  return g;
}

const isTree = (p, defs) => defs[p.key]?.kind === 'wild-tree';
const groves = new WeakMap();
function treeIndex(s, defs) {
  // Felled trees still count: the survivors grew up beside them.
  const count = s.projects.length;
  let index = groves.get(s);
  if (!index || index.count !== count) {
    index = {count, trees: s.projects.filter(p => isTree(p, defs)), looks: new Map()};
    groves.set(s, index);
  }
  return index;
}
// Stable per-tree placement: turned, nudged off the grid, sized by its place
// in the grove and leaning out towards the light at the grove edge.
export function treeLook(s, defs, p) {
  const index = treeIndex(s, defs);
  if (index.looks.has(p.id)) return index.looks.get(p.id);
  const random = landRandom(cellSeed(s.landSeed, p.x, p.z, 0x2f6e2b1));
  let near = 0, cx = 0, cz = 0;
  for (const other of index.trees) {
    if (other === p) continue;
    const dx = other.x - p.x, dz = other.z - p.z, d = Math.hypot(dx, dz);
    if (d > 3.2) continue;
    near++; cx += dx / (d + .5); cz += dz / (d + .5);
  }
  const shelter = Math.min(1, near / 9), away = Math.hypot(cx, cz);
  // Old trees stand in the heart of a grove; the young and lanky at its edge.
  const size = .74 + shelter * .4 + (random() - .5) * .26, crown = random() * Math.PI * 2, bend = random() * Math.PI * 2;
  const outward = away > .2 ? (1 - shelter) * .07 : 0, wander = .02 + random() * .07;
  const look = {
    shelter,
    dx: (random() - .5) * 1.6, dz: (random() - .5) * 1.6,
    yaw: random() * Math.PI * 2,
    width: size * (.8 + shelter * .16 + random() * .2), height: size * (.95 + random() * .16),
    // Trunk and crown shape, as fractions of the tree's height.
    twist: (random() - .5) * 2.2,
    crook: [(random() - .5) * .09, (random() - .5) * .09],
    bend: [Math.cos(bend) * wander - (away > .2 ? cx / away : 0) * outward, Math.sin(bend) * wander - (away > .2 ? cz / away : 0) * outward],
    crownAxis: [Math.cos(crown), Math.sin(crown)], crownLong: 1 + random() * .45, crownShort: .72 + random() * .3,
    crownLift: .86 + random() * .3,
    // Unit direction out of the grove, and how far the tree leans that way.
    out: away > .2 ? [-cx / away, -cz / away] : [0, 0],
    lean: away > .2 ? (1 - shelter) * (.03 + random() * .06) : random() * .02,
  };
  index.looks.set(p.id, look);
  return look;
}
const UP = new THREE.Vector3(0, 1, 0), axis = new THREE.Vector3(), tilt = new THREE.Quaternion();
export function applyTreeLook(root, look, height) {
  root.position.x += look.dx; root.position.z += look.dz; root.position.y = height(root.position.x, root.position.z);
  root.scale.set(look.width, look.height, look.width);
  root.quaternion.setFromAxisAngle(UP, look.yaw);
  if (look.lean) root.quaternion.premultiply(tilt.setFromAxisAngle(axis.set(look.out[1], 0, -look.out[0]), look.lean));
}
// Reshapes one tree's own geometry so no two share a trunk line or crown
// outline: the trunk crooks and bends, the crown turns, stretches and lifts.
export function shapeTree(root, look) {
  root.updateMatrixWorld(true);
  let top = 0;
  root.traverse(o => { if (o.isMesh) { o.geometry.computeBoundingBox(); top = Math.max(top, o.geometry.boundingBox.max.y); } });
  if (top < 1) return;
  // Bends are authored in world directions; undo the tree's own turn.
  const c = Math.cos(look.yaw), s = Math.sin(look.yaw), local = ([x, z]) => [x * c - z * s, x * s + z * c];
  const bend = local(look.bend), crook = local(look.crook), axis = look.crownAxis;
  root.traverse(o => {
    if (!o.isMesh) return;
    const points = o.geometry.attributes.position;
    for (let i = 0; i < points.count; i++) {
      let x = points.getX(i), y = points.getY(i), z = points.getZ(i);
      const t = Math.max(0, y / top), high = Math.min(1, Math.max(0, (t - .3) / .3)), crownness = high * high * (3 - 2 * high);
      const turn = look.twist * crownness, ct = Math.cos(turn), st = Math.sin(turn);
      [x, z] = [x * ct - z * st, x * st + z * ct];
      const along = x * axis[0] + z * axis[1], across = -x * axis[1] + z * axis[0];
      const a = along * (1 + (look.crownLong - 1) * crownness), b = across * (1 + (look.crownShort - 1) * crownness);
      x = a * axis[0] - b * axis[1]; z = a * axis[1] + b * axis[0];
      y += (y - top * .45) * (look.crownLift - 1) * crownness;
      const sway = Math.sin(Math.min(1, t) * Math.PI);
      points.setXYZ(i, x + (bend[0] * t * t + crook[0] * sway) * top, y, z + (bend[1] * t * t + crook[1] * sway) * top);
    }
    points.needsUpdate = true;
    o.geometry.computeBoundingBox();
    o.geometry.computeBoundingSphere();
    o.geometry.boundingSphere.radius += .2;
  });
}
export const depositStep = (seed, p, recipe) => {
  const capacity = depositCapacity(seed, p, recipe);
  return capacity ? Math.ceil(Math.min(1, (p.extracted || 0) / capacity) * DEPOSIT_STEPS) : 0;
};
export const depositModel = (kind, seed, p, step, ground) =>
  (kind === 'stone' ? createOutcrop : createEarthCut)(cellSeed(seed, p.x, p.z, kind === 'stone' ? 0x51ab : 0x7c33), step / DEPOSIT_STEPS, ground, seed);
export const stumpIsFresh = (s, p) => p.felledAt !== undefined && s.time - p.felledAt < FRESH_STUMP;
export const stumpModel = (s, p, species) => createStump(species, cellSeed(s.landSeed, p.x, p.z, 0x57a9), stumpIsFresh(s, p));

const GROUND_PLANTS = {
  'mata-atlantica': ['forest-fern-patch-1', 'forest-fern-patch-2', 'bromeliad-patch-1', 'bromeliad-patch-2'],
  cerrado: ['bunchgrass', 'bunchgrass-patch-1', 'bunchgrass-patch-2', 'campo'],
  caatinga: ['macambira', 'macambira-patch-1', 'bunchgrass-patch-2', 'mandacaru'],
};
// Low growth gathers where it would: under and around groves, saplings on the
// sunny edge, deadwood inside, loose stone downhill of each outcrop.
// Returns [{x, z, rotation, scale, asset} | {..., build}] in cell coordinates.
export function natureScatter(s, defs, biome, hasAsset) {
  const random = landRandom(s.landSeed ^ 0x3c6ef372), items = [];
  const plants = (GROUND_PLANTS[biome] || []).filter(hasAsset);
  const open = (x, z) => x > CELL_MIN + 2 && z > CELL_MIN + 2 && x < CELL_MAX - 2 && z < CELL_MAX - 2 &&
    Math.hypot(x - s.stock.x, z - s.stock.z) > 8 && !riverBankAt(Math.round(x), Math.round(z), 1, s.landSeed) && !accessRoadAt(Math.round(x), Math.round(z), 2);
  const put = (x, z, item) => { if (open(x, z)) items.push({x, z, rotation: random() * Math.PI * 2, scale: 1, ...item}); };
  for (const p of s.projects) {
    if (isTree(p, defs)) {
      const look = treeLook(s, defs, p), species = defs[p.key].asset;
      const count = plants.length ? Math.floor(random() * 2.4 * (.4 + look.shelter)) : 0;
      for (let i = 0; i < count; i++) {
        const a = random() * Math.PI * 2, d = .6 + random() * 1.6;
        put(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, {asset: plants[Math.floor(random() * plants.length)], scale: .8 + random() * .5});
      }
      // Young growth seeds itself outwards from the grove edge.
      if (look.shelter < .5 && random() < .7) {
        const a = Math.atan2(look.out[1], look.out[0]) + (random() - .5) * 1.6, d = 1.3 + random() * 1.4;
        const young = `${species}-young-${random() < .45 ? 1 : 0}`;
        if (hasAsset(young)) put(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, {asset: young, scale: .85 + random() * .5});
      }
      // Understory: the next generation coming up between the old trees.
      if (look.shelter >= .5 && random() < .45) {
        const a = random() * Math.PI * 2, young = `${species}-young-${random() < .7 ? 1 : 0}`;
        if (hasAsset(young)) put(p.x + Math.cos(a) * .9, p.z + Math.sin(a) * .9, {asset: young, scale: .8 + random() * .6});
      }
      if (look.shelter > .45 && random() < .07) {
        const a = random() * Math.PI * 2, seed = Math.floor(random() * 1e9), fallen = random() < .55;
        put(p.x + Math.cos(a) * 1.4, p.z + Math.sin(a) * 1.4, {build: () => fallen ? createFallenLog(seed) : createSnag(seed)});
      }
    } else if (p.natural && p.key === 'supply-3') {
      const [w, d] = defs[p.key].size, cx = p.x + (w - 1) / 2, cz = p.z + (d - 1) / 2;
      // Loose stone trails away on one side, largest nearest the outcrop.
      const trail = random() * Math.PI * 2;
      for (let i = 0; i < 9; i++) {
        const a = trail + (random() - .5) * (i < 6 ? 1.5 : 6), r = 2.6 + random() * random() * 5.5, seed = Math.floor(random() * 1e9), size = (.14 + random() * .6) * (1 - r / 11);
        put(cx + Math.cos(a) * r, cz + Math.sin(a) * r * .8, {build: () => createFieldStone(seed, s.landSeed, size)});
      }
    }
  }
  // A thin scatter in the open so meadows are not bare.
  for (let i = 0; i < 40 && plants.length; i++)
    put(CELL_MIN + 4 + random() * (CELL_MAX - CELL_MIN - 8), CELL_MIN + 4 + random() * (CELL_MAX - CELL_MIN - 8), {asset: plants[Math.floor(random() * plants.length)]});
  return items;
}

// Unsaved fixture: every deposit stage side by side, and a part-felled grove.
export function prepareNaturePreview(s, defs, recipes) {
  const W = 23, D = 10;
  const clear = (x, z) => {
    if (x < CELL_MIN + 4 || z < CELL_MIN + 4 || x + W > CELL_MAX - 4 || z + D > CELL_MAX - 4) return false;
    for (let dx = -1; dx <= W; dx += 2) for (let dz = -1; dz <= D; dz += 2)
      if (riverBankAt(x + dx, z + dz, 2, s.landSeed) || accessRoadAt(x + dx, z + dz, 3) || Math.hypot(x + dx - s.stock.x, z + dz - s.stock.z) < 7) return false;
    return true;
  };
  let site = null;
  for (let r = 8; r < 50 && !site; r += 3) for (let a = 0; a < 16 && !site; a++) {
    const x = Math.round(s.stock.x + Math.cos(a / 16 * Math.PI * 2) * r - W / 2), z = Math.round(s.stock.z + Math.sin(a / 16 * Math.PI * 2) * r - D / 2);
    if (clear(x, z)) site = {x, z};
  }
  site ||= {x: 40, z: 40};
  s.projects = s.projects.filter(p => !(p.natural && p.x >= site.x - 2 && p.x < site.x + W + 2 && p.z >= site.z - 2 && p.z < site.z + D + 2));
  for (const [row, key, recipe] of [[0, 'supply-3', recipes.stone], [1, 'supply-2', recipes.earth]]) [0, .3, .65, 1].forEach((fraction, i) => {
    const p = {id: s.nextId++, key, x: site.x + i * 6, z: site.z + row * 6, work: defs[key].work, delivered: 0, natural: true};
    p.extracted = Math.round(depositCapacity(s.landSeed, p, recipe) * fraction);
    s.projects.push(p);
  });
  // Fell half of the densest grove away from the fixture: some today, some long ago.
  const trees = s.projects.filter(p => isTree(p, defs));
  let grove = null, best = -1;
  for (const p of trees) {
    if (Math.abs(p.x - site.x - W / 2) < W && Math.abs(p.z - site.z - D / 2) < D) continue;
    // The nearest well-grown grove; failing that, the densest one.
    const count = trees.filter(o => Math.hypot(o.x - p.x, o.z - p.z) < 5).length;
    const score = count >= 8 ? 1000 - Math.hypot(p.x - s.stock.x, p.z - s.stock.z) : count;
    if (score > best) { best = score; grove = p; }
  }
  if (grove) trees.filter(o => Math.hypot(o.x - grove.x, o.z - grove.z) < 5).forEach((p, i) => {
    // Clear one side of the grove, as a work party would.
    if (p.x + p.z * .4 < grove.x + grove.z * .4) return;
    p.felled = true;
    p.felledAt = i % 4 ? s.time : s.time - FRESH_STUMP * 3;
  });
  s.log = [`Nature preview · ${natureLook ? 'current look' : 'plain catalog models'}. Top row: stone untouched to exhausted. Bottom row: earth. This scene is not saved.`];
  return {deposits: {x: site.x + W / 2, z: site.z + D / 2}, grove: grove || site};
}
