import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import init, { Game } from '../web/pkg/solar_friends.js';
import { advanceGame } from '../web/dev/scenarios.js';
import { buildingLighting, lightingLayers } from '../web/power.js';

await init({module_or_path: await readFile(new URL('../web/pkg/solar_friends_bg.wasm', import.meta.url))});
const g=new Game(), fixture=JSON.parse(await readFile(new URL('../web/artwork/village-preview.json',import.meta.url),'utf8'));
const snapshot=()=>JSON.parse(g.snapshot());
const restore=state=>assert(g.restore(JSON.stringify(state)));
fixture.village.minutes=1260;
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

fixture.village.power.stored=.01;restore(fixture);advanceGame(g,1);
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

delete fixture.village.power;restore(fixture);
assert.deepEqual(snapshot().village.power,{stored:0,disabled:[]});
const farm=fixture.village.buildings.find(b=>b.kind==='solar_farm');
farm.progress=0;fixture.village.minutes=720;fixture.village.economy.projects=[{building:farm.id,recipe:'standard',priority:1,paused:false,stage:0,labour:0,committed:false,reserved:Array(15).fill(0),consumed:Array(15).fill(0)}];restore(fixture);
p=snapshot().environment.power;assert.equal(p.capacity,0);assert.equal(p.generation,0);assert.equal(p.grid_level,0);

// Construction uses the public placement API and reserves mixed materials without charging for the blueprint.
const fresh=new Game(), start=JSON.parse(fresh.snapshot()).village.wood;
assert.equal(fresh.place('solar_farm',5,5),'ok');
assert.equal(fresh.place('streetlight',10,5),'ok');
assert.equal(JSON.parse(fresh.snapshot()).village.wood,start);
assert.equal(JSON.parse(fresh.snapshot()).environment.power.capacity,0);
fresh.free();g.free();

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
