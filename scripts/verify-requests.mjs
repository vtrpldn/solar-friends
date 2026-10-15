import {restockFixtureFood} from '../web/dev/material-fixture.js';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
await mkdir('artifacts/requests',{recursive:true});
const snap=g=>JSON.parse(g.snapshot());
const person=(g,id=0)=>snap(g).residents.find(r=>r.id===id);
function scene(){
  const g=new Game(),s=snap(g);
  Object.assign(s.village,{arrived:true,minutes:540,food:80,meals:10,water:40});
  for(const r of s.residents)Object.assign(r,{task:'idle',remaining:90,energy:90,hunger:10,social:90,last_meal_slot:0,x:10+(r.id-2)*1.25,y:13,target_x:10+(r.id-2)*1.25,target_y:13});
  assert(g.restore(JSON.stringify(restockFixtureFood(s))));return g;
}
function until(g,test){for(let n=0;n<12000;n++){if(test(snap(g)))return;g.tick(.25);}throw Error('Saved helping request failed to progress: '+g.snapshot());}
function checkpoint(g){const saved=g.snapshot(),copy=new Game();assert(copy.restore(saved));assert.equal(copy.snapshot(),saved);copy.free();}
const g=scene();assert.match(g.request(0,'gather',false),/Happy/);
const accepted=g.snapshot(),id=person(g).help.id;
assert.match(g.request(0,'gather',false),/already accepted/);assert.equal(g.snapshot(),accepted);
await writeFile('artifacts/requests/accepted.json',accepted);
until(g,s=>s.residents[0].help.phase==='working');checkpoint(g);
await writeFile('artifacts/requests/working.json',g.snapshot());
for(let n=0;n<8;n++)g.tick(.25);
// Force a need to isolate the real interruption and resumption path.
const tired=snap(g);tired.residents[0].energy=20;assert(g.restore(JSON.stringify(tired)));g.tick(.25);
assert.equal(person(g).task,'rest');assert.equal(person(g).help.phase,'paused');assert(person(g).help.remaining>0&&person(g).help.remaining<10);
await writeFile('artifacts/requests/rest.json',g.snapshot());checkpoint(g);
until(g,s=>s.residents[0].help.phase==='complete');assert.equal(person(g).help.id,id);assert.equal(snap(g).village.supplies.gathered,2);
await writeFile('artifacts/requests/complete.json',g.snapshot());checkpoint(g);
const cancelled=scene();cancelled.request(0,'gather',false);assert.equal(cancelled.cancel_help(0),'ok');assert.equal(person(cancelled).help.phase,'cancelled');checkpoint(cancelled);
const build=scene();assert.equal(build.place('garden',18,18),'ok');assert.match(build.request(0,'build',false),/Happy/);
until(build,s=>s.village.logistics.shipments.some(h=>h.resident===0&&h.carrying));
assert(person(build).requested);checkpoint(build);
const owned=snap(build).environment.economy.materials.map(m=>m.stored);
assert.equal(build.cancel_help(0),'ok');assert.deepEqual(snap(build).environment.economy.materials.map(m=>m.stored),owned);checkpoint(build);
assert(JSON.parse(build.simulation_report()).materials.every(m=>m.difference===0));
for(const game of [g,cancelled,build])game.free();
console.log('PASS: accepted helping requests travel, preserve partial work through rest, complete once, deduplicate without allocating, persist exact checkpoints and recover carried materials on cancellation.');
