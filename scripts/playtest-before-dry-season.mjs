import assert from 'node:assert/strict';import {readFile,mkdir,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import init,{Game} from '../web/pkg/solar_friends.js';import {advanceSimulation} from '../web/simulation-speed.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});const game=new Game(),copy=new Game(),raw=await readFile('web/examples/before-the-dry-season.solar-scenario','utf8'),placements=[['well',27,32],['kitchen',32,34],['garden',35,34]];
try{
 assert(JSON.parse(game.load_scenario(raw)).ok);const basket=Array(30).fill(0);basket[9]=1;basket[14]=1;assert.equal(game.order_supplies(JSON.stringify(basket)),'ok');for(const [kind,x,y]of placements)assert.equal(game.place(kind,x,y),'ok');
 let finished=null,frame=0;const observations=[];
 for(;frame<18000;frame++){
  advanceSimulation(game,1/60,16);
  if(frame%600===0){const state=JSON.parse(game.snapshot()),journal=JSON.parse(game.scenario_journal()),economy=JSON.parse(game.report_state()).environment.economy;finished=journal.finished_at;
   observations.push({frame,minute:state.village.minutes,finished,challenge:journal.challenge,food:economy.food_reserve.owned,construction:state.village.buildings.map(b=>({kind:b.kind,progress:b.progress})),goals:journal.chapters.map(c=>c.goals.map(g=>({title:g.title,status:g.status,condition:g.condition})))});
   if(frame%2400===0)console.log(`frame ${frame}: minute ${state.village.minutes.toFixed(1)}, ${finished===null?'required goals in progress':'required goals complete'}`);
   if(finished!==null&&state.village.minutes>=Math.max(finished+3*1440,9*1440))break;
   if(journal.challenge?.status==='failed')break;
  }
 }
 await mkdir('assets/scenario-reviews',{recursive:true});const result={schema:1,sourceSha256:createHash('sha256').update(raw).digest('hex'),speed:16,orders:{plumbing:1,pumps:1},placements,finishedAt:finished,observations,scope:'Normal native commands and autonomous resident work, no runtime patches or free material changes.'};
 await writeFile('assets/scenario-reviews/before-dry-season-playthrough.json',JSON.stringify(result,null,2)+'\n');await writeFile('/private/tmp/solar-before-dry-season-state.json',game.snapshot());await writeFile('/private/tmp/solar-before-dry-season-report.json',game.report_state());
 assert(finished!==null,'Water reserve and harvesting must finish before deadline');assert(frame<18000);const final=game.snapshot();assert(copy.restore(final));assert.equal(copy.snapshot(),final);for(let i=0;i<180;i++){advanceSimulation(game,1/60,16);advanceSimulation(copy,1/60,16);}assert.equal(game.snapshot(),copy.snapshot());
 console.log('PASS: Cerrado custom cast completes required goals and continues across the dry-season boundary with exact restored continuation.');
}finally{game.free();copy.free();}
