import assert from 'node:assert/strict';
import {simulationSpeed, simulationFrame, restoredView, wasteWarnings, operationalStatus, buildingBenefit} from '../web/v02/weekend/session-ui.js';
import {createSandbox, plan, placementError, buildingFront, PROJECTS, PROCESSES, save, restore} from '../web/v02/weekend/simulation.js';
import {COMMUNITY} from '../web/v02/library/community-defs.js';
let clock=0, steps=0;
const remainder=simulationFrame(0,.1,16,()=>{steps++;clock+=5;},()=>clock);
assert.equal(steps,2,'Expensive simulation yields after its frame budget');
assert(remainder<.1,'No accumulated catch-up spiral');
steps=0; simulationFrame(0,.1,16,()=>steps++,()=>0);
assert.equal(steps,16,'Fast frames retain fixed 100ms steps');
const view={speed:16,paused:true,position:[20,35,20],target:[1,2,3],zoom:2};
const s=createSandbox(42);s.view=view;
assert.deepEqual(restoredView(restore(save(s)).view),view);
assert.equal(restoredView({...view,zoom:Infinity}),null);
assert.equal(restoredView({...view,position:[NaN,0,0]}),null);
assert.equal(restoredView(undefined),null);
assert.deepEqual(wasteWarnings({capacity:[10,10,10,16],water:[10,10,2,15.5]}),['Sewage tank nearly full (15.5/16)']);
assert.deepEqual(wasteWarnings({capacity:[10,10,10,16],water:[10,10,2,0]}),[],'Full clean-water tanks are not problems');
assert.equal(operationalStatus({}, {enabled:false},{label:'Batch queued'}),'Switched off');
assert.equal(operationalStatus({}, {enabled:true,demand:2,power:0},null),'Waiting for power');
assert.match(buildingBenefit(PROJECTS['garden-bench'],PROCESSES,COMMUNITY),/recover fun/);
assert.equal(plan(s,'house',60,50),'');
const home=s.projects.at(-1),front=buildingFront(home),details={};
const error=placementError(s,'garden-bench',Math.round(front.x),Math.round(front.z),null,0,details);
assert.match(error,/entrance/);assert.deepEqual(details.entrance,front);
console.log('PASS frame budgeting, saved view validation, waste warnings, building status, recreation benefits and entrance feedback');

const village={stage:'playing',time:100,people:[{id:1,tentPhase:'inside',sleepUntil:200},{id:2,outsideWork:{phase:'away'}},{id:3}],trip:{person:3,phase:'away'}};
assert.equal(simulationSpeed(village,4),64,'Mixed sleeping and away residents qualify');
for(const phase of ['outbound','inbound']){village.trip.phase=phase;assert.equal(simulationSpeed(village,4),64);}
for(const phase of ['boarding','unloading']){village.trip.phase=phase;assert.equal(simulationSpeed(village,4),4);}
village.trip.phase='away';
for(const phase of ['enter','exit',null]){village.people[0].tentPhase=phase;assert.equal(simulationSpeed(village,4),4);}
village.people[0].tentPhase='inside';village.people[0].sleepUntil=100;
assert.equal(simulationSpeed(village,4),4,'Awake indoor rest does not qualify');
village.people[0].sleepUntil=200;
assert.equal(simulationSpeed({...village,people:[]},4),4);
assert.equal(simulationSpeed({...village,stage:'arrival'},4),4);
steps=0;simulationFrame(0,.1,()=>simulationSpeed(village,4),()=>steps++,()=>0);
assert.equal(steps,64,'64× advances 6.4 simulation seconds per 100ms frame');
steps=0;const afterWake=simulationFrame(0,.1,()=>simulationSpeed(village,4),()=>{steps++;village.people[0].sleepUntil=100;},()=>0);
assert.equal(steps,4,'Waking restores selected speed within the same frame');
assert(Math.abs(afterWake-.09375)<1e-10);
console.log('PASS automatic 64×, mixed sleep/trips, arrival and empty-village exclusions, and mid-frame speed restoration');
