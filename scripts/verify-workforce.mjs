import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const snap=g=>JSON.parse(g.snapshot());
function scene(){
  const g=new Game(),s=snap(g);
  Object.assign(s.village,{arrived:true,minutes:570,food:12,meals:8,water:30});
  for(const r of s.residents)Object.assign(r,{task:'idle',trip:null,remaining:r.id===0?0:100,x:12,y:11,target_x:12,target_y:11,energy:90,hunger:10,social:90,last_meal_slot:0});
  assert(g.restore(JSON.stringify(s)));return g;
}
const food=scene(),care=scene();
for(const [g,foodLevel,careLevel] of [[food,2,0],[care,0,2]]){
  assert.equal(g.set_work_preference(0,'food',foodLevel),'ok');
  assert.equal(g.set_work_preference(0,'care',careLevel),'ok');
  const before=g.snapshot(),report=JSON.parse(g.work_report());
  assert.equal(g.snapshot(),before,'Work offers must not allocate identities or advance time');
  assert.equal(report.preferences[0][2],foodLevel);
  assert.notEqual(g.set_work_preference(0,'food',3),'ok');
  assert.equal(g.snapshot(),before,'Invalid preferences must be atomic');
  g.tick(.1);
}
assert.equal(snap(food).residents[0].task,'gather');
assert.equal(snap(care).residents[0].task,'water');
// A live checkpoint must preserve preferences, claims derived from activities,
// observed chores and the next simulation outcome exactly.
const copy=new Game();assert(copy.restore(care.snapshot()));
for(let i=0;i<120;i++){care.tick(.25);copy.tick(.25);}
assert.equal(care.snapshot(),copy.snapshot());
assert(snap(care).village.workforce.days.at(-1).residents[0][4]>0);
assert(JSON.parse(care.simulation_report()).materials.every(m=>m.difference===0));
for(const g of [food,care,copy])g.free();
console.log('PASS: work preferences affect real resident choices; queries are read-only; invalid changes are atomic; chore accounting and continuation survive exact live checkpoints.');
