import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import init,{Game} from '../web/pkg/solar_friends.js';import {prepareSharedMap,sandboxFromSharedMap,scenarioFromSharedMap,mapPreviewDefinition,checkSharedMap} from '../web/editor/map-sharing.js';import {canonical} from '../web/editor/journal.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});const game=new Game(),copy=new Game();
try{
 const catalog=JSON.parse(game.scenario_catalog()),template=JSON.parse(game.scenario_template('sandbox')),validate=raw=>JSON.parse(game.validate_map_package(raw));
 const legacy=structuredClone(template);legacy.map=JSON.parse(game.generate_biome_property('mata-atlantica',27));delete legacy.map.biome;delete legacy.rules.weather;assert(JSON.parse(game.load_scenario(JSON.stringify(legacy))).ok);const before=game.snapshot(),original=canonical(legacy),prepared=prepareSharedMap(legacy,{catalog,defaultMap:template.map});assert.deepEqual(prepared.weather,catalog.weather);assert.equal(prepared.weather.intro_days,14);assert.equal(prepared.map.biome.id,'mata-atlantica');assert.equal(canonical(legacy),original);
 const resolved=structuredClone(legacy);resolved.map=prepared.map;resolved.rules.weather=prepared.weather;assert(JSON.parse(copy.load_scenario(JSON.stringify(resolved))).ok);const a=JSON.parse(before),b=JSON.parse(copy.snapshot());delete a.village.scenario;delete b.village.scenario;assert.equal(canonical(a),canonical(b),'Resolving an implicit legacy biome changed its opening world');
 const file=checkSharedMap({...prepared,title:'Land',description:'Only the land',author:'Author',validate});const bytes=canonical(file),content=scenarioFromSharedMap(file,template,validate);assert.deepEqual(content.credits,[{release:file.id,revision:1,author:'Author'}]);assert.equal(content.definition.start.buildings.length,0);assert.equal(content.definition.start.roads.length,0);assert.equal(content.definition.start.residents.length,5);content.definition.map.terrain[0].cover=.111;assert.equal(canonical(file),bytes);
 const full=structuredClone(file);full.credits=Array.from({length:16},(_,i)=>({release:'source-'+i,revision:1,author:'Author '+i}));assert.throws(()=>scenarioFromSharedMap(full,template,validate),/maximum source credits/);assert.equal(mapPreviewDefinition(full,template,validate).start.buildings.length,0);
 const explicit=structuredClone(legacy);explicit.map.biome={id:'caatinga',version:1};explicit.rules.weather={...catalog.weather,intro_days:7};assert.deepEqual(prepareSharedMap(explicit,{catalog,defaultMap:template.map}).weather,explicit.rules.weather);delete explicit.rules.weather;explicit.map.biome.version=999;assert.throws(()=>prepareSharedMap(explicit,{catalog,defaultMap:template.map}),/weather profile/);
 assert.equal(sandboxFromSharedMap(full,template,validate).credits.length,17);
 const shifted=structuredClone(file);
 shifted.map.camp=[33,33];
 const opening=sandboxFromSharedMap(shifted,template,validate);
 assert.deepEqual(opening.definition.start.buildings.map(({x,y})=>[x,y]),[[31,30],[37,30]]);
 assert.deepEqual(opening.definition.start.inventories,template.start.inventories);
 assert.deepEqual(opening.definition.map,shifted.map);
 assert(JSON.parse(copy.load_scenario(JSON.stringify(opening.definition))).ok);
 const edge=structuredClone(file);
 edge.map.camp=[56,32];
 const blocked=sandboxFromSharedMap(edge,template,validate);
 const previous=copy.snapshot();
 const invalid=JSON.parse(copy.load_scenario(JSON.stringify(blocked.definition)));
 assert.equal(invalid.ok,false);
 assert(invalid.issues.some(issue=>issue.code==='invalid_placement'));
 assert.equal(copy.snapshot(),previous);
 console.log('PASS: implicit legacy weather and exact physical worlds preserved; explicit weather retained; unsupported defaults rejected; independent scenario copies and source credits; overlong credit chains block reuse while preserving previews; Sandbox translates the starting layout and rejects invalid plots atomically.');
}finally{game.free();copy.free();}
