import {startEmptySandbox} from './lib/empty-sandbox.mjs';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {resetMaterialLocations,stageFixtureMaterial} from '../web/dev/material-fixture.js';
import {advanceGame} from '../web/dev/scenarios.js';
import {processMarkup} from '../web/process-ui.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
await mkdir('artifacts/processes',{recursive:true});
const snap=g=>JSON.parse(g.snapshot()),active=b=>['processing','paused','awaiting_output'].includes(b.phase),owned=(s,id)=>s.village.processes.batches.find(b=>active(b)&&b.building===id);
function checkpoint(g){const saved=g.snapshot(),copy=new Game();assert(copy.restore(saved));assert.equal(copy.snapshot(),saved);copy.free();}
function until(g,test,label,limit=12000){for(let frame=0;frame<limit;frame++){const s=snap(g);if(test(s))return s;g.tick(.25);}throw Error(label+': '+JSON.stringify(snap(g).residents.map(r=>[r.name,r.task,r.reason])));}
const g=new Game();startEmptySandbox(g);for(const [kind,x,y] of [['biodigester',5,5],['biodigester',10,5],['wetland',15,5],['banana_treatment',20,5]])assert.equal(g.place(kind,x,y),'ok');
const fixture=snap(g);Object.assign(fixture.village,{mode:'story',arrived:true,minutes:1320,food:36,meals:0,water:40});
Object.assign(fixture.village.progress,{completed:Array(4).fill(true),later_completed:Array(9).fill(true),scraps:4,use_tools:false});
Object.assign(fixture.village.circular,{waste:8,greywater:24,biogas:0,banana_treatment:false});fixture.village.economy.outside_jobs=Array(5).fill(false);
for(const r of fixture.residents)Object.assign(r,{task:'idle',trip:null,remaining:0,requested:false,energy:90,hunger:0,social:90,last_meal_slot:0,x:10+(r.id-2)*1.25,y:13,target_x:10+(r.id-2)*1.25,target_y:13,activity_batch:null,activity_store:null,activity_material:null,activity_building:null,walking:{}});
assert(g.restore(JSON.stringify(resetMaterialLocations(fixture))));
const staged=snap(g);for(const id of [0,1])stageFixtureMaterial(staged,{kind:'pantry',id},20,2);assert(g.restore(JSON.stringify(staged)));
g.tick(.25);let s=snap(g);assert.equal(s.village.version,33);assert(owned(s,0)&&owned(s,1)&&owned(s,2));
assert.notEqual(owned(s,0).id,owned(s,1).id);assert.equal(owned(s,0).remaining,480);assert.equal(owned(s,1).remaining,480);assert.equal(s.environment.economy.processes.reserved_gas,8);assert.equal(s.village.circular.waste,4);assert.equal(s.village.progress.scraps,0);
advanceGame(g,120);s=snap(g);assert.equal(owned(s,0).remaining,360);assert.equal(owned(s,1).remaining,360);checkpoint(g);
await writeFile('artifacts/processes/working.json',g.snapshot());
const beforeReport=g.snapshot();g.simulation_report();assert.equal(g.snapshot(),beforeReport,'Inspection cannot create process work or identities');
assert.match(processMarkup(s),/Biodigester 1/);assert.match(processMarkup(s),/Digesting without a resident/);assert.match(processMarkup(s),/Recover inputs & pause/);
const finished=new Game();assert(finished.restore(g.snapshot()));
assert.equal(g.set_process_paused(0,true),'ok');advanceGame(g,60);s=snap(g);assert.equal(owned(s,0).remaining,360);assert.equal(owned(s,1).remaining,300);assert.equal(owned(s,0).phase,'paused');checkpoint(g);
await writeFile('artifacts/processes/paused.json',g.snapshot());
const second=owned(s,1).id,waste=s.village.circular.waste,scraps=s.village.progress.scraps;
assert.equal(g.cancel_passive_batch(second),'ok');assert.notEqual(g.cancel_passive_batch(second),'ok');s=snap(g);assert.equal(s.village.circular.waste,waste+2);assert.equal(s.village.progress.scraps,scraps+2);assert.equal(s.village.circular.biogas,0);assert(s.village.processes.paused.includes(1));checkpoint(g);
await writeFile('artifacts/processes/recovered.json',g.snapshot());
const first=owned(s,0).id;assert.equal(g.set_process_paused(0,false),'ok');assert.equal(g.queue_building_work(0,'move',5,12),'ok');
g.tick(.25);assert.equal(owned(snap(g),0).remaining,360,'Queued building work pauses the owned batch');
s=until(g,s=>!s.village.building_jobs.some(j=>j.building===0),'Residents pack and rebuild the digester at the real destination');
assert.equal(owned(s,0).id,first);assert.equal(owned(s,0).remaining,360);assert.deepEqual(s.village.buildings.filter(b=>b.id===0).map(b=>[b.x,b.y]),[[5,12]]);checkpoint(g);
advanceGame(g,60);s=snap(g);assert.equal(owned(s,0).remaining,300);assert.deepEqual([owned(s,0).x,owned(s,0).y],[5,12]);
await writeFile('artifacts/processes/moved.json',g.snapshot());
const beforeDemolition=snap(g);assert.equal(g.queue_building_work(0,'demolish',0,0),'ok');s=snap(g);assert(!owned(s,0));assert.equal(s.village.circular.waste,beforeDemolition.village.circular.waste+2);assert.equal(s.village.progress.scraps,beforeDemolition.village.progress.scraps+2);
until(g,s=>!s.village.buildings.some(b=>b.id===0),'Residents demolish the paused process without destroying inputs');checkpoint(g);
// Unattended overnight completion and independently located curing stores.
advanceGame(finished,360);s=snap(finished);assert.equal(s.village.circular.biogas,8);assert.equal(s.village.circular.batches,2);assert.equal(s.village.circular.pending_compost,4);assert.equal(s.village.circular.reclaimed,8);
assert.equal(s.village.processes.batches.filter(b=>b.kind==='curing'&&active(b)).length,2);assert(s.village.minutes%1440<540);checkpoint(finished);
await writeFile('artifacts/processes/curing.json',finished.snapshot());
assert.equal(finished.queue_building_work(0,'demolish',0,0),'ok');
until(finished,s=>!s.village.buildings.some(b=>b.id===0),'Remove the original digester while its digestate remains sealed');
assert(snap(finished).village.circular.pending_compost>0);checkpoint(finished);
until(finished,s=>s.village.progress.compost===4,'Detached stores cure once after removal');s=snap(finished);assert.equal(s.village.circular.pending_compost,0);assert.equal(s.village.circular.biogas,8);checkpoint(finished);
await writeFile('artifacts/processes/finished.json',finished.snapshot());
// Planted treatment is an independent continuous process with no fuel outlet.
const bananaGame=new Game();startEmptySandbox(bananaGame);assert.equal(bananaGame.place('banana_treatment',20,5),'ok');
const bananaFixture=snap(bananaGame);bananaFixture.village.mode='story';bananaFixture.village.minutes=1320;bananaFixture.village.arrived=true;bananaFixture.village.circular.waste=4;bananaFixture.village.circular.banana_treatment=true;bananaFixture.village.economy.outside_jobs.fill(false);
assert(bananaGame.restore(JSON.stringify(resetMaterialLocations(bananaFixture))));bananaGame.tick(.25);const banana=snap(bananaGame),treated=banana.village.circular.waste_treated,gas=banana.village.circular.biogas;
advanceGame(bananaGame,120);s=snap(bananaGame);assert(Math.abs(s.village.circular.waste_treated-treated-.5)<.001);assert.equal(s.village.circular.biogas,gas);assert.equal(owned(s,0).kind,'banana');checkpoint(bananaGame);
const good=bananaGame.snapshot();for(const field of ['remaining','building','id']){const bad=snap(bananaGame),b=bad.village.processes.batches.find(b=>active(b)&&b.kind==='banana');b[field]=field==='remaining'?1:field==='building'?999:bad.village.logistics.stores[0].id;assert(!bananaGame.restore(JSON.stringify(bad)));assert.equal(bananaGame.snapshot(),good);}
for(const game of [g,finished,bananaGame])game.free();
console.log('PASS: independent owned batches reserve real inputs and output room, progress during sleep, pause separately, recover once, move through resident work, cure after demolition, preserve exact checkpoints and reject forged identities.');
