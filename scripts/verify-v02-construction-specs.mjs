import assert from 'node:assert/strict';
import {PROJECTS,createWeekend,requiredLoads,save,restore} from '../web/v02/weekend/simulation.js';
import {migrateConstructionLabor,constructionSpecText} from '../web/v02/weekend/construction-specs.js';
import {village} from './fixtures.mjs';
for(const [key,d]of Object.entries(PROJECTS)){
 if(!d.construction)continue;
 const combined={};for(const p of d.construction.phases)for(const [id,q]of Object.entries(p.materials))combined[id]=(combined[id]||0)+q;
 assert.deepEqual(combined,d.materials,`${key}: every material allocated exactly once`);
 assert.equal(d.work,d.construction.hours*60/.45);
 assert(constructionSpecText(d).includes('Assembly estimate'));
 if(d.construction.area){if(d.kind==='home')assert(d.construction.hours>100);assert(d.materials.stone>=d.construction.area*6);}
 const v1={constructionLaborVersion:1,projects:[{key,work:d.construction.packWork*.5}]};assert(migrateConstructionLabor(v1,PROJECTS));assert(Math.abs(v1.projects[0].work/d.work-.5)<1e-12);
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
const old=village({fast:false}).s;
old.projects.push({id:old.nextId++,key:'house',x:50,z:50,work:PROJECTS.house.construction.legacyWork,delivered:requiredLoads('house')});
delete old.constructionLaborVersion;
const cash=old.money,inventory=structuredClone(old.materials),delivered=old.projects.map(p=>p.delivered);
const loaded=restore(save(old));assert(loaded,'labor migration accepts a valid current-catalog layout');
assert.equal(loaded.money,cash);assert.deepEqual(loaded.materials,inventory);assert.deepEqual(loaded.projects.map(p=>p.delivered),delivered);
assert.equal(loaded.projects[0].work,PROJECTS.house.work,'completed house stays complete');
assert(restore(save(loaded)),'converted save round trips');
// A completed version-two shed from the earlier two-cell catalog keeps its
// installed status; an unfinished site does not gain construction labor.
const resized={constructionLaborVersion:2,projects:[{id:1,key:'shed',work:4074.6666666666665,billOfMaterials:{wood:16,hardware:1,tiles:32,stone:48,earth:16}},{id:2,key:'shed',work:100,billOfMaterials:{wood:16}}],infrastructure:{nodes:{1:{id:1,kind:'shed'}}}};
assert(migrateConstructionLabor(resized,PROJECTS));assert.equal(resized.projects[0].work,PROJECTS.shed.work);assert.equal(resized.projects[1].work,100);
const sameBill={constructionLaborVersion:2,projects:[{id:1,key:'shed',work:100,billOfMaterials:{...PROJECTS.shed.materials}}],infrastructure:{nodes:{1:{id:1,kind:'shed'}}}};
assert(migrateConstructionLabor(sameBill,PROJECTS));assert.equal(sameBill.projects[0].work,100,'a current-catalog inconsistency is not repaired as a historical resize');
const fresh=createWeekend(42);assert.equal(fresh.constructionLaborVersion,2);assert(restore(save(fresh)));
fresh.constructionLaborVersion=99;assert.equal(restore(save(fresh)),null,'unknown schema rejected');
console.log('PASS material breakdowns, labor scaling, new saves, historical migration and idempotent progress preservation');
