import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root='assets/scenario-reviews/modular-examples-v1';
const review=JSON.parse(await readFile(`${root}/review.json`));
for(const [path,hash]of Object.entries(review.files))assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'),hash,`${path}: retained evidence changed`);
const noncosmetics=d=>{const v=structuredClone(d);delete v.id;delete v.map.id;for(const resident of v.start.residents)delete resident.appearance;return v;};
for(const id of ['before-the-dry-season','an-inherited-village']){
 const before=JSON.parse(await readFile(`${root}/authoring/${id}-before.solar-scenario`)),after=JSON.parse(await readFile(`web/examples/${id}.solar-scenario`));
 assert.deepEqual(noncosmetics(after),noncosmetics(before),`${id}: appearance editing changed noncosmetic scenario data`);
 assert.deepEqual(after.start.residents.map(r=>r.id),before.start.residents.map(r=>r.id));
 for(const r of after.start.residents.filter(r=>id==='before-the-dry-season'||['Sueli','Otávio'].includes(r.name)))assert.equal(r.appearance.schema,2);
}
for(const slug of ['marina','davi','cecilia']){
 const preset=JSON.parse(await readFile(`web/examples/residents/${slug}.solar-resident`)),scenario=JSON.parse(await readFile('web/examples/before-the-dry-season.solar-scenario'));
 assert.deepEqual(preset.resident.appearance,scenario.start.residents.find(r=>r.name===preset.resident.name).appearance);assert.equal(preset.resident.id,undefined);
}
assert.equal(review.authoringReview.inspected.length,7);assert.equal(review.gameReview.inspected.length,6);
console.log('PASS: exact retained source/report/capture hashes, preserved noncosmetic scenario definitions and resident identities, and matching reusable modular preset appearances. Visual verdicts are retained human inspection, not inferred from hashes.');
