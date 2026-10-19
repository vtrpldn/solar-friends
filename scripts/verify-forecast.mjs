import {restockFixtureFood,restockFixtureWater} from '../web/dev/material-fixture.js';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {createProjectForecasts,forecastPlan} from '../web/forecasts.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
await mkdir('artifacts/forecasts',{recursive:true});
const snap=g=>JSON.parse(g.snapshot());
const g=new Game(),fixture=snap(g);
Object.assign(fixture.village,{arrived:true,minutes:540,food:80,meals:10,water:40});
for(const r of fixture.residents)Object.assign(r,{task:'idle',remaining:0,energy:90,hunger:10,social:90,last_meal_slot:0,x:10+(r.id-2)*1.25,y:13,target_x:10+(r.id-2)*1.25,target_y:13});
assert(g.restore(JSON.stringify(restockFixtureWater(restockFixtureFood(fixture)))));assert.equal(g.place('garden',13,15),'ok');
const before=g.snapshot(),report=JSON.parse(g.project_forecast(1));
assert.equal(g.snapshot(),before,'Forecasting cannot advance the clock or spend, reserve or pay anything in the live village');
await writeFile('artifacts/forecasts/project.json',before);
await writeFile('artifacts/forecasts/report.json',JSON.stringify(report,null,2));
assert.equal(report.projects.length,1);assert(report.projects[0].completed_at);
let actual=null;
while(snap(g).village.minutes<report.through){
 g.tick(.25);const s=snap(g);
 if(actual===null&&s.village.buildings[0].progress===100)actual=s.village.minutes;
}
assert.equal(actual,report.projects[0].completed_at,'The conditional completion comes from actual hauling, work and breaks');
assert(actual>=report.projects[0].window[0]&&actual<=report.projects[0].window[1]);
assert.equal(snap(g).village.economy.money,report.funds_projected);
const away=new Game();assert(away.restore(before));for(let id=0;id<5;id++)assert(away.set_resident_job(id,true));
await writeFile('artifacts/forecasts/outside-shifts.json',away.snapshot());
const shifted=JSON.parse(away.project_forecast(1));
assert(shifted.funds_projected>report.funds_projected,'Outside shifts contribute income over the same horizon');
assert(!shifted.projects[0].completed_at||shifted.projects[0].completed_at>actual,'Outside work takes people away from village projects');
if(shifted.projects[0].completed_at)assert.equal(shifted.projects[0].blocker,null,'Working after their shift can finish the project without a blocker');
else assert.match(shifted.projects[0].blocker,/outside shifts/,'A staffing shortage must not be reported as a broken route');
assert.equal(g.project_forecast(0),JSON.stringify({error:'Choose a forecast window of 1–14 days.'}));

const changedFood=JSON.parse(before);changedFood.village.supplies.feed_hens=!changedFood.village.supplies.feed_hens;
assert.notEqual(forecastPlan(changedFood),forecastPlan(JSON.parse(before)),'Food preferences change the real work queue and must invalidate its forecast');
const soilPlan=JSON.parse(before),originalPlan=forecastPlan(soilPlan);
soilPlan.village.restoration.push({id:999,x:18,y:18,size:2,cancelled:false,work:0,finished:null});
assert.notEqual(forecastPlan(soilPlan),originalPlan,'Queued soil work changes the shared workload');
const queuedPlan=forecastPlan(soilPlan);soilPlan.village.restoration[0].work=32;soilPlan.village.restoration[0].finished=600;
assert.equal(forecastPlan(soilPlan),queuedPlan,'Ordinary restoration progress and completion are already in the conditional replay');
soilPlan.village.restoration[0].cancelled=true;
assert.notEqual(forecastPlan(soilPlan),queuedPlan,'Cancelling soil work changes the shared workload');
const learningPlan=JSON.parse(before),learningBefore=forecastPlan(learningPlan);
learningPlan.village.skills.people[0].experience[0]+=1;
assert.equal(forecastPlan(learningPlan),learningBefore,'Ordinary earned practice is already part of the conditional replay');
learningPlan.village.skills.enabled=!learningPlan.village.skills.enabled;
assert.notEqual(forecastPlan(learningPlan),learningBefore,'Pausing skill benefits changes work pace and must invalidate the forecast');

// A cancelled or superseded background replay cannot overwrite a newer result.
const previousWorker=globalThis.Worker,workers=[];
class TestWorker {
 constructor(){workers.push(this);}
 postMessage(data){this.data=data;}
 terminate(){this.stopped=true;}
}
globalThis.Worker=TestWorker;
try{
 let live=JSON.parse(before),refreshes=0;
 const view=createProjectForecasts({checkpoint:()=>JSON.stringify(live),refresh:()=>refreshes++});
 const project={kind:'garden',building:0};
 view.start();const first=workers.at(-1);assert.equal(first.data.days,7);assert(view.summary().pending);
 view.start();const second=workers.at(-1);assert(first.stopped);
 first.onmessage({data:{report}});assert(view.summary().pending,'An old replay cannot stop its replacement');
 view.cancel();second.onmessage({data:{report}});assert(!view.summary().pending);assert.equal(view.render(project),'');
 view.start();workers.at(-1).onmessage({data:{report}});
 assert(view.render(project).includes('If current plans hold'));assert(view.summary().status.includes('Projected shared fund'));
 const plan=forecastPlan(live);live.village.minutes+=3;live.residents[0].x+=.1;
 assert.equal(forecastPlan(live),plan,'Ordinary walking and clock progress do not invalidate the replay');assert(!view.observe(live));
 live.village.economy.outside_jobs[0]=true;assert(view.observe(live));assert.equal(view.render(project),'');assert(view.summary().status.includes('Plans changed'));
 view.start();const pending=workers.at(-1);view.invalidate();assert(pending.stopped);
 pending.onerror();assert(view.summary().status.includes('Plans changed'),'Late worker errors cannot overwrite a cancellation');
 view.reset();assert.equal(view.summary().label,'Forecast workweek');assert.equal(view.render(project),'');assert(refreshes>0);
}finally{globalThis.Worker=previousWorker;}
g.free();away.free();
console.log('PASS: read-only project and fund forecasts match real play, outside shifts trade completion for income, rounded dates contain completion, and cancelled or outdated workers cannot publish stale results.');
