import assert from 'node:assert/strict';
import {PROJECTS,tick,enableFastNavigation,route,walkSegmentClear} from '../web/v02/weekend/simulation.js';
// Standalone reproduction: the starting resident overlaps an occupied camp
// cell and needs a short outward step before following the rounded grid route.
import {createWeekend,chooseCamp} from '../web/v02/weekend/simulation.js';
const s=createWeekend(42);chooseCamp(s,'entrance');enableFastNavigation(s);
const from={x:30,z:-11.3},to={x:33,z:-13};
// Add the same nearby supply rack that exposed the overlap in the fresh start.
s.projects.push({id:999,key:'gathering',x:29,z:-11,work:PROJECTS.gathering.work,delivered:3},{id:1000,key:'water',x:29,z:-10,work:PROJECTS.water.work,delivered:5});
const path=route(s,from,to);assert(path,'escape route exists');
let p=from;for(const end of path){const length=Math.hypot(end.x-p.x,end.z-p.z),start=p;for(let t=.01;t<=1.01;t+=.01){const next={x:start.x+(end.x-start.x)*Math.min(t,1),z:start.z+(end.z-start.z)*Math.min(t,1)};assert(walkSegmentClear(s,p,next),'every animation step can advance');p=next;}}
console.log('PASS overlap escape uses walkable animation steps instead of an impossible rounded first waypoint');

assert(!walkSegmentClear(s,{x:33,z:-11},{x:30,z:-11}),'escape does not allow entering an obstacle from free ground');
const r=s.people[0];r.x=from.x;r.z=from.z;r.energy=0;for(const k in r.needs)r.needs[k]=0;for(let i=0;i<6000;i++)tick(s,.1);assert(r.needs.hunger>30&&r.energy>25,'resident actually escapes, eats and recovers');
console.log('PASS trapped resident recovers through ordinary movement and needs, without teleportation');
