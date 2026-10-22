import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {makeScenario,advanceGame} from '../web/dev/scenarios.js';
import {withAuthoredElectricalCircuits} from '../web/dev/electrical-fixture.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const game=new Game(),fresh=JSON.parse(game.snapshot());
assert(game.restore(await readFile(new URL('../web/artwork/village-preview.json',import.meta.url),'utf8')));
const established=JSON.parse(game.snapshot()),original=JSON.stringify({fresh,established});
for(const name of ['night','power','power-outage','circular-night','art-night']){
  const prepared=makeScenario(name,fresh,established);assert.equal(prepared.village.version,45);
  assert.equal(JSON.stringify({fresh,established}),original,'Preview authoring preserves the original villages');
  assert(game.restore(JSON.stringify(prepared)));
  let s=JSON.parse(game.snapshot());const lines=s.village.pipes.lines;
  assert(lines.length>0);assert(lines.every(p=>p.plan.kind==='electricity'&&p.phase==='active'));
  for(const p of lines)for(let i=0;i<p.kit.length;i++)assert.equal(p.spent[i][1]-p.spent[i][0],p.kit[i],'Installed preview parts retain their material spending intervals');
  assert(s.environment.power.connections.filter(c=>c.source==='grid'&&c.enabled).every(c=>c.connected),'Night scenes use real local circuits');
  assert(s.village.power.network.nodes.every(n=>n.equipment===0),'Free preview buildings cannot return paid battery equipment');
  assert(JSON.parse(game.simulation_report()).materials.every(m=>m.difference===0));
  if(name==='power-outage'){
    advanceGame(game,1);s=JSON.parse(game.snapshot());
    assert.equal(s.environment.power.stored,0);
    assert(s.environment.power.connections.filter(c=>c.source==='grid').every(c=>c.light_level===0));
    assert(s.environment.power.connections.filter(c=>c.source==='roof').every(c=>c.light_level===1));
  }else{
    assert(s.environment.power.connections.filter(c=>c.source==='grid'&&c.enabled).every(c=>c.light_level>.99));
    advanceGame(game,.75);
  }
  const exact=game.snapshot();assert(game.restore(exact));assert.equal(game.snapshot(),exact);
}
const raw=structuredClone(fresh);assert.equal(raw.village.pipes.lines.length,0);
const input=JSON.stringify(raw);withAuthoredElectricalCircuits(raw);assert.equal(JSON.stringify(raw),input);
assert.equal(makeScenario('arrival',fresh,established).village.pipes.lines.length,0,'The real new game receives no invented cables');
game.free();console.log('PASS: five authored night/power scenes use accounted local cables, private roofs and exact saves; fresh Story receives no installed network.');
