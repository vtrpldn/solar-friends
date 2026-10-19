import {restockFixtureFood} from '../web/dev/material-fixture.js';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const snap=g=>JSON.parse(g.snapshot());
const person=g=>snap(g).residents.find(r=>r.id===0);
await mkdir('artifacts/work-routes',{recursive:true});
function scene(paved){
 const g=new Game();g.start_mode('sandbox');assert.equal(g.place('home',7,12),'ok');
 const s=snap(g);Object.assign(s.village,{arrived:true,minutes:540,food:80,meals:10,water:40});
 for(const r of s.residents)Object.assign(r,{task:'idle',remaining:90,energy:90,hunger:10,social:10,last_meal_slot:0,x:10+r.id,y:13,target_x:10+r.id,target_y:13});
 assert(g.restore(JSON.stringify(restockFixtureFood(s))));
 if(paved)for(let x=2;x<=12;x++)for(let y=8;y<=16;y++)g.toggle_road(x,y);
 return g;
}
async function finish(g,name){
 assert.match(g.request(0,'gather',false),/Happy/);
 const copy=new Game();let checkpoint=false,frames;
 for(frames=0;frames<2000;frames++){
  const r=person(g),saved=g.snapshot();
  if(r.help.phase==='complete')break;
  if(!checkpoint&&r.walking?.route?.next>2){
   assert(copy.restore(saved));assert.equal(copy.snapshot(),saved);checkpoint=true;
   await writeFile(`artifacts/work-routes/${name}-travelling.json`,saved);
  }else if(checkpoint)assert.equal(copy.snapshot(),saved,'Continuation after a routed-work checkpoint stays exact');
  if(r.walking?.route){
   assert(r.x<=5.3||r.x>=7.7||r.y<=10.3||r.y>=12.7,'The actual resident stays outside the house foundation');
  }
  g.tick(.1);if(checkpoint)copy.tick(.1);
 }
 assert(frames<2000,'Requested food gathering must complete through the resident loop');
 assert(checkpoint);assert.equal(snap(g).village.supplies.gathered,2,'The batch credits output exactly once');
 assert.equal(person(g).help.phase,'complete');
 await writeFile(`artifacts/work-routes/${name}-finished.json`,g.snapshot());
 copy.free();return frames;
}
const plain=scene(false),paved=scene(true),plainFrames=await finish(plain,'plain'),pavedFrames=await finish(paved,'paved');
assert(pavedFrames<plainFrames*.9,`${pavedFrames} paved frames vs ${plainFrames} plain frames`);
for(const game of [plain,paved])game.free();
console.log(`PASS: a requested food batch detours around a foundation, survives exact travelling checkpoints, credits food once and finishes sooner with roads (${pavedFrames} vs ${plainFrames} frames).`);
