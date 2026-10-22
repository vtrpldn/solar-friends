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
 console.log('PASS: exported player-authored First clearing compiles with all core simulation rules, ordered/optional goals, real-run harvest credit, sustained pantry requirement, pause and exact opening restoration. Full completion/balance remains unverified.');
}finally{game.free();copy.free();}
