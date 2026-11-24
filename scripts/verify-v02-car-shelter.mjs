import assert from 'node:assert/strict';
import {createWeekend,chooseCamp,PROJECTS,plan,moveProject,placementError,tick,save,restore,enableFastNavigation,route} from '../web/v02/weekend/simulation.js';
import {upkeep,upkeepStep,carsSheltered,VEHICLE_WEATHER_DAYS} from '../web/v02/weekend/asset-upkeep.js';
import {GAME_DAY} from '../web/v02/weekend/biological-production.js';
import {PARKING_SITE} from '../web/v02/weekend/road-layout.js';
import {carDoor} from '../web/v02/weekend/town-trip.js';
import {vehiclePose,ARRIVAL_DURATION} from '../web/v02/weekend/arrival.js';
import {isBuildOption,buildingCategory} from '../web/v02/weekend/build-categories.js';

const def=PROJECTS.carport,{x,z}=PARKING_SITE;
assert(def&&def.fixedSite&&!def.repeatable,'one shelter on one site');
assert(isBuildOption('carport',def));assert.equal(buildingCategory(def),'Homes & shelter');
// Both parked cars stand inside the reserved site.
for(const index of [0,1]){
 const pose=vehiclePose(ARRIVAL_DURATION,index),cx=pose.x/2+32,cz=pose.z/2+32;
 assert(cx>x-.5+.4&&cx<x+def.size[0]-.5-.4&&cz>z-.5+.9&&cz<z+def.size[1]-.5-.9,`car ${index} fits under the roof`);
}

const s=createWeekend(42);chooseCamp(s,'entrance');enableFastNavigation(s);
s.money=50000;
assert.match(placementError(s,'carport',x+6,z+12),/parking clearing/,'only the parking site is accepted');
assert.match(placementError(s,'carport',x,z,null,1),/parking clearing/,'the roof cannot be turned');
assert.match(placementError(s,'shelter',x,z),/access road|arrival area/,'other buildings still keep the parking clear');
assert.equal(plan(s,'carport',x,z),'','planned over the parked cars');
const p=s.projects.find(p=>p.key==='carport');
assert(p,'project exists');
assert.match(plan(s,'carport',x,z),/Already planned/);
assert.match(moveProject(s,p.id,x+8,z+12),/cannot be moved/);
for(const index of [0,1])assert(route(s,s.stock,carDoor(index)),`car ${index} door stays reachable during construction`);
assert(!carsSheltered(s,PROJECTS),'an unfinished frame gives no cover');
assert(restore(save(s)),'planned shelter saves');

// Weathering in the open: thirty points a year, with no driving at all.
const open=createWeekend(7);chooseCamp(open,'entrance');
upkeep(open).automatic=false;
upkeepStep(open,PROJECTS,GAME_DAY*VEHICLE_WEATHER_DAYS.open/3);
assert(Math.abs(upkeep(open).vehicles[0].condition-90)<1e-6&&Math.abs(upkeep(open).vehicles[1].condition-90)<1e-6);

for(let i=0;i<400000&&p.work<def.work;i++)tick(s,.1);
assert(p.work>=def.work,'residents build the shelter');
assert(carsSheltered(s,PROJECTS));
for(const index of [0,1])assert(route(s,s.stock,carDoor(index)),`car ${index} door stays reachable under the roof`);
const saved=restore(save(s));assert(saved&&carsSheltered(saved,PROJECTS),'finished shelter restores');
upkeep(s).automatic=false;
const before=upkeep(s).vehicles.map(v=>v.condition);
upkeepStep(s,PROJECTS,GAME_DAY*VEHICLE_WEATHER_DAYS.open/3);
for(const [i,v] of upkeep(s).vehicles.entries())assert(Math.abs(before[i]-v.condition-10/3)<1e-6,'a roof cuts weathering to a third');
p.removal={mode:'demolish',work:0,required:100,status:'Demolishing'};
assert(!carsSheltered(s,PROJECTS),'a shelter being taken down gives no cover');
console.log('PASS car shelter: fixed parking site, resident construction, reachable car doors, slower weathering and saves');
