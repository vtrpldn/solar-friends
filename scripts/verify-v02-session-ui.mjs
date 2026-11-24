import assert from 'node:assert/strict';
import {simulationSpeed, simulationFrame, createPace, resetPace, laggingSpeed, restoredView, wasteWarnings, operationalStatus, buildingBenefit} from '../web/v02/weekend/session-ui.js';
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

// Slow frames: wall time the loop could not simulate is carried, not dropped.
{
  // 6 fps at 16×, cheap steps: every frame is owed 1/6s and gets all of it.
  const pace=createPace();let acc=0,count=0;
  for(let f=0;f<60;f++)acc=simulationFrame(acc,1/6,16,dt=>{assert.equal(dt,.1);count++;},()=>0,pace);
  assert(Math.abs(count*.1+acc-160)<1e-6,'10 wall seconds at 16× simulate 160 seconds at 6 fps');
  assert(pace.debt<1e-9);assert.equal(laggingSpeed(pace,16),null);
  // The unpaced call keeps the old contract: 100ms at most, nothing carried.
  count=0;simulationFrame(0,1/6,16,()=>count++,()=>0);assert.equal(count,16);
}
{
  // One frame runs out of budget; the next frames repay it and the total is exact.
  const pace=createPace();let acc=0,count=0,clock=0,cost=5;
  acc=simulationFrame(acc,.02,64,()=>{count++;clock+=cost;},()=>clock,pace);
  assert.equal(count,2,'Steps still yield after the 8ms budget');
  assert(Math.abs(pace.debt-(.02-2*.1/64))<1e-9,'Unspent wall time becomes debt');
  cost=0;
  for(let f=0;f<5;f++)acc=simulationFrame(acc,.02,64,()=>{count++;},()=>clock,pace);
  assert(Math.abs(count*.1+acc-.12*64)<1e-6,'Debt is repaid at the labelled speed');
  assert(pace.debt<1e-9);
}
{
  // The step budget follows the frame interval, between 8ms and 30ms.
  for(const [elapsed,expected] of [[.016,8],[.06,15],[.5,30]]){
    let clock=0,count=0;
    simulationFrame(0,elapsed,1000,()=>{count++;clock++;},()=>clock,createPace(10));
    assert.equal(count,expected,`budget for a ${elapsed}s frame`);
  }
}
{
  // A long stall is capped at the limit: no jump, and the excess is forgotten.
  const pace=createPace();let count=0;
  const acc=simulationFrame(0,300,16,()=>count++,()=>0,pace);
  assert.equal(count,160,'A five-minute stall simulates one wall second, not 300');
  assert(acc<1e-6&&pace.debt<1e-9);
  // Negative or zero intervals do nothing.
  count=0;assert.equal(simulationFrame(.03,-5,16,()=>count++,()=>0,pace),.03);assert.equal(count,0);
}
{
  // A machine that cannot keep up: debt stays bounded, work per frame stays
  // bounded, and the real rate is reported instead of the labelled one.
  const pace=createPace();let acc=0,count=0,clock=0,most=0;
  for(let f=0;f<120;f++){
    const before=count;
    acc=simulationFrame(acc,.1,16,()=>{count++;clock+=5;},()=>clock,pace); // 5ms per step: 5 of 16 fit in 25ms
    most=Math.max(most,count-before);
    assert(pace.debt<=pace.limit+1e-9,'Debt never exceeds its limit');
  }
  assert.equal(most,5,'No spiral: each frame stops at its budget');
  assert.equal(count,600);
  const real=laggingSpeed(pace,16);
  assert(real>4.5&&real<5.5,`Reports about 5× of 16×, got ${real}`);
  // Recovery clears the report, after at most the capped debt has been repaid.
  for(let f=0;f<30;f++)acc=simulationFrame(acc,.1,16,()=>{count++;},()=>clock,pace);
  assert.equal(laggingSpeed(pace,16),null);
  assert(count<=600+(3+pace.limit)*160+1,'Recovery repays no more than the capped debt');
  resetPace(pace);assert.equal(pace.debt,0);assert.equal(pace.ratio,1);
}
{
  // One hitch does not flip the label.
  const pace=createPace();let acc=0;
  for(let f=0;f<30;f++)acc=simulationFrame(acc,.016,16,()=>{},()=>0,pace);
  let clock=0;acc=simulationFrame(acc,.9,16,()=>{clock+=10;},()=>clock,pace);
  for(let f=0;f<120;f++){acc=simulationFrame(acc,.016,16,()=>{},()=>0,pace);assert.equal(laggingSpeed(pace,16),null);}
  assert(pace.debt<1e-9);
}
{
  // Determinism: frame pacing changes when steps run, never what they are.
  const run=frames=>{let acc=0,total=0;const pace=createPace(100);for(const e of frames)acc=simulationFrame(acc,e,8,dt=>{total+=dt;},()=>0,pace);return Math.round((total+acc)*1e6);};
  assert.equal(run(Array(600).fill(1/60)),run(Array(50).fill(.2)));
}
console.log('PASS slow-frame carry-over, budget scaling, stall cap, bounded overload with honest rate, hitch tolerance and fixed steps');
