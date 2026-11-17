import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FUNCTIONAL_PROGRAM} from '../web/v02/library/functional-program.js';
import {BUILDING_MODELS} from '../web/v02/weekend/building-models.js';
const brief=JSON.parse(readFileSync(new URL('../.github/building-program/catalog.json',import.meta.url)));
assert.equal(brief.units.metresPerCell,2);
assert.equal(new Set(brief.entries.map(e=>e.id)).size,brief.entries.length);
const planned=new Set(brief.entries.map(e=>e.id));
for(const model of BUILDING_MODELS)assert(planned.has(model.id)||FUNCTIONAL_PROGRAM[model.id],`${model.id} has a size decision in the original brief or subsequent live program`);
for(const e of brief.entries){
 assert(e.targetSiteCells.every(n=>Number.isInteger(n)&&n>0));
 assert.equal(e.targetReservedAreaM2,e.targetSiteCells[0]*e.targetSiteCells[1]*4);
 if(e.targetShellMetres){
  assert(e.targetShellMetres.every((n,i)=>n<=e.targetSiteCells[i]*2),`${e.id}: shell fits site`);
  if(e.targetUsableAreaM2)assert(e.targetUsableAreaM2<e.targetShellMetres[0]*e.targetShellMetres[1],`${e.id}: usable area excludes walls`);
 }
 if(e.usableAreaBudgetM2)assert.equal(Object.values(e.usableAreaBudgetM2).reduce((a,b)=>a+b,0),e.targetUsableAreaM2,`${e.id}: room budgets account for usable area`);
 assert.equal(e.status,'design_target_not_live_gameplay');
}
console.log(`PASS ${brief.entries.length} catalog decisions, unique IDs, shell/site bounds, area accounting and explicit design-only status`);
