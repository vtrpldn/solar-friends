import assert from 'node:assert/strict';
import {createWeekend,chooseCamp,PROJECTS,MATERIALS,plan,placementError,requiredLoads,save,restore} from '../web/v02/weekend/simulation.js';
import {projectMaterials,captureProjectMaterials} from '../web/v02/weekend/project-materials.js';
const s=createWeekend(42);chooseCamp(s,'entrance');let spot;for(let z=-18;z<0&&!spot;z++)for(let x=20;x<40&&!spot;x++)if(!placementError(s,'gathering',x,z))spot={x,z};assert(spot);assert.equal(plan(s,'gathering',spot.x,spot.z),'');
const p=s.projects[0],paid={...p.billOfMaterials},loads=requiredLoads(p),current=PROJECTS.gathering.materials;
try{PROJECTS.gathering.materials={...current,wood:current.wood*2};assert.deepEqual(projectMaterials(p,PROJECTS),paid);assert.equal(requiredLoads(p),loads);const restored=restore(save(s));assert(restored);assert.deepEqual(restored.projects[0].billOfMaterials,paid);}finally{PROJECTS.gathering.materials=current;}
const legacy={projects:[{key:'gathering'}]};assert(captureProjectMaterials(legacy,PROJECTS,MATERIALS));assert.deepEqual(legacy.projects[0].billOfMaterials,current);legacy.projects[0].billOfMaterials.wood=-1;assert.equal(captureProjectMaterials(legacy,PROJECTS,MATERIALS),false);
console.log('PASS paid project bills survive changed catalog recipes, keep original load counts and reject invalid quantities');
const oldSolar=createWeekend(42);chooseCamp(oldSolar,'entrance');delete oldSolar.materialBillVersion;
oldSolar.projects.push({id:oldSolar.nextId++,key:'solar_farm',x:40,z:10,work:PROJECTS.solar_farm.work,delivered:0});
const migrated=restore(save(oldSolar));assert(migrated);assert.equal(migrated.projects[0].billOfMaterials.panels,2,'older paid solar keeps its two modules');assert.equal(PROJECTS.solar_farm.materials.panels,6,'new farm matches six modeled modules');assert.equal(restore(save(migrated)).projects[0].billOfMaterials.panels,2,'migration is idempotent');
console.log('PASS old solar quantity preservation and new six-module bill');
