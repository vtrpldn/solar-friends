import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
await mkdir('artifacts/logistics',{recursive:true});
function scene(x,y,paved=false){
 const g=new Game(),s=JSON.parse(g.snapshot());s.village.arrived=true;s.village.minutes=540;s.village.food=80;
 for(const r of s.residents)Object.assign(r,{task:'idle',remaining:0,x:10+(r.id-2)*1.25,y:13,target_x:10+(r.id-2)*1.25,target_y:13,hunger:10,social:90,last_meal_slot:0});
 assert(g.restore(JSON.stringify(s)));assert.equal(g.place('garden',x,y),'ok');
 if(paved)for(let px=7;px<=21;px++)for(let py=11;py<=21;py++)g.toggle_road(px,py);
 return g;
}
const snap=g=>JSON.parse(g.snapshot());
const checkpoint=(g)=>{const raw=g.snapshot(),copy=new Game();assert(copy.restore(raw));assert.equal(copy.snapshot(),raw);copy.free();};
async function finish(g,captures=false){
 let pickup=false,cargo=false;
 for(let i=0;i<4000;i++){
  const s=snap(g);
  assert(s.village.logistics.stores.every(p=>p.items.reduce((a,b)=>a+b,0)<=p.capacity));
  if(captures&&!pickup&&s.village.logistics.shipments.some(h=>!h.carrying)){pickup=true;await writeFile('artifacts/logistics/pickup.json',g.snapshot());}
  if(captures&&!cargo&&s.village.logistics.shipments.some(h=>h.carrying)){
   cargo=true;await writeFile('artifacts/logistics/cargo.json',g.snapshot());
   const night=structuredClone(s);night.village.minutes=1260;const preview=new Game();assert(preview.restore(JSON.stringify(night)));await writeFile('artifacts/logistics/cargo-night.json',preview.snapshot());preview.free();
  }
  if(s.village.buildings[0].progress>=100){checkpoint(g);assert(JSON.parse(g.simulation_report()).materials.every(m=>m.difference===0));return s.village.minutes;}
  if(i%20===0)checkpoint(g);
  g.tick(.25);
 }
 throw Error('Supplied garden failed to finish through real resident hauling');
}
const near=scene(13,15),far=scene(20,20),road=scene(20,20,true);
const initial=snap(far);assert(initial.environment.economy.projects[0].reserved.some(n=>n));assert(!initial.environment.economy.projects[0].ready);assert(initial.environment.economy.projects[0].on_site.every(n=>n===0));
const [nearTime,farTime,roadTime]=[await finish(near),await finish(far,true),await finish(road)];
assert(farTime>nearTime+10);assert(roadTime<farTime);
const cancel=new Game();assert(cancel.restore(await readFile('artifacts/logistics/cargo.json','utf8')));
const owned=snap(cancel).environment.economy.materials.map(m=>m.stored);assert.equal(cancel.cancel_project(0),'ok');
for(let n=0;n<1000;n++){cancel.tick(.25);if(n%40===0)checkpoint(cancel);}
assert.deepEqual(snap(cancel).environment.economy.materials.map(m=>m.stored),owned);assert(!snap(cancel).village.logistics.shipments.length);assert.equal(snap(cancel).village.buildings.length,0);
for(const g of [near,far,road,cancel])g.free();
console.log(`PASS: real material hauling, located stage inputs, exact trip checkpoints and cancellation recovery. Completion: nearby ${nearTime.toFixed(1)}, distant ${farTime.toFixed(1)}, paved ${roadTime.toFixed(1)} game minutes.`);
