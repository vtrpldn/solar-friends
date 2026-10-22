import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {createMapPackage,validateMapPackage,mapPackageFile} from '../web/map-package.js';
import {canonical} from '../web/editor/journal.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const game=new Game(),other=new Game();
try{
 const catalog=JSON.parse(game.scenario_catalog());assert.equal(catalog.map_packages.format,'solar-friends-map');const validate=raw=>JSON.parse(game.validate_map_package(raw));
 for(const biome of catalog.biomes){
  const d=JSON.parse(game.scenario_template('sandbox'));d.map={...JSON.parse(game.generate_biome_property(biome.id,27)),id:d.map.id};d.rules.weather=biome.weather;assert(JSON.parse(game.load_scenario(JSON.stringify(d))).ok);const before=game.snapshot(),mapBefore=canonical(d.map),weatherBefore=canonical(d.rules.weather);
  const file=createMapPackage({id:'land-'+biome.id,version:7,map:d.map,weather:d.rules.weather,title:'Shared '+biome.name,description:'An independent landscape',author:'João',validate});assert.equal(file.map.revision,7);assert.equal(file.content_revision,7);assert.equal(canonical(d.map),mapBefore);assert.equal(canonical(d.rules.weather),weatherBefore);assert.equal(game.snapshot(),before);assert.equal(file.start,undefined);assert.equal(file.residents,undefined);assert.equal(file.journal,undefined);assert.equal(file.map.terrain.length,4096);
  const exported=mapPackageFile(file,validate),reread=validateMapPackage(JSON.parse(exported),validate);assert.equal(canonical(reread),canonical(file));const copy=structuredClone(d);copy.map=reread.map;copy.rules.weather=reread.weather;assert(JSON.parse(other.load_scenario(JSON.stringify(copy))).ok);const a=JSON.parse(before),b=JSON.parse(other.snapshot());delete a.village.scenario;delete b.village.scenario;assert.equal(canonical(a),canonical(b),'Map sharing changed the physical opening world in '+biome.id);
  assert.equal(JSON.parse(game.load_scenario(exported)).ok,false);assert.equal(game.snapshot(),before,'A map package must not start a scenario implicitly');
  const unchanged=canonical(file);d.map.terrain[0].cover=.123;assert.equal(canonical(file),unchanged,'Map package follows mutable source');
  for(const key of ['game','ruleset','assets']){const future=structuredClone(file);future.compatibility[key]=999;assert.throws(()=>validateMapPackage(future,validate),/different game/);assert.equal(game.snapshot(),before);}
  const invalid=structuredClone(file);invalid.map.terrain[0].retention=99;assert.throws(()=>validateMapPackage(invalid,validate),/terrain grid/);const hidden=structuredClone(file);hidden.start={residents:[]};assert.throws(()=>validateMapPackage(hidden,validate),/unsupported fields/);const unresolved=structuredClone(file);delete unresolved.map.river;assert.throws(()=>validateMapPackage(unresolved,validate),/explicit river/);
 }
 assert.throws(()=>validateMapPackage({format:'solar-friends-map',schema:1,description:'x'.repeat(2*1024*1024)},()=>({ok:true})),/2 MiB/);assert.throws(()=>validateMapPackage({format:'solar-friends-map',schema:1}),/native land validation/);
 console.log('PASS: native-backed packages in all three biomes, exact physical worlds after export/import, explicit resolved land/weather, immutable sources, byte limits, all compatibility dimensions, hostile-field rejection and no implicit scenario loading.');
}finally{game.free();other.free();}
