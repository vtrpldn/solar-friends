import assert from 'node:assert/strict';
import {accessGeometry,segmentHitsSolid} from '../web/v02/weekend/building-access.js';
import {createSandbox,PROJECTS,footprint,route,walkSegmentClear,save,restore,enableFastNavigation,utilitySpot,plan,placementError} from '../web/v02/weekend/simulation.js';
for(let rotation=0;rotation<4;rotation++){
 const p={key:'workshop',x:20,z:40,rotation,work:PROJECTS.workshop.work};
 const g=accessGeometry(p,PROJECTS.workshop,footprint(p));
 assert.equal(g.entrances.length,1);assert.equal(g.work.length,1);
 assert(!segmentHitsSolid(g.work[0],g.work[0],g.solids[0]));
}
const s=createSandbox(42);s.projects=[];enableFastNavigation(s);
const p={id:s.nextId++,key:'rain-barrel',x:20,z:40,rotation:0,delivered:1,work:PROJECTS['rain-barrel'].work};s.projects.push(p);
assert(walkSegmentClear(s,{x:19.55,z:39.5},{x:19.55,z:40.5}),'walk within prop reservation beside its body');
assert(!walkSegmentClear(s,{x:19,z:40},{x:21,z:40}),'barrel body remains solid');
const path=route(s,{x:19,z:40},{x:21,z:40});assert(path);
let last={x:19,z:40};for(const point of path){assert(walkSegmentClear(s,last,point));last=point;}
p.work=0;assert(!walkSegmentClear(s,{x:19.55,z:39},{x:19.55,z:41}),'construction reserves full footprint');
p.key='shelter';p.work=PROJECTS.shelter.work;
assert(walkSegmentClear(s,{x:19,z:40},{x:22,z:40}),'open shelter allows passage');
const original=createSandbox(42);const loaded=restore(save(original));assert(loaded);assert.deepEqual(loaded.projects.map(footprint),original.projects.map(footprint));
console.log('PASS rotated access, small prop clearance, solid body avoidance, route segments, construction blocking, open shelter, save compatibility');

const a={id:'a',x:18,z:40},b={id:'b',x:18,z:41};s.people=[a,b];
p.key='workshop';p.work=PROJECTS.workshop.work;
const node={id:p.id};const spot=utilitySpot(s,node,a);assert(spot);
a.target=spot;assert.equal(utilitySpot(s,node,b),undefined,'work position is exclusive');
a.target=null;a.needTask={kind:'rest'};assert(utilitySpot(s,node,b),'interruption releases the reservation');
s.projects.push({id:999,key:'house',x:spot.x-.5,z:spot.z,work:PROJECTS.house.work});
assert.equal(utilitySpot(s,node,b),undefined,'blocked access has no side-wall fallback');
s.projects.pop();assert(utilitySpot(s,node,b),'removing obstruction restores access');
console.log('PASS exclusive work access, interruption release, blocked entrance and route invalidation');

const village=createSandbox(42);enableFastNavigation(village);
assert.equal(plan(village,'house',40,39),'');
assert.match(placementError(village,'house',40,39+PROJECTS.house.size[1]),/access|entrance/,'placement protects an existing entrance');
console.log('PASS placement rejects obstruction of an existing building entrance');
