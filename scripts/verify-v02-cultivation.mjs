import assert from 'node:assert/strict';
import {createSandbox,planField,fieldPlacementError,queueBedJob,configureBed,resizeField,tick,save,restore,enableFastNavigation,PROJECTS} from '../web/v02/weekend/simulation.js';
import {CROPS,cultivationStep,ensureCultivation,validCultivation} from '../web/v02/weekend/cultivation.js';
import {GAME_DAY} from '../web/v02/weekend/biological-production.js';
const s=createSandbox(42);enableFastNavigation(s);
let placed=false;
for(let z=25;z<55&&!placed;z++)for(let x=24;x<55&&!placed;x++)if(!fieldPlacementError(s,x,z,[2,2])){assert.equal(planField(s,x,z,[2,2]),'');placed=true;}
assert(placed);const p=s.projects.at(-1);
function restored(){assert(validCultivation(s));assert(restore(save(s)),'cultivation save restores');}
function job(action){assert.equal(queueBedJob(s,p.id,0,action),'');const op=s.operations.at(-1);for(let i=0;i<40000&&!op.done;i++)tick(s,.1);assert(op.done,`${action} completed: ${op.status}`);restored();}
restored();job('prepare');
for(const crop of Object.keys(CROPS)){
 assert.equal(configureBed(s,p.id,0,{crop}),'');s.materials[`${crop}_seed`]=100;
 job('plant');assert.equal(p.cultivation.beds[0].stage,'harvestable');
 const before=s.materials[crop];job('harvest');assert(s.materials[crop]>before,crop+' delivered to stores');job('prepare');
}
const make=(key='field')=>{const q={id:1,key,fieldSize:[2,2],work:10000};const state={time:0,mode:'story',projects:[q],operations:[],infrastructure:{nodes:{1:{enabled:true}}}};ensureCultivation(state,q);for(const b of q.cultivation.beds)Object.assign(b,{stage:'growing',moisture:.75});return state;};
const wet=make(),dry=make(),covered=make(),glass=make('greenhouse');covered.projects[0].cultivation.beds.forEach(b=>{b.residueKg=10;b.cover=1;});
for(let d=0;d<1;d++)for(const state of [wet,dry,covered,glass]){state.time+=GAME_DAY;cultivationStep(state,GAME_DAY,()=>state===wet,PROJECTS);}
assert(wet.projects[0].cultivation.beds[0].growth>dry.projects[0].cultivation.beds[0].growth);
assert(covered.projects[0].cultivation.beds[0].evaporated<dry.projects[0].cultivation.beds[0].evaporated);
const b=dry.projects[0].cultivation.beds[0],stress=b.stress;b.moisture=1;cultivationStep(dry,1,()=>true,PROJECTS);assert(b.stress>=stress,'watering never erases stress');
glass.rain=true;cultivationStep(glass,GAME_DAY,()=>false,PROJECTS);assert.equal(glass.projects[0].cultivation.beds[0].rainLiters,0);
const bad=JSON.parse(save(s));bad.projects.find(q=>q.id===p.id).cultivation.beds[0].moisture=2;assert.equal(restore(JSON.stringify(bad)),null);
console.log('PASS cultivation jobs, all crop products, sandbox, saves, drought, cover, greenhouse rain exclusion and stress history');
