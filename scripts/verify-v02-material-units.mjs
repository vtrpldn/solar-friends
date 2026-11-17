import assert from 'node:assert/strict';
import {MATERIALS,PROJECTS,PROCESSES} from '../web/v02/weekend/simulation.js';
import {MATERIAL_UNITS,materialMeasure,materialMass} from '../web/v02/weekend/material-measures.js';
assert.deepEqual(Object.keys(MATERIAL_UNITS).sort(),Object.keys(MATERIALS).sort());
for(const id of Object.keys(MATERIALS)){
 const u=materialMeasure(id);assert(u.kg>0&&u.m3>0,id);
}
for(const d of Object.values(PROJECTS))assert(Number.isFinite(materialMass(d.materials)));
for(const r of Object.values(PROCESSES)){
 assert(Number.isFinite(materialMass(r.input)));assert(Number.isFinite(materialMass(r.output)));
}
assert.equal(materialMass({eggs:12}),.72,'a dozen eggs is not twelve kilograms');
assert.throws(()=>materialMeasure('unregistered-material'),/Missing material/);
console.log('PASS explicit units cover every catalog/recipe resource; egg mass and unknown-unit guard');
const {physicalUnit,physicalQuantity,stockQuantity,quantityText}=await import('../web/v02/weekend/material-measures.js');
for(const id of Object.keys(MATERIALS))for(const n of [0,1,12,73])assert.equal(stockQuantity(id,physicalQuantity(id,n).amount),n);
assert.deepEqual(physicalQuantity('stone',12),{amount:240,unit:'kg'});assert.equal(quantityText('wood',12),'48 kg');assert.equal(physicalUnit('milk').unit,'L');assert.equal(physicalUnit('panels').factor,1);
console.log('PASS canonical mass/volume/count boundary round-trips every resource without changing paid pack quantities');
