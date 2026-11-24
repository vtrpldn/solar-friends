// Skipping the arrival, pitching and re-pitching the first camp, and carrying
// the camp over from the cars.
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {beginArrival,skipArrival,createWeekend,createSandbox,tick,save,restore,chooseCamp,repitchCamp,canRepitchCamp,
  campPlacementError,campSiteFacts,campLocation,tentDoor,route,plan,PROJECTS,enableFastNavigation} from '../web/v02/weekend/simulation.js';
import {ARRIVAL_DURATION} from '../web/v02/weekend/arrival.js';
import {CAMP_LOADS,campCells,campRect} from '../web/v02/weekend/camp.js';
import {ensureNaturalLand} from '../web/v02/weekend/natural-resources.js';

// 1. A skipped arrival is the played-out arrival, in both modes and after a reload.
for(const create of [createWeekend,createSandbox])for(const seed of [7,4242]){
  const played=beginArrival(create(seed));
  let frames=0;while(played.arrivalAnimating&&frames++<1000)tick(played,.1);
  assert.equal(played.arrivalAnimating,false);assert(frames>=ARRIVAL_DURATION*10-1,'the arrival plays for its full length');
  const skipped=beginArrival(create(seed));
  for(let i=0;i<34;i++)tick(skipped,.1);
  const reloaded=restore(save(skipped));
  assert(reloaded?.arrivalAnimating,'a save taken mid-arrival resumes the arrival');
  assert.equal(skipArrival(skipped),true);assert.equal(skipArrival(reloaded),true);
  assert.equal(skipArrival(skipped),false,'nothing left to skip');
  const fresh=beginArrival(create(seed));skipArrival(fresh);
  for(const state of [skipped,reloaded,fresh]){
    assert.equal(state.arrivalElapsed,ARRIVAL_DURATION);
    assert.equal(isDeepStrictEqual(JSON.parse(save(restore(save(state)))),JSON.parse(save(restore(save(played))))),true,'skip and play-out reach one state');
  }
  // …and the two go on to simulate identically.
  if(create===createSandbox){
    for(let i=0;i<200;i++){tick(played,.1);tick(fresh,.1);}
    assert(played.time>0);assert.equal(isDeepStrictEqual(JSON.parse(save(fresh)),JSON.parse(save(played))),true,'both continue identically');
  }
}

