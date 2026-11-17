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
