import {MATERIAL_KEYS} from '../web/materials.js';
import {unlockStory} from './story-fixture.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import init, { Game } from '../web/pkg/solar_friends.js';
import { advanceGame } from '../web/dev/scenarios.js';
import { buildingLighting, lightingLayers, powerConnections } from '../web/power.js';
import {withAuthoredElectricalCircuits} from '../web/dev/electrical-fixture.js';

await init({module_or_path: await readFile(new URL('../web/pkg/solar_friends_bg.wasm', import.meta.url))});
const g=new Game(), legacy=JSON.parse(await readFile(new URL('../web/artwork/village-preview.json',import.meta.url),'utf8'));
const snapshot=()=>JSON.parse(g.snapshot());
const restore=state=>assert(g.restore(JSON.stringify(state)));
legacy.village.minutes=1260;
const fixture=withAuthoredElectricalCircuits(legacy);
restore(fixture);
const initial=snapshot().environment.power;
assert.equal(initial.generation,0);
assert.equal(initial.capacity,36);
assert.equal(initial.grid_level,1);
advanceGame(g,60);
assert(Math.abs(snapshot().environment.power.stored-(28-initial.demand))<.002);

const lamp=fixture.village.buildings.find(b=>b.kind==='streetlight').id;
assert(g.set_power_enabled(lamp,false));
assert(g.set_power_enabled(lamp,false));
assert.equal(snapshot().village.power.disabled.length,1);
assert(Math.abs(snapshot().environment.power.demand-initial.demand+.1)<.001);
assert.equal(buildingLighting(snapshot().environment.power,lamp,'streetlight'),0);
assert.equal(g.set_power_enabled(999,false),false);
assert.equal(g.set_power_enabled(fixture.village.buildings.find(b=>b.kind==='home').id,false),false);
const switched=g.snapshot(); assert(g.restore(switched)); assert.equal(g.snapshot(),switched);
assert(g.set_power_enabled(lamp,true));

const empty=structuredClone(fixture),power=empty.village.power;
let remaining=.01;
for(const n of power.network.nodes)if(n.kind!=='roof'&&n.capacity>0){n.charge=Math.min(remaining,n.capacity);remaining-=n.charge;}
power.stored=.01;power.network.account={opening:power.network.nodes.reduce((sum,n)=>sum+n.charge,0),generated:0,consumed:0,curtailed:0,discharged:0};
restore(empty);advanceGame(g,1);
let p=snapshot().environment.power;
assert.equal(p.stored,0);assert.equal(p.grid_level,0);
for(const c of p.connections) {
  if(c.source==='grid')assert.equal(c.light_level,0);
  if(c.source==='roof')assert.equal(c.light_level,1);
}
// The same depleted village recovers at dawn, fills in daylight, and survives
// the next complete night without requiring a fresh fixture or player reset.
advanceGame(g,600);assert(snapshot().environment.power.stored>0);
advanceGame(g,660);assert(snapshot().environment.power.stored>30);
advanceGame(g,720);assert(snapshot().environment.power.stored>0);
assert(g.restore(g.snapshot()));

delete legacy.village.power;restore(legacy);
assert.equal(snapshot().village.power.stored,0);assert.deepEqual(snapshot().village.power.disabled,[]);
assert.equal(snapshot().village.pipes.lines.length,0,'Legacy authoring does not invent installed cables');
const farm=legacy.village.buildings.find(b=>b.kind==='solar_farm');
farm.progress=0;legacy.village.minutes=720;legacy.village.economy.projects=[{building:farm.id,recipe:'standard',priority:1,paused:false,stage:0,labour:0,committed:false,reserved:Array(MATERIAL_KEYS.length).fill(0),consumed:Array(MATERIAL_KEYS.length).fill(0)}];restore(legacy);
p=snapshot().environment.power;assert(p.capacity===0);assert(p.generation===0);assert.equal(p.grid_level,0);

// Construction uses the public placement API and reserves mixed materials without charging for the blueprint.
const fresh=new Game(), start=JSON.parse(fresh.snapshot()).village.wood;
unlockStory(fresh);
assert.equal(fresh.place('solar_farm',5,5),'ok');
assert.equal(fresh.place('streetlight',10,5),'ok');
assert.equal(JSON.parse(fresh.snapshot()).village.wood,start);
assert(JSON.parse(fresh.snapshot()).environment.power.capacity===0);
fresh.free();g.free();

// Cancelling an early project must keep every later lighting control attached
// to its persistent building identity, including after a second cancellation.
const gaps=new Game();unlockStory(gaps);
assert.equal(gaps.place('home',5,5),'ok');assert.equal(gaps.place('greenhouse',10,5),'ok');assert.equal(gaps.place('streetlight',15,5),'ok');
assert.equal(gaps.cancel_project(0),'ok');
let connections=powerConnections(JSON.parse(gaps.snapshot()));
assert.deepEqual(connections.map(c=>[c.id,c.building.id,c.building.kind]),[[1,1,'greenhouse'],[2,2,'streetlight']]);
assert.equal(gaps.cancel_project(2),'ok');
connections=powerConnections(JSON.parse(gaps.snapshot()));assert.deepEqual(connections.map(c=>c.building.kind),['greenhouse']);
assert(gaps.restore(gaps.snapshot()));gaps.free();

// An outage must never draw the baked, illuminated night texture. Check the
// source-over opacity across the entire dusk/dawn blend, including ghosts.
for(const night of [0,.2,.5,.9,1])for(const level of [0,.25,.5,1])for(const alpha of [.45,1]){
  const layers=lightingLayers(night,level,alpha);
  if(level===0)assert(layers.every(l=>l.source==='day'));
  let opacity=0,lit=0;
  for(const layer of layers){
    assert(layer.alpha>0 && layer.alpha<=1);
    opacity=layer.alpha+opacity*(1-layer.alpha);
    lit=lit*(1-layer.alpha)+(layer.source==='night'?layer.alpha:0);
  }
  assert(Math.abs(opacity-alpha)<1e-10);
  assert(Math.abs(lit-alpha*night*level)<1e-10);
}
assert.equal(buildingLighting(initial,lamp,'streetlight',false),0);
console.log('PASS: power charging, full-night supply, depletion and dawn recovery, switches, migration, construction costs, and outage render layers.');
