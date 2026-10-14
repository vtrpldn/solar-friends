import {resetMaterialLocations} from '../web/dev/material-fixture.js';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {advanceGame} from '../web/dev/scenarios.js';
import {advanceSimulation,simulationSpeed} from '../web/simulation-speed.js';
import {sleepLabel} from '../web/resident-presence.js';
await init({module_or_path:await fs.readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const output=process.argv[2];if(output)await fs.mkdir(output,{recursive:true});
const snap=g=>JSON.parse(g.snapshot());
function ready(homes=1,minute=1080){
  const g=new Game();for(let i=0;i<homes;i++)assert.equal(g.place('home',8+i*4,8),'ok');
  const s=snap(g),v=s.village;v.minutes=minute;v.arrived=true;v.food=80;v.meals=12;v.water=40;
  v.buildings.forEach(b=>b.progress=100);
  s.residents.forEach((r,i)=>{r.task='idle';r.remaining=0;r.energy=[95,70,20,80,45][i];r.hunger=20;r.social=90;r.last_meal_slot=2;r.target_x=r.x;r.target_y=r.y;});
  assert(g.restore(JSON.stringify(resetMaterialLocations(s))));return g;
}
function reload(g){const raw=g.snapshot(),copy=new Game();assert(copy.restore(raw));assert.equal(copy.snapshot(),raw);copy.free();}
async function checkpoint(g,name){reload(g);if(output)await fs.writeFile(`${output}/${name}.json`,g.snapshot());}
const traces=[];
for(const homes of [0,1,2]){
  const g=ready(homes),starts=new Map(),wakes=new Map();
  let saved=false;
  for(let i=0;i<4800&&wakes.size<5;i++){
    g.tick(.1);const s=snap(g);
    for(const r of s.residents){
      if(r.sleep.started_at!==null&&!starts.has(r.id)){
        const sleep=r.sleep;assert(sleep.duration_minutes>=360&&sleep.duration_minutes<=540);
        starts.set(r.id,{bedtime:sleep.bedtime,start:sleep.started_at,duration:sleep.duration_minutes});
      }
      if(starts.has(r.id)&&r.sleep.started_at!==null&&!wakes.has(r.id)){
        assert.equal(r.sleep.duration_minutes,starts.get(r.id).duration,'Rest target must remain fixed as energy recovers');
        if(r.sleep.slept_minutes===r.sleep.duration_minutes){
          assert(Math.abs(r.sleep.wake_at-starts.get(r.id).start-r.sleep.duration_minutes)<.2);
          wakes.set(r.id,r.sleep.wake_at);
        }
      }
    }
    if(g.fast_forward_ready()&&!saved){
      saved=true;reload(g);
      assert(s.residents.every(r=>r.trip?.phase==='away'||r.task==='sleep'));
      if(homes===1){
        await checkpoint(g,'all-asleep');
        const firstWake=Math.min(...s.residents.map(r=>r.sleep.wake_at));
        const probe=new Game();assert(probe.restore(g.snapshot()));advanceGame(probe,firstWake-30-s.village.minutes);
        assert(probe.fast_forward_ready());await checkpoint(probe,'auto-ready');
        assert.equal(simulationSpeed(probe,2),16);
        const before=snap(probe).village.minutes;
        const simulated=advanceSimulation(probe,1,2);
        assert(Math.abs(snap(probe).village.minutes-before-simulated*3)<.15);
        assert(simulated<16&&simulated>2,'Fast-forward must stop partway through a frame when someone wakes');
        assert(!probe.fast_forward_ready());assert.equal(simulationSpeed(probe,2),2);
        assert(Math.abs(advanceSimulation(probe,.1,4)-.4)<1e-6);await checkpoint(probe,'first-awake');probe.free();
      }
    }
  }
  assert.equal(starts.size,5,'Every resident settles down');assert.equal(wakes.size,5,'Every resident wakes after actual rest');
  assert(new Set([...starts.values()].map(s=>s.bedtime)).size>=4,'Residents have individual bedtimes');
  assert(new Set(wakes.values()).size>=4,'Residents have individual wake times');assert(saved);
  assert(!g.fast_forward_ready());reload(g);
  traces.push({homes,residents:[...starts].map(([id,s])=>({id,...s,wake:wakes.get(id)}))});g.free();
}
// Actual availability matters: travelling, walking to bed and village chores remain at selected speed.
const g=ready(2,600),s=snap(g);s.village.economy.outside_committed_days=[0,0,0,0,0];
s.residents.forEach(r=>{r.task='outside';r.trip={purpose:'work',phase:'away',return_at:1020};});
assert(g.restore(JSON.stringify(resetMaterialLocations(s))));assert(g.fast_forward_ready());
for(const phase of ['leaving','returning']){
 const travel=structuredClone(s);travel.residents[0].trip.phase=phase;
 if(phase==='returning'){travel.village.minutes=1020;travel.residents.forEach(r=>{r.trip.phase='returning';r.task='return';});}
 assert(g.restore(JSON.stringify(travel)));assert(!g.fast_forward_ready());assert.equal(simulationSpeed(g,8),8);
}
const walking=ready(2),raw=snap(walking);raw.residents.forEach(r=>{r.task='sleep';r.target_x=r.x+2;});
assert(walking.restore(JSON.stringify(raw)));assert(!walking.fast_forward_ready());
assert.equal(sleepLabel(raw.residents[0]),'Heading to bed');walking.free();g.free();
if(output)await fs.writeFile(`${output}/sleep-traces.json`,JSON.stringify(traces,null,2));
console.log('PASS: 0/1/2-home nights, individual bed/wake times, fixed 6–9h actual sleep, exact reloads, 16× only while unavailable, commute exclusion and speed restoration within a frame.');
