import assert from 'node:assert/strict';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { catalog } from '../web/artwork/catalog.js';
import { buildingArt, cameraCalibration, drawBuildingArt, nightAmount } from '../web/building-art.js';
const art = new URL('../web/art/', import.meta.url);
const files = readdirSync(art, { recursive: true }).filter(file => /\.(png|svg)$/.test(file));
assert.equal(new Set(catalog.map(sprite => sprite.id)).size, catalog.length, 'Sprite IDs must be unique');
const fingerprints = new Set();
for (const file of files) {
  const hash = createHash('sha256').update(readFileSync(new URL(file, art))).digest('hex');
  assert(!fingerprints.has(hash), `Duplicate artwork file: ${file}`);
  fingerprints.add(hash);
}
const crops = catalog.filter(sprite => sprite.file).map(sprite => `${sprite.file}:${sprite.cell.join(',')}`);
assert.equal(new Set(crops).size, crops.length, 'Source crops must not be listed twice');
for (const file of files) assert(catalog.some(sprite => sprite.file === `../art/${file}`), `Uncatalogued artwork: ${file}`);
for (const sprite of catalog) {
  if (sprite.procedural) continue;
  assert(existsSync(new URL(`../web/artwork/${sprite.file}`, import.meta.url)), `Missing artwork: ${sprite.file}`);
  const [x, y, w, h] = sprite.cell;
  assert(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 1 && y + h <= 1, `Invalid crop: ${sprite.id}`);
}
for (const sprite of Object.values(buildingArt)) {
  const entry = catalog.find(item => item.name === sprite.name && item.building);
  assert(entry, `Missing building: ${sprite.name}`);
  assert.equal(entry.width, sprite.width, `Studio scale drift: ${sprite.name}`);
  assert.equal(entry.anchor, sprite.anchor, `Studio anchor drift: ${sprite.name}`);
  const night = catalog.find(item => item.name === `${sprite.name} · night`);
  assert(night, `Missing night variant: ${sprite.name}`);
  assert.equal(night.file, `../art/${sprite.nightFile}`);
  for (const key of ['width', 'anchor', 'cell', 'axes']) assert.deepEqual(night[key], entry[key], `Night geometry drift: ${sprite.name}/${key}`);
  const bytes = readFileSync(new URL(sprite.nightFile, art));
  assert.equal(bytes.readUInt32BE(16), bytes.readUInt32BE(20), 'Night sprite canvas must stay square');
  assert.equal(bytes[25], 6, 'Night sprites need RGBA transparency');
  const { vertical, shear } = cameraCalibration(sprite);
  if (sprite.axes) {
    for (const [i, direction] of sprite.axes.entries()) {
      assert(Math.abs(vertical * direction + shear - (i ? -.5 : .5)) < 1e-10,
        `Ground axes must project at 2:1: ${sprite.name}`);
    }
  }
}
assert(buildingArt.compost.width < buildingArt.home.width * .5, 'Compost must remain smaller than half a home cell');
assert(buildingArt.coop.width < buildingArt.home.width * .65, 'Coop must remain smaller than a home');
// Exercise the actual drawing path with an atlas crop, scale, and transparency.
const calls = [];
const ctx = { globalAlpha: .8, save() {}, restore() {},
  translate(...args) { calls.push(['translate', ...args]); },
  transform(...args) { calls.push(['transform', ...args]); },
  drawImage(...args) { calls.push(['drawImage', ...args.slice(1)]); } };
drawBuildingArt(ctx, { complete: true, naturalWidth: 1280, naturalHeight: 1280 }, buildingArt.kitchen, 10, 20, 2, .5);
assert.deepEqual(calls[0], ['translate', 10, 20]);
assert.deepEqual(calls[2].slice(0, 5), ['drawImage', 640, 0, 640, 640]);
assert.equal(calls[2][7], buildingArt.kitchen.width * 2);
assert.equal(ctx.globalAlpha, .4);
console.log(`Artwork coverage: ${files.length} source files, ${catalog.length} sprite entries.`);

assert.equal(nightAmount(12 * 60), 0);
assert.equal(nightAmount(0), 1);
assert.equal(nightAmount(21 * 60), 1);
assert.equal(nightAmount(1440), nightAmount(0));
assert(nightAmount(18 * 60) > 0 && nightAmount(18 * 60) < 1);
assert(Math.abs(nightAmount(18 * 60 - .001) - nightAmount(18 * 60 + .001)) < .001);
console.log('PASS: nine night variants, shared geometry, alpha, and continuous day/night timing');
