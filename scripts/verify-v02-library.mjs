import assert from "node:assert/strict";
import * as THREE from "three";
import { catalog } from "../web/artwork/catalog.js";
import {
  ASSETS,
  createAsset,
  compactModel,
} from "../web/v02/library/catalog.js";
import {
  gallery,
  createEditor,
  validate,
  encode,
  decode,
} from "../web/v02/land/editor.js";
const mapping = new Set(ASSETS.flatMap((a) => a.legacy));
// Reclaimed parts were intentionally retired from v2; v1 remains archived.
for (const a of catalog.filter((a) => a.usage === "Active" && a.id !== "economy-4"))
  assert(mapping.has(a.id), `Missing v0.1 asset ${a.id}`);
assert.equal(new Set(ASSETS.map((a) => a.id)).size, ASSETS.length);
let draws = 0;
for (const a of ASSETS) {
  const model = createAsset(a.id),
    before = new THREE.Box3().setFromObject(model, true);
  assert(!before.isEmpty(), a.id);
  assert(before.min.y >= -0.04, `${a.id} below ground ${before.min.y}`);
  const merged = compactModel(model),
    after = new THREE.Box3().setFromObject(merged, true);
  assert(before.min.distanceTo(after.min) < 0.00001, a.id);
  assert(before.max.distanceTo(after.max) < 0.00001, a.id);
  merged.traverse((o) => {
    if (o.isMesh) {
      draws++;
      for (const n of o.geometry.attributes.position.array)
        assert(Number.isFinite(n), a.id);
    }
  });
}
const all = gallery();
assert.equal(validate(all).length, ASSETS.length);
const editor = createEditor();
const original = encode(editor.records);
const r = editor.records.find((r) => r.asset === "shed");
editor.update(r.id, { rotation: 90, column: 60, row: 60 });
assert.equal(editor.records.find((x) => x.id === r.id).rotation, 90);
assert.throws(() => editor.update(r.id, { column: 64 }));
assert.equal(editor.records.find((x) => x.id === r.id).column, 60);
editor.add({ ...r, id: "copy", column: 0, row: 0 });
editor.remove(r.id);
assert(!editor.records.some((x) => x.id === r.id));
editor.undo();
assert(editor.records.some((x) => x.id === r.id));
editor.redo();
editor.undo();
editor.undo();
editor.undo();
assert.equal(encode(editor.records), original);
editor.redo();
editor.update(r.id, { rotation: 180 });
assert(!editor.canRedo);
assert.deepEqual(decode(encode(editor.records)), editor.records);
assert.throws(() => decode('{"format":"other","version":1,"props":[]}'));
assert.throws(() => validate([r, r]));
assert.throws(() => validate([{ ...r, column: NaN }]));
assert.throws(() => validate([{ ...r, rotation: 45 }]));
assert.throws(() => validate([{ ...r, asset: "missing" }]));
console.log(
  `${ASSETS.length} 3D assets cover all ${mapping.size} active v0.1 catalog entries; ${draws} material batches. Bounds, compaction, scene validation and edit history pass.`,
);
