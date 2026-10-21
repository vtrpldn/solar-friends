import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {makeScenario,advanceGame} from '../web/dev/scenarios.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const g=new Game(),snap=()=>JSON.parse(g.snapshot());
assert(g.set_simulation_seed(42));const fresh=snap();
assert.equal(g.place('garden',5,5),'ok');
for(let tick=0;tick<2000&&snap().village.buildings[0].progress<100;tick++)g.tick(.25);
assert.equal(snap().village.buildings[0].progress,100,'Real resident construction completes');
const before=g.snapshot(),report=JSON.parse(g.simulation_report());g.dev_inspect();assert.equal(g.snapshot(),before,'Inspection is read-only');
assert(report.materials.every(m=>m.difference===0),'Real construction conserves the material account');
const observed=snap().village.minutes-480;
for(const row of Object.values(report.days[0].residents))assert(Math.abs(row.reduce((sum,n)=>sum+n,0)-observed)<.001);
assert(!g.set_simulation_seed(99));assert.equal(report.seed,42);
const restored=new Game();assert(restored.restore(before));assert.equal(restored.snapshot(),before);
advanceGame(g,60);advanceGame(restored,60);assert.equal(restored.snapshot(),g.snapshot());
const v=snap().village,bed=v.buildings[0];
assert.equal(g.queue_building_work(bed.id,'move',8,5),'ok');
const id=snap().village.building_jobs[0].id;assert(Number.isInteger(id)&&id>0);
assert.equal(g.cancel_building_work(bed.id),'ok');assert.equal(g.queue_building_work(bed.id,'salvage',0,0),'ok');
assert(snap().village.building_jobs[0].id>id,'Cancelled identities are never reused');
assert(g.restore(g.snapshot()));
assert(g.restore(await readFile(new URL('../web/artwork/village-preview.json',import.meta.url),'utf8')));
const established=snap();await mkdir('artifacts/simulation',{recursive:true});
const baselines=['sim-compact','sim-spread','sim-poor','sim-blocked','sim-balanced'];
let compact;
for(const name of baselines){
 const fixture=makeScenario(name,fresh,established);
 assert(g.restore(JSON.stringify(fixture)),name);
 if(name==='sim-compact')compact=snap();
 if(name==='sim-spread'){
  assert.deepEqual(snap().village.economy.stock,compact.village.economy.stock);
  assert.deepEqual(snap().village.buildings.map(b=>b.kind),compact.village.buildings.map(b=>b.kind));
  assert.equal(snap().village.simulation.seed,compact.village.simulation.seed);
 }
 await writeFile(`artifacts/simulation/${name}.json`,g.snapshot());
 advanceGame(g,60);assert(g.restore(g.snapshot()),`${name} remains valid after real ticks`);
}
const saved=g.snapshot(),invalid=snap();invalid.village.simulation.days[0].residents[0][0]=-1;
assert(!g.restore(JSON.stringify(invalid)));assert.equal(g.snapshot(),saved);
g.free();restored.free();
console.log('PASS: real construction accounting, complete resident time totals, exact checkpoint continuation, persistent work identities, seed controls and five repeatable simulator baselines.');
