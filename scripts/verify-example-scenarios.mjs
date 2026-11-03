import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const game=new Game(),copy=new Game();
try{
 const raw=await readFile('web/examples/first-clearing.solar-scenario','utf8'),d=JSON.parse(raw);
 assert.equal(d.title,'First clearing');assert.equal(d.map.biome.id,'mata-atlantica');assert.equal(d.map.terrain.length,4096);
 assert.equal(d.journal.chapters.length,4);assert.equal(d.journal.chapters.flatMap(c=>c.goals).filter(g=>g.optional).length,1);
 assert.deepEqual(d.journal.chapters[2].goals[0].condition,{kind:'harvests',count:2,credit:'run'});
 assert.deepEqual(d.journal.chapters[3].goals[0].condition,{kind:'maintain',outcome:'pantry',minutes:60});
 assert(d.rules.logistics&&d.rules.market&&d.rules.utilities&&d.rules.climate);assert.equal(d.journal.challenge,undefined);
 assert(JSON.parse(game.validate_scenario(raw)).ok);assert(JSON.parse(game.load_scenario(raw)).ok);
 const journal=JSON.parse(game.scenario_journal());assert.equal(journal.finished_at,null);assert.equal(journal.chapters[0].goals[0].status,'active');assert.equal(journal.chapters[1].goals[0].status,'locked');
 const before=game.snapshot();game.tick(0);assert.equal(game.snapshot(),before);assert(copy.restore(before));assert.equal(copy.snapshot(),before);
 const dry=JSON.parse(await readFile('web/examples/before-the-dry-season.solar-scenario','utf8'));
 assert.equal(dry.map.biome.id,'cerrado');assert.equal(dry.rules.weather.season_days,7);assert.equal(dry.rules.weather.intro_days,0);assert.equal(dry.journal.challenge.deadline,7*1440);
 assert.deepEqual(dry.start.residents.map(p=>p.name),['Iara','Bento','Luz','Cauã','Nina']);assert(dry.start.residents.every(p=>!p.appearance||p.appearance.schema!==2));
 assert.deepEqual(dry.journal.chapters[2].goals[0].condition,{kind:'service',service:'fresh_water',minimum:60,minutes:120});
 assert(JSON.parse(game.validate_scenario(JSON.stringify(dry))).ok);assert(JSON.parse(game.load_scenario(JSON.stringify(dry))).ok);const dryOpening=game.snapshot();assert(copy.restore(dryOpening));assert.equal(copy.snapshot(),dryOpening);assert.equal(JSON.parse(game.scenario_journal()).finished_at,null);
 const inherited=JSON.parse(await readFile('web/examples/an-inherited-village.solar-scenario','utf8'));assert.equal(inherited.map.biome.id,'caatinga');assert.equal(inherited.start.buildings.length,12);assert(inherited.start.buildings.every(b=>b.state==='completed'));assert.equal(inherited.start.routes.length,6);assert.equal(inherited.start.equipment.filter(e=>e.condition===0).length,3);assert.equal(inherited.start.fresh_water,100);assert.deepEqual(inherited.start.residents.map(p=>p.name),['Iara','Bento','Nina','Luz','Cauã']);assert(inherited.start.residents.every(p=>!p.appearance||p.appearance.schema!==2));assert(JSON.parse(game.load_scenario(JSON.stringify(inherited))).ok);assert.equal(JSON.parse(game.scenario_journal()).finished_at,null);const inheritedOpening=game.snapshot();assert(copy.restore(inheritedOpening));assert.equal(copy.snapshot(),inheritedOpening);
 console.log('PASS: exported player-authored First clearing and Before the dry season compile with all core simulation rules, ordered/optional goals, real-run harvest credit, sustained pantry requirement, pause and exact opening restoration. Cerrado authored founding cast, water-reserve semantics and compressed deadline verified; Caatinga inherited structures/routes, failed equipment and authored cast verified. Completion is checked separately.');
}finally{game.free();copy.free();}
