import assert from 'node:assert/strict';
import {LabRunner} from '../web/v02/weekend/lab-runner.js';
import {createWeekend,chooseCamp,tick,save,enableFastNavigation,route,PROJECTS,requiredLoads} from '../web/v02/weekend/simulation.js';
const a=createWeekend(42);chooseCamp(a,'shade');const b=structuredClone(a),runner=new LabRunner(a,tick);runner.paused=false;enableFastNavigation(a);
let advanced=0;for(let i=0;i<100;i++)advanced+=runner.advance(.01,Infinity,()=>0);
for(let i=0;i<Math.round(advanced*10);i++)tick(b,.1);
assert.equal(save(a),save(b),'128x scheduling preserves identical fixed-step simulation');
assert(Math.abs(advanced-128)<.11);
runner.paused=true;const before=save(a);runner.advance(5,Infinity,()=>0);assert.equal(save(a),before);assert.equal(runner.debt,0);
let time=0;runner.paused=false;runner.advance(.25,8,()=>++time);assert(runner.debt>0,'CPU deadline yields instead of blocking interaction');
console.log('PASS exact fixed-step equivalence, 128x scheduling, pause and bounded CPU slices');

for(const point of [{x:40,z:40},{x:24,z:27},{x:32,z:18}])assert.deepEqual(route(a,a.stock,point),route(b,b.stock,point));
for(const state of [a,b])state.projects.push({id:state.nextId++,key:'house',x:36,z:30,work:0,delivered:0});
assert.deepEqual(route(a,a.stock,{x:40,z:40}),route(b,b.stock,{x:40,z:40}),'new blueprints invalidate obstacles');
for(const state of[a,b])state.projects.at(-1).work=PROJECTS.house.work;
assert.deepEqual(route(a,a.stock,{x:40,z:40}),route(b,b.stock,{x:40,z:40}));
console.log('PASS optional navigation cache matches baseline routes and invalidates on construction changes');
