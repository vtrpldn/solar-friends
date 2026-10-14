import {resetMaterialLocations} from '../web/dev/material-fixture.js';
import {unlockStory} from './story-fixture.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {goalRoute} from '../web/quests.js';
import {buildingArtKey} from '../web/building-art.js';
import {residentActivity} from '../web/resident-animation.js';
import {riverBank} from '../web/terrain.js';
import {clampZoom,zoomLimits} from '../web/projection.js';
import {powerConnections,unlitFilter,lightingLayers} from '../web/power.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const g=new Game(),snapshot=()=>JSON.parse(g.snapshot());
unlockStory(g);
assert.equal(g.place('home',8,8),'ok');assert.equal(g.place('home',12,8),'ok');assert.equal(g.place('greenhouse',16,8),'ok');
let s=snapshot();const appearance=s=>buildingArtKey(s.village.buildings.find(b=>b.id===1),s.village.buildings,s.village.economy.projects);
assert.equal(appearance(s),'home-veranda');assert.equal(g.cancel_project(0),'ok');s=snapshot();assert.equal(appearance(s),'home-veranda');
assert.equal(buildingArtKey({kind:'home'},s.village.buildings,s.village.economy.projects),'home-gable');
assert.equal(goalRoute(s,{build:'home',target:1}).type,'project');assert.equal(goalRoute(s,{build:'home',target:1}).id,1);
assert.equal(goalRoute(s,{build:'well',target:1}).type,'plan');assert.equal(goalRoute(s,{action:'supper'}).type,'supper');
assert.deepEqual(powerConnections(s).map(c=>[c.id,c.building.kind]),[[2,'greenhouse']]);
const saved=g.snapshot();assert(g.restore(saved));assert.equal(appearance(snapshot()),'home-veranda');
const bad=JSON.parse(saved);bad.village.economy.projects[0].appearance=7;assert(!g.restore(JSON.stringify(bad)));assert.equal(g.snapshot(),saved);
assert.equal(g.configure_project(1,1,false,'local'),'ok');assert.equal(appearance(snapshot()),'home-veranda');
g.free();
const garden=new Game();assert.equal(garden.place('garden',8,8),'ok');
for(let i=0;i<8000&&JSON.parse(garden.snapshot()).village.buildings[0].progress<100;i++)garden.tick(.25);
s=JSON.parse(garden.snapshot());assert.equal(s.village.buildings[0].progress,100);assert.deepEqual(goalRoute(s,{build:'garden',target:1}),{type:'visit',id:0});garden.free();
assert.equal(lightingLayers(1,0)[0].filter,unlitFilter(1));
console.log('PASS: persistent home appearance, cancellation identities, actionable goal routes, completed-garden visits, malformed-style save rejection and shared unlit rendering.');

for(const [w,h] of [[848,1328],[1024,768],[1440,900],[1920,1080]]){
  const z=clampZoom(w,h,-100),range=zoomLimits(w,h),first=Math.max(.45,range.base*z),next=Math.max(.45,range.base*clampZoom(w,h,z+.15));
  assert(next>first,'A zoom-in click after the widest view must visibly magnify the map');
  assert.equal(clampZoom(w,h,100),range.max);assert.equal(clampZoom(w,h,z-.15),z);
}
console.log('PASS: desktop zoom limits have no invisible range or extra recovery clicks.');

const materials=new Game();unlockStory(materials);for(let i=0;i<600&&!JSON.parse(materials.snapshot()).village.arrived;i++)materials.tick(.25);
assert.equal(materials.place_source(2,5,5),'ok');assert.equal(materials.place('garden',8,8),'ok');assert.equal(materials.place('solar_farm',16,8),'ok');let fixture=JSON.parse(materials.snapshot());
fixture.village.minutes=540;fixture.village.food=80;fixture.village.meals=10;fixture.village.water=100;fixture.village.economy.stock[2]=0;fixture.village.economy.stock[3]=0;
for(const p of fixture.village.economy.projects){p.reserved[2]=0;p.reserved[3]=0;}
for(const r of fixture.residents){r.task='idle';r.remaining=0;r.requested=false;r.energy=90;r.hunger=20;r.social=90;r.last_meal_slot=0;r.target_x=r.x;r.target_y=r.y;}
assert(materials.restore(JSON.stringify(resetMaterialLocations(fixture))));
materials.tick(.25);let workers=JSON.parse(materials.snapshot()).residents.filter(r=>r.task==='source');
assert.equal(workers.length,1,'A material batch has one claimed work position, chosen from all residents');
for(const r of workers){assert.equal(r.task,'source');assert(!riverBank(r.target_x,r.target_y),'Collection destinations must remain on land');assert.equal(residentActivity({...r,x:r.target_x,y:r.target_y,sourceMaterial:2},540),'tend');}
assert.equal(new Set(workers.map(r=>r.activity_material)).size,workers.length,'No extraction batch can have duplicate workers');
for(let i=0;i<800;i++)materials.tick(.25);const materialState=JSON.parse(materials.snapshot());assert(materialState.village.economy.sources[0].remaining<140);assert(materials.restore(materials.snapshot()));materials.free();
console.log('PASS: source workers reach land, claim distinct batches, actually collect materials and use the digging pose.');
