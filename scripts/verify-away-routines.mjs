import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {advanceGame} from '../web/dev/scenarios.js';
import {residentVisible,tripLabel} from '../web/resident-presence.js';
import {residentActivity} from '../web/resident-animation.js';
await init({module_or_path:await fs.readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const output=process.argv[2];if(output)await fs.mkdir(output,{recursive:true});
const snap=g=>JSON.parse(g.snapshot());
function ready(minute,homes=0){
  const g=new Game();
  for(let i=0;i<homes;i++)assert.equal(g.place('home',8+i*4,8),'ok');
  const s=snap(g),v=s.village;v.minutes=minute;v.arrived=true;v.food=80;v.meals=12;v.water=40;
  v.buildings.forEach(b=>{b.progress=100;});
  s.residents.forEach(r=>{r.task='idle';r.remaining=0;r.requested=false;r.energy=90;r.hunger=20;r.social=90;r.last_meal_slot=0;r.target_x=r.x;r.target_y=r.y;});
  assert(g.restore(JSON.stringify(s)));return g;
}
function until(g,test,label){for(let i=0;i<2400;i++){if(test(snap(g)))return;g.tick(.25);}throw Error('Timed out: '+label);}
function reload(g){const raw=g.snapshot(),other=new Game();assert(other.restore(raw));assert.equal(other.snapshot(),raw);other.free();}
async function checkpoint(g,name){reload(g);if(output)await fs.writeFile(`${output}/${name}.json`,g.snapshot());}

const job=ready(539,2);await checkpoint(job,'job-ready');job.set_outside_work(true);
until(job,s=>s.residents[4].trip?.phase==='leaving','leave for job');
assert(residentVisible(snap(job).residents[4],snap(job).village));assert.equal(residentActivity(snap(job).residents[4]),'walk');await checkpoint(job,'job-leaving');
const money=snap(job).village.economy.money;
until(job,s=>s.residents[4].trip?.phase==='away','job away');
const away=snap(job);assert.equal(away.residents[4].trip.return_at,1020);assert(!residentVisible(away.residents[4],away.village));
assert.equal(tripLabel(away.residents[4]),'Working off-site · back at 17:00');
assert(job.request(4,'rest',true).includes('away'));assert(job.visit_building(4,0).includes('away'));
const beforeRequest=job.snapshot();assert(!job.request(0,'outside',true).includes('lend a hand'));assert.equal(job.snapshot(),beforeRequest);
await checkpoint(job,'job-away');job.set_outside_work(false);
advanceGame(job,1019-snap(job).village.minutes);assert.equal(snap(job).village.economy.money,money);
advanceGame(job,2);assert.equal(snap(job).residents[4].trip.phase,'returning');
assert(residentVisible(snap(job).residents[4],snap(job).village));assert.equal(snap(job).village.economy.money,money+18000);await checkpoint(job,'job-returning');
until(job,s=>!s.residents[4].trip,'back in village');assert.equal(snap(job).village.economy.money,money+18000);reload(job);job.free();

const nightReady=ready(1260,1);await checkpoint(nightReady,'night-ready');nightReady.free();
for(const homes of [0,1,2]){
  const g=ready(1439,homes);g.tick(.25);
  const expected=5-Math.min(5,homes*3);
  assert.equal(snap(g).residents.filter(r=>r.trip).length,expected);
  if(expected){
    until(g,s=>s.residents.filter(r=>r.trip?.phase==='away').length===expected,'overnight away');
    assert.equal(snap(g).residents.filter(r=>residentVisible(r,snap(g).village)).length,0);
    const before=snap(g);advanceGame(g,30);const after=snap(g);
    if(homes===0)assert.equal(after.village.water,before.village.water,'Off-site sleep must not consume village water');
    if(homes===1)await checkpoint(g,'overnight-away');
    const returnAt=Math.max(...after.residents.filter(r=>r.trip).map(r=>r.trip.return_at));
    advanceGame(g,returnAt+1-after.village.minutes);
    assert(snap(g).residents.some(r=>r.trip?.phase==='returning'));
    if(homes===1)await checkpoint(g,'morning-return');
    until(g,s=>s.residents.every(r=>!r.trip),'morning arrival');
  }else {until(g,s=>s.residents.every(r=>!residentVisible(r,s.village)),'enter village homes');assert(snap(g).residents.every(r=>!r.trip),'Residents with beds stay in the village');}
  reload(g);g.free();
}
console.log('PASS: real departures, off-map jobs, 17:00 return/pay once, blocked requests, zero/one/two-home overnight stays, morning returns and exact reloads in every travel phase.');
