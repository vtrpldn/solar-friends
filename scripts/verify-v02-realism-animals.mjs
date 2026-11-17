import assert from 'node:assert/strict';
import {ANIMAL_RATIONS,animalStep,ensureAnimalCare,animalAvailable,collectAnimal,validAnimalCare} from '../web/v02/weekend/animal-care.js';
import {DAY} from '../web/v02/weekend/weather.js';
for(const kind of Object.keys(ANIMAL_RATIONS)){
 const p={id:1,key:kind,animalHealth:100},s={time:0,projects:[p],operations:[]},r=ANIMAL_RATIONS[kind],a=ensureAnimalCare(s,p,kind);a.feed=r.fodder;a.water=r.water;
 for(let hour=0;hour<24*r.days;hour++){s.time+=DAY/24;animalStep(s,p,kind,DAY/24);}
 assert.equal(animalAvailable(p),r.batch);assert.equal(p.animalHealth,100);assert(validAnimalCare(s));
 const c=collectAnimal(s,p,r.product,r.batch);assert.equal(c.output[r.product],r.batch);assert.equal(animalAvailable(p),0);
 for(let hour=0;hour<24*8;hour++){s.time+=DAY/24;animalStep(s,p,kind,DAY/24);}assert.equal(p.animalHealth,0);assert.equal(animalAvailable(p),0);
 a.feed=r.fodder;a.water=r.water;s.time+=DAY;animalStep(s,p,kind,DAY);assert.equal(p.animalHealth,5);assert(a.produced<r.batch+r.dailyOutput*.1);
 const clone=JSON.parse(JSON.stringify(s));animalStep(s,p,kind,1);animalStep(clone,clone.projects[0],kind,1);assert.deepEqual(s,clone);
}
const p={id:1,key:'coop'},s={time:0,projects:[p],operations:[{site:1,recipe:'eggs',phase:'growing',growthRemaining:DAY*1.5}]};const a=ensureAnimalCare(s,p,'coop');assert.equal(a.pending,3);ensureAnimalCare(s,p,'coop');assert.equal(a.pending,3);assert.equal(s.operations[0].phase,'process');
console.log('PASS daily production ceilings, deprivation, gradual recovery, collection ownership and one-time legacy progress migration');
