import assert from 'node:assert/strict';
import {createSandbox,createWeekend,chooseCamp,route,enableFastNavigation,tick,PROJECTS} from '../web/v02/weekend/simulation.js';
const s=createSandbox(42),plain=structuredClone(s),from={x:48,z:48},to={x:58,z:58};enableFastNavigation(s);
function compare(){assert.deepEqual(route(s,from,to),route(plain,from,to));}
compare();const expected=route(s,from,to),consumed=route(s,from,to);consumed.shift();assert.deepEqual(route(s,from,to),expected,'walking cannot consume the cached route');
for(const state of [s,plain])state.projects.push({id:1,key:'home-cottage',x:51,z:51,work:0,rotation:0});compare();
for(const state of [s,plain])state.projects[0].work=PROJECTS['home-cottage'].work;compare();
for(const state of [s,plain])state.projects[0].rotation=1;compare();
for(const state of [s,plain])state.projects[0].x=65;compare();
for(const state of [s,plain])state.landSeed=43;compare();
const slow=createWeekend(42);chooseCamp(slow,'entrance');const fast=structuredClone(slow);enableFastNavigation(fast);
for(let i=0;i<1000;i++){tick(slow,.1);tick(fast,.1);}
assert.deepEqual(fast,slow,'cached navigation preserves the full simulated state');
console.log('PASS cached and uncached paths, consumed-array isolation, construction/rotation/movement/terrain invalidation and identical simulated state');
