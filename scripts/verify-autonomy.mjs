import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {makeScenario} from '../web/dev/scenarios.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const output='artifacts/autonomy';await mkdir(output,{recursive:true});
const game=new Game(),snap=()=>JSON.parse(game.snapshot()),fresh=snap();
assert(game.restore(await readFile(new URL('../web/artwork/village-preview.json',import.meta.url),'utf8')));
assert(game.restore(JSON.stringify(makeScenario('autonomy',fresh,snap()))));
const project=snap().village.buildings.at(-1).id;
await writeFile(`${output}/before.json`,game.snapshot());
assert.match(game.request(2,'gather',false),/Happy/);
const request=snap().residents[2].help.id;
game.tick(.1);
const first=snap();
assert.equal(first.residents[0].task,'rest');
assert.equal(first.residents[1].task,'eat');
assert.equal(first.residents[2].task,'socialize');
assert.equal(first.residents[2].help.phase,'paused');
assert.match(first.residents[2].help.reason,/catch up with neighbours/);
assert.equal(first.residents[4].task,'outside');
const days=[],activities=Array.from({length:5},()=>new Set());
let rested=false,ate=false,connected=false,worked=false,completedAt=null;
for(let frame=0;frame<4*1920;frame++){
  game.tick(.25);
  if(frame%20)continue;
  const s=snap(),people=s.residents;
  rested ||= people[0].energy>=60;
  ate ||= people[1].hunger<35;
  connected ||= people[2].social>=75;
  worked ||= people.some(r=>r.task==='build'&&r.activity_building===project);
  if(s.village.buildings.find(b=>b.id===project).progress>=100)completedAt??=s.village.minutes;
  for(const r of people){activities[r.id].add(r.task);assert(r.hunger<95,'No resident should starve while others pursue projects');}
  if(frame%1920===0){
    const saved=game.snapshot(),copy=new Game();assert(copy.restore(saved));
    assert.equal(copy.snapshot(),saved);
    for(let i=0;i<4;i++){game.tick(.25);copy.tick(.25);}
    assert.equal(copy.snapshot(),game.snapshot(),'Saved intentions continue exactly');copy.free();
    const report=JSON.parse(game.simulation_report());
    assert(report.materials.every(m=>m.difference===0));
    for(let i=0;i<4;i++){const w=report.water;assert(Math.abs(w.opening[i]+w.received[i]-w.consumed[i]-w.present[i])<.001);}
    days.push({minutes:s.village.minutes,food:s.village.food,meals:s.village.meals,project:s.village.buildings.find(b=>b.id===project).progress});
  }
}
assert(rested&&ate&&connected,'Residents recover the needs they started with');
assert(worked&&completedAt,'Self care leaves room for the approved village project');
const end=snap(),leisure=end.village.simulation.days.slice(1,-1).reduce((totals,d)=>{d.residents.forEach((r,i)=>r.forEach((n,j)=>totals[i][j]+=n));return totals;},Array.from({length:5},()=>Array(8).fill(0))).map(r=>(r[4]+r[5]+r[6])/r.reduce((sum,n,i)=>sum+([0,1,3,4,5,6].includes(i)?n:0),0));
assert.equal(end.residents[2].help.id,request);
assert.equal(end.residents[2].help.phase,'complete','An accepted request resumes after social recovery and finishes');
console.log('Observed leisure ratios',leisure);
assert(activities.every(s=>['nature_walk','birdwatch','stretch','daydream','stargaze'].some(t=>s.has(t))),'Each resident still chooses personal hobbies between useful work and needs');
await writeFile(`${output}/after.json`,game.snapshot());
await writeFile(`${output}/report.json`,JSON.stringify({first:first.residents.map(r=>({name:r.name,task:r.task,reason:r.reason})),rested,ate,connected,worked,completedAt,request:end.residents[2].help,days,leisure,activities:activities.map(s=>[...s])},null,2));
game.free();
console.log('PASS: individual rest, meals, social recovery, outside commitments, autonomous project completion, four exact daily continuations and balanced material/liquid accounts; work follows energy and needs, and every resident still chooses hobbies.');
