import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {advanceSimulation} from '../web/simulation-speed.js';
import {quests,buildingUnlocked} from '../web/quests.js';
import {storyOpeningScenario} from './story-opening-fixture.mjs';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const g=new Game(),copy=new Game();
try{
 const d=storyOpeningScenario(g);const loaded=JSON.parse(g.load_scenario(JSON.stringify(d)));assert(loaded.ok,JSON.stringify(loaded));
 const report=()=>JSON.parse(g.story_opening()),snap=()=>JSON.parse(g.snapshot()),legacy=v=>v.arrived&&v.buildings.some(b=>b.kind==='well'&&b.progress>=100)&&v.buildings.some(b=>b.kind==='home'&&b.progress>=100)&&v.harvests>0&&v.buildings.some(b=>b.kind==='kitchen'&&b.progress>=100)&&v.meals_served>0;
 const shuffled=report();shuffled.goals.reverse();assert.deepEqual(quests[0].objectives(snap().village,shuffled),quests[0].objectives(snap().village,report()));
 const start=g.snapshot();assert.equal(report().completed,false);assert.equal(snap().village.harvests,0);assert.equal(snap().village.meals_served,0);g.story_opening();g.tick(0);assert.equal(g.snapshot(),start);assert(copy.restore(start));
 let partial=false;
 for(let i=0;i<1200&&!report().completed;i++){
  const s=snap();assert.equal(report().requirements_met,legacy(s.village));assert.equal(quests[0].objectives(s.village,report()).every(o=>o.done),legacy(s.village));
  if(s.village.arrived&&i%15===0){for(const [id,task]of [[0,'garden'],[2,'cook']]){const r=s.residents.find(r=>r.id===id);if(!r.help||r.help.finished!==null){assert.equal(g.request(id,task,false),copy.request(id,task,false));}}}
  advanceSimulation(g,1/60,16);advanceSimulation(copy,1/60,16);
  if(i===10){const checkpoint=g.snapshot();assert(copy.restore(checkpoint));assert.equal(copy.snapshot(),checkpoint);partial=true;}
 }
 const end=snap();assert(report().completed,JSON.stringify({report:report(),people:end.residents.map(r=>[r.name,r.task,r.reason]),minutes:end.village.minutes}));assert(partial);assert.equal(g.snapshot(),copy.snapshot());assert(end.village.harvests>0&&end.village.meals_served>0);assert.equal(end.village.buildings.filter(b=>b.kind==='home').length,1);assert.equal(end.village.mornings,0);assert.equal(end.village.progress.tracked,1);assert.equal(end.village.events.filter(e=>e.startsWith('A Shared Beginning complete!')).length,1);
 assert.equal(report().remaining_legacy_chapters,12);assert(quests[0].objectives(end.village,report()).every(o=>o.done));for(const kind of ['grove','warehouse','orchard'])assert(buildingUnlocked(end.village,kind));assert(!buildingUnlocked(end.village,'compost'));
 const saved=g.snapshot();assert(copy.restore(saved));for(let i=0;i<20;i++){advanceSimulation(g,1/60,16);advanceSimulation(copy,1/60,16);}assert.equal(g.snapshot(),copy.snapshot());assert.equal(g.place('grove',25,34),'ok');
 const bridge=structuredClone(d);bridge.rules.mode='sandbox';bridge.journal=JSON.parse(g.scenario_catalog()).official_story.opening;assert(JSON.parse(copy.load_scenario(JSON.stringify(bridge))).ok);assert.equal(JSON.parse(copy.scenario_journal()).chapters[0].goals[0].condition.complete,false);
 console.log('PASS: shared-compiler Story opening, live legacy/native/UI agreement, real arrival/harvest/cooked meal, simultaneous chapter credit, one home without another morning, once-only chapter receipt and existing unlocks, standalone authored bridge, pause and exact partial/final 16× continuation.');
}finally{g.free();copy.free();}
