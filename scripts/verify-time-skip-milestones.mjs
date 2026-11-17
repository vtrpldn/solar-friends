import assert from 'node:assert/strict';
import {upcomingMilestones, milestoneTime} from '../web/v02/weekend/time-skip-milestones.js';
import {DAY} from '../web/v02/weekend/weather.js';
const s={time:0,mode:'story',projects:[{id:1,key:'garden',cultivation:{beds:[
 {id:0,crop:'greens',stage:'growing',growth:.99,moisture:.4,fertility:1,density:1},
 {id:1,crop:'beans',stage:'harvestable',ripeAt:0},
]}}],operations:[{recipe:'compost',phase:'growing',growthRemaining:2*DAY}],people:[{id:'iara',name:'Iara',outsideWork:{phase:'away',until:100}}],foodStorage:{lots:{milk:[{n:1,expires:DAY},{n:0,expires:1}]}},suppliers:{wood:{day:0,units:1}},trip:{person:'iara',phase:'inbound',left:200}};
const before=structuredClone(s),events=upcomingMilestones(s,1);
assert.deepEqual(s,before,'projection is read-only');
assert.equal(events[0].title,'Iara: shift ends');
assert(events.every((e,i)=>i===0||e.remaining>=events[i-1].remaining));
assert(events.find(e=>e.title.includes('ready to harvest')).estimated);
assert.equal(events.find(e=>e.title.includes('oldest')).remaining,DAY);
assert(events.find(e=>e.title.includes('oldest')).withinSkip,'inclusive skip boundary');
assert(!events.find(e=>e.title.includes('compost')).withinSkip);
assert(upcomingMilestones(s,2).find(e=>e.title.includes('compost')).withinSkip);
assert.equal(events.find(e=>e.title.includes('restock')).remaining,DAY*15/24);
assert.equal(events.find(e=>e.title.includes('losses')).remaining,7*DAY);
s.projects[0].cultivation.beds[0].moisture=0;
assert(!upcomingMilestones(s,1).some(e=>e.title.includes('ready to harvest')),'stalled growth gets no false ETA');
assert.equal(upcomingMilestones({...s,mode:'sandbox',trip:null},10).length,0,'sandbox does not predict disabled decay or growth');
assert.equal(upcomingMilestones({time:0},1).length,0);
assert.equal(milestoneTime({remaining:0}), 'Now');
console.log('PASS: milestones ordered, horizon updates, crop estimates, expiry/restock/shift timers, sandbox, stalled growth and read-only state.');
