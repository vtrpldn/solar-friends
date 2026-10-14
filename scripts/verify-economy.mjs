import {unlockStory} from './story-fixture.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {makeScenario} from '../web/dev/scenarios.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const freshGame=new Game(),fresh=JSON.parse(freshGame.snapshot());assert(freshGame.restore(await readFile(new URL('../web/artwork/village-preview.json',import.meta.url),'utf8')));const established=JSON.parse(freshGame.snapshot());
const snap=g=>JSON.parse(g.snapshot());
for(const scenario of ['economy','economy-poor','economy-depleted']){
  const g=new Game(),fixture=makeScenario(scenario,fresh,established);fixture.village.food=36;
  assert(g.restore(JSON.stringify(fixture)));g.set_outside_work(true);
  assert.equal(g.configure_project(0,2,false,'local'),'ok');
  const waking=Array(5).fill(0),relax=Array(5).fill(0);let orders=0,maxHunger=0,minFood=Infinity;
  for(let i=0;i<24*1440/.75;i++){
    const s=snap(g),e=s.environment.economy;
    if(i%100===0){
      const missing=e.shortage,total=missing.reduce((sum,n,j)=>sum+n*e.materials[j].price,6000);
      if(missing.some(n=>n)&&e.money>=total){assert.equal(g.order_supplies(JSON.stringify(missing)),'ok');orders++;}
      const saved=g.snapshot();assert(g.restore(saved),'Every intermediate state must survive save/reload');
      assert.equal(g.snapshot(),saved,'Reload must not repeat grants, delivery or work');
    }
    assert(e.money>=0&&e.used<=e.capacity);assert(e.materials.every(m=>m.available>=0&&m.reserved<=m.stored));
    minFood=Math.min(minFood,s.village.food);maxHunger=Math.max(maxHunger,...s.residents.map(r=>r.hunger));
    for(const r of s.residents){if(r.trip?.purpose==='work'&&r.trip.phase==='away'){assert(s.village.minutes%1440>=540&&s.village.minutes%1440<1020,'Outside jobs stay within 09:00–17:00');}if(r.task!=='sleep'&&!r.trip){waking[r.id]++;if(['idle','nature_walk','birdwatch','stretch','daydream','stargaze','socialize','rest'].includes(r.task))relax[r.id]++;}}
    g.tick(.25);
  }
  const s=snap(g);assert(s.village.buildings.every(b=>b.progress===100),`${scenario}: all three mixed-material projects finish`);
  assert(orders>0&&s.village.economy.orders.some(o=>o.status==='delivered'));
  assert(s.village.economy.ledger.some(l=>l.amount>0),'Outside work must provide recovery income');
  assert(maxHunger<95);assert(relax.every((n,i)=>n/waking[i]>.4),'Residents retain at least 40% of in-village waking time for leisure during construction');
  if(scenario==='economy-depleted'){assert.deepEqual(s.village.economy.land,[0,0,0]);assert(s.village.economy.sources.filter(s=>s.material>1).every(s=>s.remaining===0));}
  console.log(`PASS: ${scenario}, 24 days, ${orders} combined orders, all projects completed; minimum food ${minFood.toFixed(1)}, peak hunger ${maxHunger.toFixed(1)}, in-village leisure ${Math.floor(Math.min(...relax.map((n,i)=>n/waking[i]))*100)}%+.`);
  g.free();
}
// Local preparation consumes inputs once and project pause stops its demand.
const g=new Game();unlockStory(g);assert.equal(g.place('greenhouse',8,8),'ok');let s=snap(g);s.village.economy.stock[5]=0;s.village.economy.stock[8]=10;assert(g.restore(JSON.stringify(s)));g.dev_observe(true);
for(let i=0;i<5000;i++)g.tick(.25);
s=snap(g);assert(s.village.economy.stock[5]>0||s.village.economy.projects[0].consumed[5]>0,'Residents prepare frames from available local inputs');
assert.equal(g.configure_project(0,1,true,'standard'),'ok');const before=g.snapshot();const malformed=JSON.parse(before);malformed.village.economy.projects[0].reserved[0]=999999999;assert(!g.restore(JSON.stringify(malformed)));assert.equal(g.snapshot(),before);
g.free();freshGame.free();
console.log('PASS: preparation, atomic malformed-save rejection, stage reservations, food reserve protection and recovery from exhausted deposits.');
