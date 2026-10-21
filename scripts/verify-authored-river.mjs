import {drawGroundWeather} from '../web/weather.js';
import {riverBank,hydroSite} from '../web/terrain.js';
import {habitatAt} from '../web/habitats.js';
import {riverStroke} from '../web/editor/brush.js';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const game=new Game(),other=new Game();
try{
 const initial=JSON.parse(game.scenario_template('sandbox'));
 const drawn=riverStroke(initial.map.river,[[12,10],[14,20],[12,30]]);
 assert.equal(drawn.centers[10],12);assert.equal(drawn.centers[20],14);assert.equal(drawn.centers[30],12);
 assert(drawn.centers.every((x,i)=>i===0||Math.abs(x-drawn.centers[i-1])<=1));
 const straight={schema:1,centers:Array(64).fill(20)};
 for(const river of [initial.map.river,null,straight,drawn]){
  const d=structuredClone(initial);d.map.river=river;if(d.map.nature)d.map.nature=d.map.nature.filter(p=>!riverBank(Math.floor(p.x),Math.floor(p.y),d.map));
  assert.equal(JSON.parse(game.load_scenario(JSON.stringify(d))).ok,true);
  const geometry=JSON.parse(game.world_geometry()),report=JSON.parse(game.land_report());
  const bank=new Set(geometry.banks.map(p=>p.join(',')));
  assert.equal(report.cells.length,4096-bank.size);
  const hydro=new Set(geometry.hydro_sites.map(p=>p.join(',')));
  for(let y=0;y<64;y++)for(let x=0;x<64;x++){assert.equal(bank.has(`${x},${y}`),riverBank(x,y,d.map));assert.equal(hydro.has(`${x},${y}`),hydroSite(x,y,d.map));}
  for(const cell of report.cells)assert.equal(habitatAt(d.map.seed,cell.x,cell.y,d.map),cell.ground.biome);
  assert.equal(game.toggle_road(61,10)==='ok',!riverBank(61,10,d.map));
  if(river===straight){assert.notEqual(game.toggle_road(20,10),'ok');assert.equal(game.place('hydro',19,10),'ok');}
  else if(!river){assert.equal(geometry.hydro_sites.length,0);assert.notEqual(game.place('hydro',61,10),'ok');}
  for(let n=0;n<8;n++)game.tick(.25);
  const snapshot=game.snapshot();assert(other.restore(snapshot));assert.equal(other.snapshot(),snapshot);
 }
 const context=new Proxy({createRadialGradient:()=>({addColorStop(){}})}, {get:(target,key)=>target[key]||(()=>{})});
 const weather={conditions:{wet:.8,rain:1},buildings:[],project:(x,y)=>({x,y}),scale:1,time:1,reducedMotion:false};
 assert.equal(drawGroundWeather(context,{...weather,map:{river:null}}).ripples,0);
 assert(drawGroundWeather(context,{...weather,map:{river:straight}}).ripples>0);
 const legacy=structuredClone(initial);delete legacy.map.river;
 assert.equal(JSON.parse(game.load_scenario(JSON.stringify(legacy))).ok,true);
 assert.equal(JSON.parse(game.world_geometry()).river.centers.length,64);
 const before=game.snapshot();initial.map.river={schema:17,centers:Array(64).fill(20)};
 assert.equal(JSON.parse(game.load_scenario(JSON.stringify(initial))).ok,false);assert.equal(game.snapshot(),before);
 console.log('PASS WASM authored river masks, native land reports, roads, hydro, ticking, exact checkpoints, omitted-field compatibility and atomic unsupported-version rejection.');
}finally{game.free();other.free();}
