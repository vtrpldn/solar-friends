import assert from 'node:assert/strict';
import {PROJECTS,createWeekend,chooseCamp,requiredLoads,save,restore} from '../web/v02/weekend/simulation.js';
import {migrateConstructionLabor,constructionSpecText} from '../web/v02/weekend/construction-specs.js';
for(const [key,d]of Object.entries(PROJECTS)){
 if(!d.construction)continue;
 const combined={};for(const p of d.construction.phases)for(const [id,q]of Object.entries(p.materials))combined[id]=(combined[id]||0)+q;
 assert.deepEqual(combined,d.materials,`${key}: every material allocated exactly once`);
 assert.equal(d.work,d.construction.hours*60/.45);
 assert(constructionSpecText(d).includes('regional calibration pending'));
 const old=d.construction.legacyWork;
 const state={projects:[{key,work:old},{key,work:old*.37},{key,work:0}]};
 assert(migrateConstructionLabor(state,PROJECTS));
 assert.equal(state.projects[0].work,d.work);
 assert(Math.abs(state.projects[1].work/d.work-.37)<1e-12);
 assert.equal(state.projects[2].work,0);
 const snapshot=JSON.stringify(state);assert(migrateConstructionLabor(state,PROJECTS));assert.equal(JSON.stringify(state),snapshot);
 assert(!migrateConstructionLabor({projects:[{key,work:old+1}]},PROJECTS),'reject corrupt old progress, do not clamp');
}
assert(PROJECTS['home-shared'].work>PROJECTS['adobe-gable'].work);
assert(PROJECTS['home-family'].work>PROJECTS.house.work);
assert.equal(PROJECTS.shelter.work,1067,'keep first-camp recipe pacing');
// Labor migration preserves a save using the current physical catalog. The
// archived miniature-building replay predates the explicitly replaced catalog.
const old=createWeekend(42);chooseCamp(old,'entrance');
old.projects.push({id:old.nextId++,key:'house',x:50,z:50,work:PROJECTS.house.construction.legacyWork,delivered:requiredLoads('house')});
delete old.constructionLaborVersion;
const cash=old.money,inventory=structuredClone(old.materials),delivered=old.projects.map(p=>p.delivered);
const loaded=restore(save(old));assert(loaded,'labor migration accepts a valid current-catalog layout');
assert.equal(loaded.money,cash);assert.deepEqual(loaded.materials,inventory);assert.deepEqual(loaded.projects.map(p=>p.delivered),delivered);
assert.equal(loaded.projects[0].work,PROJECTS.house.work,'completed house stays complete');
assert(restore(save(loaded)),'converted save round trips');
const fresh=createWeekend(42);assert.equal(fresh.constructionLaborVersion,1);assert(restore(save(fresh)));
fresh.constructionLaborVersion=99;assert.equal(restore(save(fresh)),null,'unknown schema rejected');
console.log('PASS material breakdowns, labor scaling, new saves, historical migration and idempotent progress preservation');
