import assert from 'node:assert/strict';
import { readdirSync, existsSync } from 'node:fs';
import { catalog } from '../web/artwork/catalog.js';
const art = new URL('../web/art/', import.meta.url);
const files = readdirSync(art, { recursive: true }).filter(file => /\.(png|svg)$/.test(file));
assert.equal(new Set(catalog.map(sprite => sprite.id)).size, catalog.length, 'Sprite IDs must be unique');
for (const file of files) assert(catalog.some(sprite => sprite.file === `../art/${file}`), `Uncatalogued artwork: ${file}`);
for (const sprite of catalog) {
  if (sprite.procedural) continue;
  assert(existsSync(new URL(`../web/artwork/${sprite.file}`, import.meta.url)), `Missing artwork: ${sprite.file}`);
  const [x, y, w, h] = sprite.cell;
  assert(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 1 && y + h <= 1, `Invalid crop: ${sprite.id}`);
}
console.log(`Artwork coverage: ${files.length} source files, ${catalog.length} sprite entries.`);
