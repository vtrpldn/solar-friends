import assert from 'node:assert/strict';
import {createWeekend,chooseCamp,tick,enableFastNavigation,queueProduction,utilitySpot,save,restore} from '../web/v02/weekend/simulation.js';
let s=createWeekend(42);chooseCamp(s,'entrance');enableFastNavigation(s);tick(s,.1);
const sites=s.projects.filter(p=>p.key==='wild-fruit');
const inaccessible=sites.find(p=>s.people.every(r=>!utilitySpot(s,s.infrastructure.nodes[p.id],r)));
assert(inaccessible,'seed reproduces unreachable fruit');
assert.equal(queueProduction(s,inaccessible.id,'gather-wild-fruit'),'');
const id=s.operations.at(-1).id;
let deferred=false,otherActivity=false,dropped=false;
for(let i=0;i<10000;i++){
 tick(s,.1);const op=s.operations.find(o=>o.id===id);
 if(!op||op.done){dropped=true;break;}
 if(op.accessRetryAt){deferred=true;assert(s.people.every(r=>r.operation!==id),'inaccessible operation releases ownership');
  const loaded=restore(save(s));assert(loaded);assert.deepEqual(loaded.operations.find(o=>o.id===id).accessRetryAt,op.accessRetryAt);
  const bad=JSON.parse(save(s));bad.operations.find(o=>o.id===id).accessRetryAt={iara:bad.time+1000};assert.equal(restore(JSON.stringify(bad)),null);}
 if(deferred&&s.people.some(r=>['relax','drink','eat','rest','toilet','wash'].includes(r.action)))otherActivity=true;
}
assert(deferred);
// Once everyone has tried, the job is dropped rather than left waiting forever.
assert(dropped,'a job nobody can reach is dropped');
assert(s.people.every(r=>r.operation!==id));
assert(s.log.some(line=>/nobody can reach it on foot/.test(line)));
assert.match(queueProduction(s,inaccessible.id,'gather-wild-fruit'),/Nobody can reach this site/,'the site is left alone for a day');
assert(restore(save(s)),'the day-long pause survives a save');
for(let i=0;i<3000;i++){tick(s,.1);if(s.people.some(r=>['relax','drink','eat','rest','toilet','wash','chat','stroll'].includes(r.action)))otherActivity=true;}
assert(otherActivity,'residents get on with other things');
// A day later the site can be tried again, and a reachable one still works.
s.time=inaccessible.noAccessUntil+1;
assert.doesNotMatch(queueProduction(s,inaccessible.id,'gather-wild-fruit'),/Nobody can reach/);
const reachable=sites.find(p=>s.people.some(r=>utilitySpot(s,s.infrastructure.nodes[p.id],r))&&!s.operations.some(o=>!o.done&&o.site===p.id));
assert(reachable);
if(!queueProduction(s,reachable.id,'gather-wild-fruit')){const op=s.operations.at(-1);for(let i=0;i<20000&&!op.done;i++)tick(s,.1);assert(op.work>0,'reachable work still gets done');}
console.log('PASS inaccessible work releases residents, is dropped once everyone has tried, pauses the site for a day and leaves reachable work alone');
