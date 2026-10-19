import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {quests,storyBuildingKinds,goalRoute} from '../web/quests.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const g=new Game(),s=JSON.parse(g.snapshot()),v=s.village,report=JSON.parse(g.story_outcomes_report());
assert.deepEqual(report.building_paths,storyBuildingKinds);assert.equal(quests.length,13);
const taught=new Set();let optional=0;
for(const q of quests)for(const o of [...q.objectives(v),...q.options(v)]){
 assert(Number.isFinite(o.value)&&Number.isFinite(o.target),o.label);
 assert(goalRoute(s,o),'Every lesson has a player-facing next step: '+o.label);
 if(o.build)taught.add(o.build);
}
for(const q of quests)optional+=q.options(v).length;
assert.deepEqual([...taught].sort(),[...storyBuildingKinds].sort(),'All buildings remain taught in primary or optional lessons');
for(const [chapter,index,window]of [[1,3,0],[5,1,1],[7,5,2],[10,0,3],[12,1,4]]){
 assert.equal(quests[chapter].objectives(v)[index].target*60,report.target_minutes[window]);
}
assert.equal(quests[0].objectives(v).find(o=>o.build==='home').target,1,'Arrival needs one home; later housing can be planned early');
assert.equal(quests[12].objectives(v).some(o=>/every.*building/i.test(o.label)),false);
const orchard=structuredClone(s);orchard.village.buildings=[{kind:'orchard',id:0,progress:0}];orchard.environment.economy.projects=[{kind:'orchard',building:0,recipe:'standard'}];
assert.equal(goalRoute(orchard,quests[1].objectives(orchard.village)[0]).type,'project','Choosing the orchard path must not prompt a food forest instead');
const homes={village:{buildings:[{kind:'home',id:0,progress:100},{kind:'home',id:1,progress:0}],economy:{projects:[{building:0,recipe:'adobe'},{building:1,recipe:'standard'}]},building_jobs:[]},environment:{economy:{projects:[{kind:'home',building:1,recipe:'standard'}]}}};
assert.deepEqual(goalRoute(homes,{build:'home',recipe:'adobe',target:1}),{type:'visit',id:0},'Review the completed material method even while a different home is under construction');
const before=g.snapshot();g.story_outcomes_report();assert.equal(g.snapshot(),before);g.free();
console.log(`PASS: thirteen outcome chapters, ${optional} separate optional lessons, all ${storyBuildingKinds.length} building types taught, native observation targets, meaningful orchard and recipe routes, finite progress and read-only reports.`);
