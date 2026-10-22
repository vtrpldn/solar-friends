import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import init,{Game} from '../web/pkg/solar_friends.js';
import {advanceSimulation} from '../web/simulation-speed.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const game=new Game(),copy=new Game(),raw=await readFile('web/examples/first-clearing.solar-scenario','utf8'),orders={tiles:2,panels:2,batteries:2},placements=[['home',27,32],['home',28,36],['kitchen',32,34],['garden',35,34]];
try{
 assert(JSON.parse(game.load_scenario(raw)).ok);const starting=JSON.parse(game.snapshot()),basket=Array(30).fill(0);basket[7]=orders.tiles;basket[12]=orders.panels;basket[13]=orders.batteries;assert.equal(game.order_supplies(JSON.stringify(basket)),'ok');
 for(const [kind,x,y]of placements)assert.equal(game.place(kind,x,y),'ok');
 let finished=null,frame=0;const observations=[];
 for(;frame<18000;frame++){
  advanceSimulation(game,1/60,16);
  if(frame%600===0){
   const state=JSON.parse(game.snapshot()),journal=JSON.parse(game.scenario_journal());finished=journal.finished_at;
   observations.push({frame,minute:state.village.minutes,finished,funds:state.village.economy.money,construction:state.village.buildings.map(b=>({kind:b.kind,progress:b.progress}))});
   if(frame%2400===0)console.log(`frame ${frame}: minute ${state.village.minutes.toFixed(1)}, ${finished===null?'required goals in progress':'required goals complete'}`);
   if(finished!==null&&state.village.minutes-finished>=3*1440)break;
  }
 }
 assert(finished!==null,'Required goals must complete through actual work and trade');assert(frame<18000,'Must continue at least three days beyond completion');
 const final=game.snapshot(),state=JSON.parse(final),journal=JSON.parse(game.scenario_journal());
 assert(journal.chapters.every(c=>c.goals.filter(g=>!g.optional).every(g=>g.status==='complete')));assert(state.village.economy.money>=0);assert(state.village.economy.money<starting.village.economy.money);
 assert(state.village.buildings.filter(b=>b.kind==='home'&&b.progress===100).length===2);assert(state.village.harvests>=2,'The conserved village harvest counter records real crop collections; per-crop repeat counters reset on replanting.');
 assert(copy.restore(final));assert.equal(copy.snapshot(),final);for(let i=0;i<180;i++){advanceSimulation(game,1/60,16);advanceSimulation(copy,1/60,16);}assert.equal(game.snapshot(),copy.snapshot());
 const result={schema:1,sourceSha256:createHash('sha256').update(raw).digest('hex'),speed:16,actions:{orders,placements},finishedAt:finished,observedThrough:state.village.minutes,daysAfterCompletion:(state.village.minutes-finished)/1440,remainingFunds:state.village.economy.money,goals:journal.chapters.map(c=>({title:c.title,goals:c.goals.map(g=>({title:g.title,status:g.status,optional:g.optional}))})),observations,scope:'Native normal-command playthrough, not a public-input usability study. No runtime snapshot patches, free stock, forced work or goal mutation.'};
 await mkdir('assets/scenario-reviews',{recursive:true});await writeFile('assets/scenario-reviews/first-clearing-playthrough.json',JSON.stringify(result,null,2)+'\n');
 console.log(`PASS: First clearing required goals completed at ${finished.toFixed(1)} minutes; ${result.daysAfterCompletion.toFixed(2)} later days, paid imports, actual resident construction/harvests, nonnegative funds and exact restored continuation.`);
}finally{game.free();copy.free();}
