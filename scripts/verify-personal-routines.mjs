import {restockFixtureWater} from '../web/dev/material-fixture.js';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const game=new Game();
try{
 const baseline=JSON.parse(game.snapshot()),catalog=JSON.parse(game.scenario_catalog()).resident_routines;
 assert.equal(baseline.village.version,39);assert.equal(catalog.hobbies.length,4);assert.deepEqual(catalog.bedtime,{earliest:1200,latest:1410,step:15});
 assert.deepEqual(baseline.residents.map(r=>r.routine_preferences.preferred_bedtime),[1290,1335,1260,1380,1305]);
 for(const [minute,expected]of [[480,'stretch'],[720,'birdwatch']]){
  const d=structuredClone(baseline);d.village.minutes=minute;d.village.arrived=true;
  for(const r of d.residents)Object.assign(r,{task:'idle',remaining:0,energy:60,hunger:10,social:90,target_x:r.x,target_y:r.y});
  d.residents[0].routine_preferences={preferred_bedtime:1380,favourite_hobby:'stretch',alternate_hobby:'birdwatch'};
  d.village.water=75;restockFixtureWater(d);
  assert(game.restore(JSON.stringify(d)));game.tick(.25);const current=JSON.parse(game.snapshot()),person=current.residents.find(r=>r.id===0);
  assert.equal(person.task,expected,person.reason);assert.equal(person.sleep.bedtime,1380);
  const saved=game.snapshot(),copy=new Game();assert(copy.restore(saved));assert.equal(copy.snapshot(),saved);copy.free();
 }
 const before=game.snapshot(),old=JSON.parse(before);old.village.version=33;for(const r of old.residents)delete r.routine_preferences;
 assert(game.restore(JSON.stringify(old)));const migrated=JSON.parse(game.snapshot());assert.deepEqual(migrated.residents.map(r=>r.routine_preferences),baseline.residents.map(r=>r.routine_preferences));
 for(const r of migrated.residents){const previous=JSON.parse(before).residents.find(p=>p.id===r.id);assert.deepEqual(r.sleep,previous.sleep);assert.equal(r.energy,previous.energy);assert.equal(r.hunger,previous.hunger);}
 console.log('PASS native routine catalog, original founding preferences, real preferred/alternate hobby choices, personal energy-adjusted bedtime, exact saves and legacy preference migration without resetting runtime sleep/needs.');
}finally{game.free();}
