import assert from 'node:assert/strict';
import {mixedBuilderFixture} from './mixed-builder-fixture.mjs';
import {readFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {makeScenario} from '../web/dev/scenarios.js';
import {sampleFrame} from '../web/frame-state.js';
import {advanceSimulation} from '../web/simulation-speed.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const g=new Game(),copy=new Game();g.start_mode('story');const fresh=JSON.parse(g.snapshot());
assert(g.restore(await readFile('web/artwork/village-preview.json','utf8')));const village=JSON.parse(g.snapshot());
const scenes=['arrival','village','autonomy','climate-wet'].map(name=>[name,JSON.stringify(makeScenario(name,fresh,village))]);
const template=JSON.parse(g.scenario_template('sandbox'));template.map=JSON.parse(g.generate_biome_property('mata-atlantica',42));const {definition}=mixedBuilderFixture(g,template);assert(JSON.parse(g.load_scenario(JSON.stringify(definition))).ok);scenes.push(['mixed-custom',g.snapshot()]);
for(const [name,raw]of scenes){
 assert(g.restore(raw),name);assert(copy.restore(g.snapshot()));
 let view=JSON.parse(g.snapshot());
 for(let frame=0;frame<180;frame++){
  const speed=frame<90?1:16;
  advanceSimulation(g,1/60,speed);advanceSimulation(copy,1/60,speed);
  const before=g.snapshot(),full=JSON.parse(before),light=JSON.parse(g.frame_state());
  view=sampleFrame(g,view,frame%15===0);
  assert.equal(g.snapshot(),before,'Sampling must not change a resident, claim or random stream');
  assert.equal(copy.snapshot(),before,'Sampler leaves the simulation and exact reload continuation unchanged');
  for(const key of Object.keys(light.village).filter(k=>k!=='economy'))assert.deepEqual(view.village[key],full.village[key],`${name} ${key}`);
  assert.deepEqual(view.village.economy.sources,full.village.economy.sources);
  assert.deepEqual(view.residents,full.residents);
  assert.deepEqual(view.environment.weather.current,full.environment.weather.current);
  assert.deepEqual(view.environment.power,full.environment.power);
 }
}
g.free();copy.free();console.log('PASS: read-only frame samples agree with full authoritative state across 5 scenes including the 256-building/12-custom-resident fixture at 1x/16x; exact continuation unchanged.');
