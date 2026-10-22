import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {buildingUnlocked} from '../web/quests.js';
import {advanceSimulation} from '../web/simulation-speed.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const g=new Game(),copy=new Game(),state=()=>JSON.parse(g.snapshot()).village;
try{
 const d=JSON.parse(g.scenario_template('sandbox'));d.rules.logistics=false;d.journal={schema:1,introduction:'Begin simply',completion:'Our village grows',locked_buildings:['home'],chapters:[{id:'one',title:'One',description:'',goals:[{id:'wait',title:'Settle in',description:'',optional:false,condition:{kind:'date',minute:482}}]}],events:[{id:'home',title:'Ready for homes',when:{kind:'goal',goal:'wait'},effect:{kind:'unlock_building',building:'home'}}]};
 assert(JSON.parse(g.load_scenario(JSON.stringify(d))).ok);assert.equal(buildingUnlocked(state(),'home'),false);const before=g.snapshot();assert.notEqual(g.place('home',25,25),'ok');assert.equal(g.snapshot(),before);assert(copy.restore(before));g.tick(0);assert.equal(g.snapshot(),before);
 for(let i=0;i<180;i++){advanceSimulation(g,1/60,16);advanceSimulation(copy,1/60,16);}assert.equal(g.snapshot(),copy.snapshot());assert.equal(buildingUnlocked(state(),'home'),true);assert.equal(JSON.parse(g.scenario_journal()).events[0].status,'applied');const after=g.snapshot();assert(copy.restore(after));assert.equal(copy.snapshot(),after);
 for(const [snapshot,locks]of [[before,[]],[after,['home']]]){const bad=JSON.parse(snapshot);bad.village.progress.scenario_journal.locked_buildings=locks;assert.equal(g.restore(JSON.stringify(bad)),false);assert.equal(g.snapshot(),after);}
 const bad=structuredClone(d);bad.journal.chapters[0].goals[0].condition={kind:'buildings',building:'home',count:1,credit:'after_activation'};assert(!JSON.parse(g.load_scenario(JSON.stringify(bad))).ok);assert.equal(g.snapshot(),after);assert.equal(g.place('home',25,25),'ok');
 const immediate=structuredClone(d);immediate.journal.events[0].when={kind:'start'};assert(JSON.parse(g.load_scenario(JSON.stringify(immediate))).ok);assert.equal(buildingUnlocked(state(),'home'),true);const initialUnlock=g.snapshot();assert(copy.restore(initialUnlock));assert.equal(copy.snapshot(),initialUnlock);g.tick(0);assert.equal(g.snapshot(),initialUnlock);
 console.log('PASS: native and UI lock agreement, atomic blocked placement, goal-triggered unlock, paused and 16× exact continuation, durable receipt/lock integrity, rejected circular progression and actual newly unlocked construction.');
}finally{g.free();copy.free();}
