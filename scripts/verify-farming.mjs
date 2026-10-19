import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {makeScenario,advanceGame} from '../web/dev/scenarios.js';
import {cropTypes,cropDuration} from '../web/crop-art.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const output='artifacts/farming';await mkdir(output,{recursive:true});
const g=new Game(),snap=()=>JSON.parse(g.snapshot()),fresh=snap();
assert(g.restore(await readFile(new URL('../web/artwork/village-preview.json',import.meta.url),'utf8')));
const established=snap();assert(g.restore(JSON.stringify(makeScenario('farming',fresh,established))));
assert.equal(snap().village.version,26);
const names=Object.keys(cropTypes);assert.equal(names.length,6);
for(const kind of names){assert(g.configure_crop(5,kind,true));const out=JSON.parse(g.crop_outlook(5));assert.equal(out.crop,'fodder','An already planted crop is preserved');assert.equal(cropDuration({kind,harvests:0}),cropTypes[kind].minutes);}
assert(g.configure_crop(5,'fodder',true));
function accounts(){const report=JSON.parse(g.simulation_report());assert(report.materials.every(m=>m.difference===0));for(let i=0;i<4;i++){const w=report.water;assert(Math.abs(w.opening[i]+w.received[i]-w.consumed[i]-w.present[i])<.001,`Liquid ${i} conserved`);}}
function checkpoint(){const saved=g.snapshot(),copy=new Game();assert(copy.restore(saved),'Farming save restores');assert.equal(copy.snapshot(),saved,'Farming save roundtrip is exact');copy.free();}
await writeFile(`${output}/before.json`,g.snapshot());
const days=[],activity=new Map();let lowestFood=Infinity,peakMilk=0,peakHoney=0;
for(let day=0;day<18;day++){
  advanceGame(g,1440);const s=snap();accounts();checkpoint();
  const milk=s.environment.economy.materials[25].stored,honey=s.environment.economy.materials[26].stored;
  lowestFood=Math.min(lowestFood,s.village.food);peakMilk=Math.max(peakMilk,milk);peakHoney=Math.max(peakHoney,honey);
  const report=JSON.parse(g.agriculture_report());days.push({day,food:s.village.food,milk,honey,fodder:s.environment.economy.materials[24].stored,care:report.plots,progress:{milk:s.village.progress.milk_collected,honey:s.village.progress.honey_collected,fruit:s.village.progress.orchard_fruit,rotations:s.village.progress.crop_rotations}});
  for(const r of s.residents)activity.set(r.task,(activity.get(r.task)||0)+1);
}
const end=snap();
await writeFile(`${output}/after.json`,g.snapshot());await writeFile(`${output}/report.json`,JSON.stringify({days,lowestFood,peakMilk,peakHoney,activity:[...activity]},null,2));
assert(end.village.progress.milk_collected>0,'Residents bring local feed, fill the trough and collect goat milk');
assert(end.village.progress.honey_collected>0,'Residents inspect the nearby bee hive and collect honey');
assert(end.village.progress.orchard_fruit>0,'Residents irrigate and collect perennial fruit');
assert(end.village.progress.crop_rotations>0,'The authored bean-to-maize plan is planted and harvested by real workers');
const leisure=end.village.simulation.days.slice(0,-1).reduce((totals,d)=>{d.residents.forEach((r,i)=>r.forEach((n,j)=>totals[i][j]+=n));return totals;},Array.from({length:5},()=>Array(8).fill(0))).map(r=>(r[4]+r[5]+r[6])/r.slice(0,7).reduce((a,b)=>a+b));
assert(leisure.every(n=>n>.5),'Every resident retains a majority of waking time for rest, hobbies and social life');
assert(peakMilk<=11&&peakHoney<=10,'Produce reserves stay bounded');
assert(end.village.buildings.find(b=>b.kind==='goat_pasture').agriculture.welfare>40,'Regular care maintains goat wellbeing');
await writeFile(`${output}/after.json`,g.snapshot());await writeFile(`${output}/report.json`,JSON.stringify({days,lowestFood,peakMilk,peakHoney,leisure,activity:[...activity]},null,2));
console.log('PASS: six crops, actual resident hauling and animal care, fruit regrowth, rotations, bounded produce, eighteen daily exact checkpoints and all material/liquid accounts.');
g.free();
