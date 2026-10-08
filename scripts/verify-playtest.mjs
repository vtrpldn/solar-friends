import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {goalRoute} from '../web/quests.js';
import {buildingArtKey} from '../web/building-art.js';
import {clampZoom,zoomLimits} from '../web/projection.js';
import {powerConnections,unlitFilter,lightingLayers} from '../web/power.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const g=new Game(),snapshot=()=>JSON.parse(g.snapshot());
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
