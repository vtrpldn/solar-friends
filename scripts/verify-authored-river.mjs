import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const game=new Game(),other=new Game();
try{
 const initial=JSON.parse(game.scenario_template('sandbox'));
 for(const river of [null,{schema:1,centers:Array(64).fill(20)}]){
  const d=structuredClone(initial);d.map.river=river;
  assert.equal(JSON.parse(game.load_scenario(JSON.stringify(d))).ok,true);
  const geometry=JSON.parse(game.world_geometry()),report=JSON.parse(game.land_report());
  const bank=new Set(geometry.banks.map(p=>p.join(',')));
  assert.equal(report.cells.length,4096-bank.size);
  for(let y=0;y<64;y++)for(let x=0;x<64;x++)assert.equal(bank.has(`${x},${y}`),river!==null&&Math.abs(x-20)<=2.3);
  assert.equal(game.toggle_road(61,10),'ok');
  if(river){assert.notEqual(game.toggle_road(20,10),'ok');assert.equal(game.place('hydro',19,10),'ok');}
  else{assert.equal(geometry.hydro_sites.length,0);assert.notEqual(game.place('hydro',61,10),'ok');}
  for(let n=0;n<8;n++)game.tick(.25);
  const snapshot=game.snapshot();assert(other.restore(snapshot));assert.equal(other.snapshot(),snapshot);
 }
 const legacy=structuredClone(initial);delete legacy.map.river;
 assert.equal(JSON.parse(game.load_scenario(JSON.stringify(legacy))).ok,true);
 assert.equal(JSON.parse(game.world_geometry()).river.centers.length,64);
 const before=game.snapshot();initial.map.river={schema:17,centers:Array(64).fill(20)};
 assert.equal(JSON.parse(game.load_scenario(JSON.stringify(initial))).ok,false);assert.equal(game.snapshot(),before);
 console.log('PASS WASM authored river masks, native land reports, roads, hydro, ticking, exact checkpoints, omitted-field compatibility and atomic unsupported-version rejection.');
}finally{game.free();other.free();}
