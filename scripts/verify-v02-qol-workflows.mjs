import assert from 'node:assert/strict';
import {createSandbox, plan, cancelProject, cancelProjectError, PROJECTS, MATERIALS, PROCESSES, save, restore, say, queueProduction} from '../web/v02/weekend/simulation.js';
import {productionSearchText, productionActivity, residentProject} from '../web/v02/weekend/project-ui.js';
import {eventHistory, eventTime} from '../web/v02/weekend/event-history.js';
import {village} from './fixtures.mjs';
function fresh() {
  return village({camp:'clearing', fast:false, money:10000, wood:7, zero:true}).s;
}
const s=fresh(), money=s.money, wood=s.wood;
assert.equal(plan(s,'shelter',40,39),'');
const id=s.projects.at(-1).id;
assert.equal(s.trip.phase,'boarding');
assert.equal(cancelProject(s,id),'');
assert.equal(s.money,money,'Cancellation before departure releases the material and fuel reservations'); assert.equal(s.wood,wood); assert.equal(s.trip,null);
assert(!s.projects.some(p=>p.id===id)); assert(restore(save(s)));
assert(cancelProject(s,id)); assert.equal(s.money,money,'Cannot refund twice');
const transit=fresh(); assert.equal(plan(transit,'shelter',40,39),'');
transit.trip.phase='outbound'; const pid=transit.projects.at(-1).id;
const before=structuredClone(transit);
assert.match(cancelProject(transit,pid),/on their way/); assert.deepEqual(transit,before);
transit.trip=null; delete transit.projects.at(-1).pendingMaterials;
assert.equal(cancelProject(transit,pid),'');
assert.equal(transit.wood,PROJECTS.shelter.materials.wood,'Delivered purchases become available materials, not a cash refund');
const batch=fresh(); assert.equal(plan(batch,'shelter',40,39),''); assert.equal(plan(batch,'gathering',29,35),'');
const first=batch.projects[0].id, second=batch.projects[1].id;
assert.equal(cancelProject(batch,first),''); assert.equal(batch.trip.project,second); assert.deepEqual(batch.trip.projects,[second]); assert(restore(save(batch)));
// Cancellation must inspect every transport, including supplier deliveries.
for (const carrier of ['secondTrip', 'delivery']) {
  const state=fresh();assert.equal(plan(state,'shelter',40,39),'');
  const project=state.projects.at(-1);
  if(carrier==='secondTrip'){state.secondTrip=state.trip;state.trip=null;state.secondTrip.phase='outbound';}
  else {state.delivery={shipments:state.trip.shipments};state.trip=null;}
  const before=structuredClone(state);
  assert.match(cancelProject(state,project.id),/on their way/);
  assert.deepEqual(state,before,'An active shipment cannot be refunded');
}
{
  const state=fresh();assert.equal(plan(state,'shelter',40,39),'');
  const project=state.projects.at(-1);
  state.secondTrip=state.trip;state.trip=null;
  assert.equal(cancelProject(state,project.id),'');
  assert.equal(state.secondTrip,null);assert(restore(save(state)));
}
{
  const state=fresh();assert.equal(plan(state,'shelter',40,39),'');
  const project=state.projects.at(-1),trip=state.trip;
  state.trade={version:1,nextId:2,orders:[{id:1,material:'bamboo',quantity:MATERIALS.bamboo.quantity,cents:100,status:'loaded',created:0,marketDay:0}],market:{},dispatchAt:0};
  trip.exports=[1];
  assert.equal(cancelProject(state,project.id),'');
  assert.equal(state.trip,trip);assert.equal(trip.saleOnly,true);
  assert.equal(trip.project,undefined);assert.equal(trip.shipments,undefined);
  assert(restore(save(state)),'Cancelling construction preserves already loaded exports');
}
const sandbox=createSandbox(42); sandbox.instantBuild=false;
assert.equal(plan(sandbox,'road',50,50),''); const road=sandbox.projects.at(-1);
sandbox.people[0].job=road.id; sandbox.people[0].cargo=true; sandbox.people[0].haulLoads=1;
const supplies=structuredClone(sandbox.materials);
assert.equal(cancelProject(sandbox,road.id),''); assert.equal(sandbox.people[0].job,null); assert.equal(sandbox.people[0].cargo,false); assert.deepEqual(sandbox.materials,supplies);
assert.equal(plan(sandbox,'road',50,50),'');sandbox.projects.at(-1).work=.1;
assert.match(cancelProjectError(sandbox,sandbox.projects.at(-1).id),/already started/);
assert(productionSearchText(PROJECTS.goat_pasture,PROCESSES,MATERIALS).includes('milk'));
sandbox.instantBuild=true; assert.equal(plan(sandbox,'goat_pasture',50,55),'');
const pasture=sandbox.projects.at(-1), recipe=Object.entries(PROCESSES).find(([,r])=>r.kind===PROJECTS.goat_pasture.kind)[0];
assert.equal(queueProduction(sandbox,pasture.id,recipe),'');
const op=sandbox.operations.at(-1); assert.equal(productionActivity(sandbox,pasture,PROCESSES).label,'Batch queued');
const worker=sandbox.people[0]; worker.operation=op.id; worker.needTask=null;worker.tentPhase=null;worker.action='produce';op.work=PROCESSES[recipe].work/2;
assert.equal(productionActivity(sandbox,pasture,PROCESSES).progress,.5);assert(productionActivity(sandbox,pasture,PROCESSES).detail.includes(worker.name));assert.equal(residentProject(sandbox,worker).id,pasture.id);
worker.needTask={kind:'hunger'};assert.equal(residentProject(sandbox,worker),null);
const history={time:0,log:['Old event']};say(history,'Iara purified water','water-purified');history.time=10;say(history,'Bento purified water','water-purified');
assert.equal(eventHistory(history)[0].count,2);assert.equal(eventHistory(history)[1].time,null);assert.equal(eventTime(0),'Day 1 · 09:00');
assert.equal(eventTime(2000),'Day 2 · 00:00');
say(history,'Building ready');assert.equal(eventHistory(history)[0].count,1);
say(s,'A new event');assert.deepEqual(restore(save(s)).events,s.events, 'New event history remains save-compatible');
console.log('PASS cancellation refunds, pickup guards, worker cleanup, save roundtrips, producer search, production progress, job links and grouped event timestamps');
