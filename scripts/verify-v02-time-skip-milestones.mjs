import assert from 'node:assert/strict';
import {upcomingMilestones, milestoneTime,animalProductionDays} from '../web/v02/weekend/time-skip-milestones.js';
import {DAY} from '../web/v02/weekend/weather.js';
import {ANIMAL_RATIONS,animalStep,animalAvailable} from '../web/v02/weekend/animal-care.js';
const s={time:0,mode:'story',projects:[{id:1,key:'garden',cultivation:{beds:[{id:0,crop:'greens',stage:'growing',growth:.99,moisture:.4,fertility:1,density:1},{id:1,crop:'beans',stage:'harvestable',ripeAt:0}]}}],operations:[{recipe:'compost',phase:'growing',growthRemaining:2*DAY}]};
const before=structuredClone(s),events=upcomingMilestones(s,1);assert.deepEqual(s,before);assert.equal(events[0].remaining,0);assert(events.every((e,i)=>i===0||e.remaining>=events[i-1].remaining));assert(events.find(e=>e.title.includes('greens')).estimated);assert(!events.find(e=>e.title.includes('compost')).withinSkip);assert(upcomingMilestones(s,2).find(e=>e.title.includes('compost')).withinSkip);
s.projects[0].cultivation.beds[0].moisture=0;assert(!upcomingMilestones(s,1).some(e=>e.title.includes('greens')));assert.equal(upcomingMilestones({...s,mode:'sandbox'},10).length,0);assert.equal(milestoneTime({remaining:0}),'Now');
for(const kind of ['coop','goat_pasture'])for(const health of [0,35,100]){
 const ration=ANIMAL_RATIONS[kind],p={id:2,key:kind,animalHealth:health,animalCare:{version:1,feed:100,water:1000,pending:.3,lots:[],produced:0,spoiled:0,collected:0}},v={time:0,mode:'story',projects:[p],operations:[]};
 const predicted=animalProductionDays(p,ration)*DAY;const event=upcomingMilestones(v,30).find(e=>e.title.includes('next'));assert(Math.abs(event.remaining-predicted)<1e-8);
 while(!animalAvailable(p)&&v.time<predicted+1){v.time+=.1;animalStep(v,p,kind,.1);}assert(Math.abs(v.time-predicted)<.11,`${kind} health ${health}: prediction follows actual production`);
 p.animalCare.feed=0;p.animalCare.water=0;p.animalCare.lots=[];assert(upcomingMilestones(v,30).some(e=>e.blocked));
}
console.log('PASS read-only harvest milestones, horizons, stalled crops, sandbox and actual egg/milk production at three health levels');
