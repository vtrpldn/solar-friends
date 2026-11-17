import assert from 'node:assert/strict';
import {createWeekend,chooseCamp,tick,enableFastNavigation,queueProduction,utilitySpot,save,restore} from '../web/v02/weekend/simulation.js';
let s=createWeekend(42);chooseCamp(s,'entrance');enableFastNavigation(s);tick(s,.1);
const sites=s.projects.filter(p=>p.key==='wild-fruit');
const inaccessible=sites.find(p=>s.people.every(r=>!utilitySpot(s,s.infrastructure.nodes[p.id],r)));
assert(inaccessible,'seed reproduces unreachable fruit');
assert.equal(queueProduction(s,inaccessible.id,'gather-wild-fruit'),'');
const id=s.operations.at(-1).id;
let deferred=false,otherActivity=false;
for(let i=0;i<10000;i++){
 tick(s,.1);const op=s.operations.find(o=>o.id===id);
 if(op.accessRetryAt){deferred=true;assert(s.people.every(r=>r.operation!==id),'inaccessible operation releases ownership');}
 if(deferred&&s.people.some(r=>['relax','drink','eat','rest','toilet','wash'].includes(r.action)))otherActivity=true;
}
assert(deferred);assert(otherActivity);assert.equal(s.operations.find(o=>o.id===id).work,0);
const loaded=restore(save(s));assert(loaded);assert.deepEqual(loaded.operations.find(o=>o.id===id).accessRetryAt,s.operations.find(o=>o.id===id).accessRetryAt);
const bad=JSON.parse(save(s));bad.operations.find(o=>o.id===id).accessRetryAt={iara:bad.time+1000};assert.equal(restore(JSON.stringify(bad)),null);
// A repaired access route is retried; the queued operation is retained rather than discarded.
const reachable=sites.find(p=>s.people.some(r=>utilitySpot(s,s.infrastructure.nodes[p.id],r)));
assert(reachable);const op=s.operations.find(o=>o.id===id);op.site=reachable.id;
for(let i=0;i<20000&&!op.done;i++)tick(s,.1);
assert(op.work>0,'work resumes after the retry delay when access is available');
console.log('PASS inaccessible work releases residents, preserves retry on reload, rejects malformed retry state and resumes after access returns');
