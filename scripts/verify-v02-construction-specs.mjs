import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PROJECTS,createWeekend,save,restore} from '../web/v02/weekend/simulation.js';
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
assert(PROJECTS['home-shared'].work>PROJECTS['home-family'].work);
assert(PROJECTS['home-family'].work>PROJECTS.house.work);
assert.equal(PROJECTS.shelter.work,1067,'keep first-camp recipe pacing');
const raw=JSON.parse(fs.readFileSync('docs/playtests/evidence/2026-11-08-regular-catalog-day61-save.json','utf8'));
const cash=raw.money,inventory=JSON.stringify({...raw.materials,cooling:0}),delivered=raw.projects.map(p=>p.delivered);
const loaded=restore(JSON.stringify(raw));assert(loaded,'genuine historical save migrates');
assert.equal(loaded.money,cash);assert.equal(JSON.stringify(loaded.materials),inventory);assert.deepEqual(loaded.projects.map(p=>p.delivered),delivered);
for(const p of raw.projects){const def=PROJECTS[p.key],converted=loaded.projects.find(x=>x.id===p.id);if(p.work===(def.construction?.legacyWork??def.work))assert.equal(converted.work,def.work,`${p.key} stays complete`);}
assert(restore(save(loaded)),'converted save round trips');
const fresh=createWeekend(42);assert.equal(fresh.constructionLaborVersion,1);assert(restore(save(fresh)));
fresh.constructionLaborVersion=99;assert.equal(restore(save(fresh)),null,'unknown schema rejected');
console.log('PASS material breakdowns, labor scaling, new saves, historical migration and idempotent progress preservation');
