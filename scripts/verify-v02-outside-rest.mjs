import assert from 'node:assert/strict';
import {PROJECTS,requiredLoads} from '../web/v02/weekend/simulation.js';
import {setOutsideWork} from '../web/v02/weekend/outside-work.js';
import {village,advance} from './fixtures.mjs';
const s=village().s;
// A large, supplied project remains active throughout the morning. It must not
// keep a worker below the energy needed for their chosen paid shift forever.
s.projects.push({id:s.nextId++,key:'home-cottage',x:50,z:50,work:0,delivered:requiredLoads('home-cottage')});
const r=s.people[0];setOutsideWork(s,r,true);r.energy=20;r.tentPhase='inside';r.tentAt=0;
for(const id in r.needs)r.needs[id]=90;
advance(s,{seconds:400,until:()=>r.outsideWork?.phase==='away'});
assert.equal(r.outsideWork?.phase,'away','after resting, the resident can reach their paid shift despite ongoing construction');
assert(s.projects[0].work<PROJECTS['home-cottage'].work);
console.log('PASS construction naps restore enough energy for an enabled outside-work commitment');
