import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import init,{Game} from '../web/pkg/solar_friends.js';
const output=process.argv[2]??'artifacts/navigation-overlay-native-v1';await mkdir(output,{recursive:true});await init({module_or_path:await readFile('web/pkg/solar_friends_bg.wasm')});
const game=new Game(),results=[];
try{
 for(const biome of ['mata-atlantica','cerrado','caatinga'])for(const river of [false,true]){
  const d=JSON.parse(game.scenario_template('sandbox'));d.map=JSON.parse(game.generate_biome_property(biome,42));d.map.nature=[];d.map.river=river?{schema:1,centers:Array.from({length:64},(_,y)=>20+Math.floor(y/8)%2)}:null;
  for(const [x,y]of [[40,40],[43,40],[46,40],[40,43],[46,43],[40,46],[43,46],[46,46]])d.start.buildings.push({id:`access-home-${x}-${y}`,kind:'home',x,y,state:'completed',recipe:'standard',appearance:null});
  assert(JSON.parse(game.load_scenario(JSON.stringify(d))).ok);const before=game.snapshot(),access=JSON.parse(game.navigation_overlay());assert.equal(access.cells.length,4096);assert(access.origin_clear);
  const counts={blocked:0,connected:0,disconnected:0};
  for(const cell of access.cells){const quote=JSON.parse(game.route_quote(...access.origin,cell.x,cell.y));assert.equal(cell.reachable,quote.route!==null,`${biome}/${river?'river':'dry'}: route disagreement at ${cell.x},${cell.y}`);assert(!cell.reachable||cell.walkable);counts[!cell.walkable?'blocked':cell.reachable?'connected':'disconnected']++;}
  assert.equal(game.snapshot(),before,'Navigation inspection mutated the village');assert(counts.blocked>0&&counts.connected>0);if(river)assert(counts.disconnected>0);
  const file=`${biome}-${river?'river':'dry'}.solar-scenario`,raw=JSON.stringify(d);await writeFile(output+'/'+file,raw);results.push({biome,river,file,sha256:createHash('sha256').update(raw).digest('hex'),cells:4096,counts,snapshotUnchanged:true});
 }
 const sources={};for(const file of ['web/pkg/solar_friends_bg.wasm','src/navigation.rs','src/world.rs','scripts/verify-navigation-overlay.mjs'])sources[file]=createHash('sha256').update(await readFile(file)).digest('hex');await writeFile(output+'/report.json',JSON.stringify({schema:1,sources,results,scope:'Every cell centre in six native-compiled fixtures: three biomes, river-free and stepped dividing river, eight extra completed home obstacles. Compare overlay connectivity with actual native route quotes and require exact snapshot immutability. This does not enumerate all authored geometries or fractional endpoints.'},null,2)+'\n');console.log('PASS: all 24576 cell-centre connectivity flags match real native route quotes across six fixtures; inspection leaves every village exact.');
}finally{game.free();}
