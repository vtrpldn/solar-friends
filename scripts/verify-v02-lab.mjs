import assert from 'node:assert/strict';
import {LabRunner} from '../web/v02/weekend/lab-runner.js';
import {tick,save,enableFastNavigation,route,PROJECTS,requiredLoads} from '../web/v02/weekend/simulation.js';
import {village} from './fixtures.mjs';
const {s:a}=village({camp:'shade',fast:false});const b=structuredClone(a),runner=new LabRunner(a,tick);runner.paused=false;enableFastNavigation(a);
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

for(const speed of [256,512,1024]){
 const {s:state}=village({fast:false});const baseline=structuredClone(state);enableFastNavigation(state);enableFastNavigation(baseline);
 const fast=new LabRunner(state,tick);fast.speed=speed;fast.paused=false;const advanced=fast.advance(.1,Infinity,()=>0);
 for(let i=0;i<Math.round(advanced*10);i++)tick(baseline,.1);assert.equal(save(state),save(baseline));
}
console.log('PASS 256x, 512x and 1024x retain fixed-step equivalence');
const {s:cached}=village({seed:51});
const ordinary=structuredClone(cached);
for(const state of [cached,ordinary])state.projects.push({id:900,key:'shelter',x:38,z:10,rotation:0,work:0,delivered:0});
for(const mutation of [p=>{},p=>p.x++,p=>p.z++,p=>p.rotation=1,p=>p.work=PROJECTS.shelter.work,p=>p.felled=true,p=>p.felled=false]){
 for(const state of [cached,ordinary])mutation(state.projects.at(-1));
 for(const to of [{x:38,z:10},{x:39,z:11},{x:40,z:12},{x:37,z:9}])assert.deepEqual(route(cached,cached.stock,to),route(ordinary,ordinary.stock,to));
}
for(const state of [cached,ordinary])state.projects.pop();
assert.deepEqual(route(cached,cached.stock,{x:38,z:10}),route(ordinary,ordinary.stock,{x:38,z:10}));
console.log('PASS exact cache invalidation for moves, rotation, completion, felling and removal');