// 2. Pitching with unpacking, measured facts, rotation and re-pitching.
const openSites=(s,rotation,count)=>{
  const sites=[];
  for(let ring=4;ring<40&&sites.length<count;ring+=3)for(let k=0;k<12&&sites.length<count;k++){
    const x=Math.round(s.stock.x+Math.cos(k*Math.PI/6)*ring),z=Math.round(s.stock.z+12+Math.sin(k*Math.PI/6)*ring);
    if(!campPlacementError(s,x,z,rotation)&&!sites.some(o=>Math.hypot(o.x-x,o.z-z)<8))sites.push({x,z,rotation});
  }
  assert.equal(sites.length,count,'the land offers open camp sites');
  return sites;
};
for(const seed of [1,777]){
  const s=createWeekend(seed);ensureNaturalLand(s,PROJECTS);enableFastNavigation(s);
  for(const rotation of [0,1,2,3]){
    const [site]=openSites(s,rotation,1),facts=campSiteFacts(s,site.x,site.z,rotation);
    assert(facts.carsMetres>0&&facts.carsPath.length>1,'walking distance to the cars is measured');
    assert(facts.riverMetres===null||facts.riverMetres>0);
    assert(facts.fallMetres>=0&&Number.isInteger(facts.trees));
    assert.equal(campCells(site).length,15);
    const rect=campRect(site);assert.deepEqual([rect.w,rect.d].sort(),[4,5]);
  }
  assert.equal(campPlacementError(s,s.stock.x,s.stock.z,0)!==null,true,'the unloading point stays clear');
  assert.equal(campPlacementError(s,10,10,4)!==null,true,'only quarter turns exist');
  const padsBefore=s.terrainPads.length;
  const [first]=openSites(s,1,1);
  assert.equal(chooseCamp(s,first,{unpack:true}),true);
  assert.equal(s.stage,'playing');assert.deepEqual(s.unpack.delivered,[]);assert.equal(s.campSite.rotation,1);
  assert.equal(canRepitchCamp(s),true,'a fresh camp can still move');
  // The old site is free again while the camp can move; its pad leaves with it.
  const second=openSites(s,2,3).find(o=>Math.hypot(o.x-first.x,o.z-first.z)>8);
  assert.equal(campPlacementError(s,first.x,first.z,0),null,'the camp may be turned where it stands');
  for(let i=0;i<20;i++)tick(s,.1);
  assert(s.people.some(r=>r.unpack),'residents head for the cars');
  assert.equal(repitchCamp(s,second),true);
  assert.deepEqual([campLocation(s).x,campLocation(s).z,campLocation(s).rotation],[second.x,second.z,2]);
  assert.equal(s.terrainPads.length,padsBefore+1,'moving the camp leaves no levelled ground behind');
  assert.equal(s.stage,'playing');assert.equal(canRepitchCamp(s),true);
  for(const i of [0,1])assert(route(s,s.stock,tentDoor(s,i)),'tent doors are reachable after a move');
  const direct=createWeekend(seed);ensureNaturalLand(direct,PROJECTS);chooseCamp(direct,second,{unpack:true});
  assert.deepEqual(s.terrainPads,direct.terrainPads);assert.deepEqual(s.campSite,direct.campSite);assert.deepEqual(s.unpack,direct.unpack);
  // Saves taken mid-unpacking resume it.
  let firstDrop=null;
  for(let i=0;i<6000&&!s.unpack.delivered.length;i++){tick(s,.1);firstDrop=i;}
  assert.equal(s.unpack.delivered.length,1,'the first load reaches the camp');
  assert.equal(canRepitchCamp(s),false,'the camp stays once a load is set down');
  assert.equal(repitchCamp(s,first),false);
  assert.deepEqual([campLocation(s).x,campLocation(s).z],[second.x,second.z]);
  const loaded=restore(save(s));assert(loaded,'a save taken while unpacking loads');
  assert.deepEqual(loaded.unpack,s.unpack);
  for(const state of [s,loaded]){
    enableFastNavigation(state);
    let ticks=0;while(state.unpack&&ticks++<20000)tick(state,.1);
    assert.equal(state.unpack,undefined,`unpacking finishes (seed ${seed})`);
    assert(state.people.every(r=>!r.unpack&&r.action!=='unpack'));
    assert(state.log.some(line=>line.startsWith('The camp is unpacked')));
    assert(restore(save(state)),'the unpacked camp saves like any other');
  }
  console.log(`seed ${seed}: first load after ${((firstDrop+1)/10).toFixed(0)} s, camp unpacked at ${s.time.toFixed(0)} s`);
}

// 3. Planning anything fixes the camp in place.
{
  const s=createWeekend(3);ensureNaturalLand(s,PROJECTS);
  const [site]=openSites(s,0,1);chooseCamp(s,site,{unpack:true});
  let planned=false;
  for(let dx=6;dx<16&&!planned;dx++)for(let dz=-6;dz<8&&!planned;dz++)planned=!plan(s,'rain-tent',site.x+dx,site.z+dz,0);
  assert(planned,'a first project can be planned while unpacking');
  assert.equal(canRepitchCamp(s),false);
}

// 4. The established API and older saves are untouched.
{
  const s=createWeekend(5);
  assert.equal(chooseCamp(s,'entrance'),true);
  assert.equal(s.unpack,undefined);assert.equal(canRepitchCamp(s),false);
  assert(s.log[0].includes('unpack first'));
  const custom=createWeekend(5);chooseCamp(custom,{x:34,z:0});
  assert.equal(custom.campSite.rotation,undefined,'unrotated camps save as they always have');
  assert(restore(save(custom)));
  const broken=JSON.parse(save(custom));broken.unpack={delivered:[99],pad:null};
  assert.equal(restore(JSON.stringify(broken)),null,'malformed unpacking state is rejected');
  const turned=JSON.parse(save(custom));turned.campSite.rotation=7;
  assert.equal(restore(JSON.stringify(turned)),null);
}
console.log(`PASS: skip equals played-out arrival; ${CAMP_LOADS.length}-load unpacking, rotation, re-pitching and saves.`);
