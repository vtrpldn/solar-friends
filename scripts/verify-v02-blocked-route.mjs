import assert from 'node:assert/strict';
import {createWeekend,chooseCamp,route,PROJECTS} from '../web/v02/weekend/simulation.js';
import {PathQueue} from '../web/v02/weekend/path-queue.js';
const s=createWeekend(42);chooseCamp(s,'entrance');s.projects.push({id:s.nextId++,key:'house',x:40,z:10,work:PROJECTS.house.work,delivered:0});
let expansions=0;const original=PathQueue.prototype.pop;PathQueue.prototype.pop=function(){expansions++;return original.call(this);};
try{assert.equal(route(s,{x:38,z:10},{x:40,z:10}),null);assert.equal(expansions,0,'known blocked destination must not flood-search the map');}finally{PathQueue.prototype.pop=original;}
assert(route(s,{x:38,z:10},{x:38,z:12}),'nearby open destinations remain reachable');
console.log('PASS blocked destination rejected without graph expansion; open paths remain reachable');
