import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {advanceSimulation} from '../web/simulation-speed.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const g=new Game(),copy=new Game();
try{
 const d=JSON.parse(g.scenario_template('sandbox'));d.start.minutes=600;d.journal={schema:1,introduction:'A deadline',completion:'Our village continues',challenge:{deadline:601,failure_message:'Time passed.'},chapters:[{id:'opening',title:'Our beginning',description:'',goals:[{id:'date',title:'A later date',description:'',optional:false,condition:{kind:'date',minute:602}}]}]};
 assert(JSON.parse(g.load_scenario(JSON.stringify(d))).ok);
 const report=()=>JSON.parse(g.scenario_journal());
 const opening=g.snapshot();g.tick(0);assert.equal(g.snapshot(),opening);assert(!g.continue_scenario_freely());assert(!g.configure_sandbox_rules(true,true,true));
 advanceSimulation(g,1/60,16);const partial=g.snapshot();assert(copy.restore(partial));assert.equal(copy.snapshot(),partial);
 for(let i=0;i<20;i++){advanceSimulation(g,1/60,16);advanceSimulation(copy,1/60,16);}assert.equal(g.snapshot(),copy.snapshot());assert.equal(JSON.parse(g.snapshot()).village.minutes,601);assert.equal(report().challenge.status,'failed');
 const failed=g.snapshot();assert(copy.restore(failed));assert.equal(copy.snapshot(),failed);assert(!g.configure_sandbox_rules(true,true,true));
 assert(g.continue_scenario_freely());assert(!g.continue_scenario_freely());assert(copy.restore(g.snapshot()));
 for(let i=0;i<20;i++){advanceSimulation(g,1/60,16);advanceSimulation(copy,1/60,16);}assert.equal(g.snapshot(),copy.snapshot());assert.equal(report().challenge.status,'unrestricted');assert.equal(report().challenge.eligible,false);assert(report().finished_at>601);
 const continued=g.snapshot();assert(copy.restore(continued));assert.equal(copy.snapshot(),continued);
 const bad=JSON.parse(continued);bad.village.progress.scenario_journal.continued_at=601.25;assert(!copy.restore(JSON.stringify(bad)));assert.equal(copy.snapshot(),continued);
 d.journal.chapters[0].goals[0].condition.minute=601;assert(JSON.parse(g.load_scenario(JSON.stringify(d))).ok);for(let i=0;i<20;i++)advanceSimulation(g,1/60,16);assert.equal(report().challenge.status,'succeeded');assert.equal(report().finished_at,601);assert(JSON.parse(g.snapshot()).village.minutes>601);
 console.log('PASS: real 16× deadline boundary, pause, partial/failed/continued checkpoints, exact deterministic continuation, permanent failed eligibility after late goals, inclusive success and atomic corrupt-decision rejection.');
}finally{g.free();copy.free();}
