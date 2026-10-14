import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {quests,buildingUnlocked,questAvailable,completedQuests,unlockQuest,goalRoute} from '../web/quests.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const snap=g=>JSON.parse(g.snapshot());
const story=new Game();
const buildings=snap(story).environment.economy.recipes.map(r=>r.kind);
assert.equal(quests.length,13);
for(let chapter=0;chapter<quests.length;chapter++) {
  const fixture=snap(story);
  fixture.village.progress.completed=Array.from({length:4},(_,i)=>i<chapter);
  fixture.village.progress.later_completed=Array.from({length:quests.length-4},(_,i)=>i+4<chapter);
  fixture.village.progress.tracked=chapter;
  assert(story.restore(JSON.stringify(fixture)));
  const v=snap(story).village;
  for(let i=0;i<quests.length;i++)assert.equal(questAvailable(v,i),i<=chapter);
  assert.deepEqual(completedQuests(v),Array.from({length:quests.length},(_,i)=>i<chapter));
  for(const kind of buildings) {
    const g=new Game();assert(g.restore(story.snapshot()));
    const allowed=unlockQuest[kind]===undefined || unlockQuest[kind]<chapter;
    assert.equal(buildingUnlocked(v,kind),allowed);
    const before=g.snapshot(),result=g.place(kind,kind==='hydro'?26:5,5);
    assert.equal(result==='ok',allowed,`${kind} at chapter ${chapter+1}`);
    if(!allowed)assert.equal(g.snapshot(),before,'locked placement cannot mutate village');
    else assert.equal(snap(g).village.buildings[0].progress,0,'Story requires construction');
    g.free();
  }
}
for(const kind of buildings) {
  const g=new Game();assert(g.start_mode('sandbox'));
  const before=snap(g);
  assert.equal(g.place(kind,kind==='hydro'?26:5,5),'ok',kind);
  const after=snap(g);
  assert.equal(after.village.buildings[0].progress,100);
  assert.equal(after.environment.economy.projects.length,0);
  assert.equal(after.village.wood,before.village.wood);
  assert.equal(after.village.economy.money,before.village.economy.money);
  assert.deepEqual(after.village.economy.stock,before.village.economy.stock);
  assert(!g.track_quest(0));
  const saved=g.snapshot(),restore=new Game();assert(restore.restore(saved));assert.equal(restore.snapshot(),saved);
  const invalid=JSON.parse(saved);invalid.village.mode='unknown';assert(!restore.restore(JSON.stringify(invalid)));assert.equal(restore.snapshot(),saved);
  assert(!restore.start_mode('unknown'));assert.equal(restore.snapshot(),saved);
  assert(restore.remove_sandbox_building(0));assert.equal(snap(restore).village.buildings.length,0);
  assert(restore.restore(restore.snapshot()));assert.equal(restore.place(kind,kind==='hydro'?26:5,5),'ok');
  assert(restore.start_mode('story'));assert(!restore.remove_sandbox_building(0));assert.equal(snap(restore).village.buildings.length,0);assert.equal(snap(restore).village.mode,'story');
  g.free();restore.free();
}
const g=new Game();assert.equal(g.host_gathering().includes('Roots for Tomorrow'),true);assert.equal(g.contribute_tool_library().includes('A Place to Gather'),true);
assert.equal(goalRoute({village:{buildings:[{id:0,kind:'coop',progress:100}]},environment:{economy:{projects:[]}}},{build:'coop',target:3,buildTarget:1}).type,'visit');
g.free();story.free();
console.log('PASS: all 17 buildings across thirteen Story chapters, Rust/UI unlock agreement, atomic locked actions, free instant Sandbox construction, mode saves, invalid modes and fresh restarts.');
