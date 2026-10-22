import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {advanceSimulation} from '../web/simulation-speed.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const g=new Game(),copy=new Game(),goal=(id,condition,optional=false)=>({id,title:`Goal ${id}`,description:'Plain text <not markup>',optional,condition}),chapter=(id,goals)=>({id,title:`Chapter ${id}`,description:'A new beginning',goals});
const report=()=>JSON.parse(g.scenario_journal()),load=d=>JSON.parse(g.load_scenario(JSON.stringify(d)));
try{
 const original=g.snapshot(),catalog=JSON.parse(g.scenario_catalog());assert.equal(catalog.journal.schema,1);assert.equal(catalog.journal.conditions.length,8);
 const d=JSON.parse(g.scenario_template('sandbox'));d.journal={schema:1,introduction:'A home of our own.',completion:'Village life continues.',chapters:[chapter('arrival',[goal('fund',{kind:'funds',cents:0}),goal('later',{kind:'date',minute:600},true)]),chapter('home',[goal('build',{kind:'buildings',building:'home',count:1,credit:'after_activation'})]),chapter('morning',[goal('clock',{kind:'all',conditions:[{kind:'goal',goal:'build'},{kind:'date',minute:482}]})])]};
 assert(JSON.parse(g.validate_scenario(JSON.stringify(d))).ok);assert.equal(g.snapshot(),original,'Validation must not replace a live village');assert(load(d).ok);
 let r=report();assert.equal(r.chapters[0].goals[0].status,'complete');assert.equal(r.chapters[1].goals[0].status,'active');assert.equal(r.chapters[2].goals[0].status,'locked');assert.equal(r.chapters[2].goals[0].condition,null);
 assert.deepEqual(r.chapters[1].goals[0].condition.action,{kind:'build',building:'home'});
 assert.equal(g.place('home',25,25),'ok');const paused=g.snapshot();g.tick(0);assert.equal(g.snapshot(),paused);assert.equal(report().chapters[1].goals[0].status,'active');
 for(let i=0;i<60;i++)advanceSimulation(g,1/60,1);
 r=report();assert.equal(r.chapters[1].goals[0].status,'complete');assert(r.finished_at!==null);
 assert.equal(r.chapters[0].goals[1].status,'active','Optional goals remain available after chapter completion');
 const checkpoint=g.snapshot();assert(copy.restore(checkpoint));assert.equal(copy.snapshot(),checkpoint);
 for(let i=0;i<180;i++){advanceSimulation(g,1/60,16);advanceSimulation(copy,1/60,16);}
 assert.equal(g.snapshot(),copy.snapshot(),'Exact authored-goal continuation at 16x');assert.equal(report().chapters[0].goals[1].status,'complete');
 const settled=g.snapshot();g.scenario_journal();g.scenario_journal();assert.equal(g.snapshot(),settled,'Journal reports are read-only');
 const bounds=structuredClone(d);bounds.journal.chapters=Array.from({length:16},(_,c)=>chapter(`chapter-${c}`,Array.from({length:4},(_,i)=>goal(`goal-${c}-${i}`,{kind:'all',conditions:[{kind:'funds',cents:0},{kind:'date',minute:480},{kind:'buildings',building:'shed',count:1,credit:'present'}]}))));
 assert(JSON.parse(g.validate_scenario(JSON.stringify(bounds))).ok,'16 chapters / 64 goals / 256 nodes are accepted');
 bounds.journal.chapters[0].goals.push(goal('too-many',{kind:'funds',cents:0}));assert(!JSON.parse(g.validate_scenario(JSON.stringify(bounds))).ok);assert.equal(g.snapshot(),settled);
 for(const mutation of ['missing-runtime','orphan-goal','future-time','inconsistent-chapter']){
  const broken=JSON.parse(settled),runtime=broken.village.progress.scenario_journal;
  if(mutation==='missing-runtime')delete broken.village.progress.scenario_journal;
  if(mutation==='orphan-goal')runtime.goals.orphan=runtime.goals.fund;
  if(mutation==='future-time')runtime.last_sample+=1;
  if(mutation==='inconsistent-chapter')runtime.chapters.arrival=null;
  assert.equal(g.restore(JSON.stringify(broken)),false,mutation);assert.equal(g.snapshot(),settled);
 }
 const invalid=structuredClone(d);invalid.journal.chapters[0].goals[0].condition={kind:'goal',goal:'clock'};assert(!load(invalid).ok);assert.equal(g.snapshot(),settled);
 console.log('PASS: authored journal catalog and validation, explicit starting/activation credit, native reports/actions, ordered/optional goals, pause and 1x/16x observations, exact saves, limits and atomic corruption/deadlock rejection. Player journal authoring and rendering are not covered by this engine verifier.');
}finally{g.free();copy.free();}
