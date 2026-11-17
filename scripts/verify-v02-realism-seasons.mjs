import assert from 'node:assert/strict';
import {DAY,weatherStep} from '../web/v02/weekend/weather.js';
import {ensureHydrology,hydrologyStep,extractWater} from '../web/v02/weekend/hydrology.js';
import {ensureCultivation,cultivationStep,finishFarmJob} from '../web/v02/weekend/cultivation.js';
import {ensureAnimalCare,animalStep,collectAnimal} from '../web/v02/weekend/animal-care.js';
const results=[];
for(const biome of ['mata-atlantica','cerrado','caatinga'])for(const water of ['dry','seasonal','abundant']){
 const field={id:1,key:'garden',work:1},coop={id:2,key:'coop',animalHealth:100};
 const s={time:0,landSeed:42,mode:'story',worldSettings:{biome,water},projects:[field,coop],operations:[]};ensureHydrology(s);ensureCultivation(s,field);
 const animal=ensureAnimalCare(s,coop,'coop');let fodder=122,harvested=0,failed=0,eggs=0;
 for(const b of field.cultivation.beds)Object.assign(b,{stage:'growing',growth:0,irrigation:true});
 for(let hour=0;hour<365*24;hour++){
  s.time+=DAY/24;weatherStep(s,DAY/24);hydrologyStep(s,DAY/24);
  cultivationStep(s,DAY/24,(_s,_id,n)=>{if(s.hydrology.river<n)return false;extractWater(s,'river',n);return true;},{garden:{work:1}});
  if(hour%72===0&&fodder>=1&&s.hydrology.river>=2){fodder--;animal.feed+=1;animal.water+=extractWater(s,'river',2);}
  animalStep(s,coop,'coop',DAY/24);
  if(hour%24===23)eggs+=collectAnimal(s,coop,'eggs',6).output.eggs;
  for(const b of field.cultivation.beds)if(['harvestable','failed'].includes(b.stage)){
   if(b.stage==='failed')failed++;
   const op={farm:{bed:b.id,action:b.stage==='failed'?'clear':'harvest'}};finishFarmJob(s,field,op);harvested+=op.harvestOutput.greens||0;
   Object.assign(b,{stage:'growing',growth:0,stress:0,elapsed:0,drySeconds:0,droughtDamage:0});
  }
 }
 assert(eggs>0&&eggs<=730);assert(coop.animalHealth>=0&&coop.animalHealth<=100);assert(harvested>0,`${biome}/${water} irrigated cultivation yields food`);
 assert(s.hydrology.groundwater>=0&&s.hydrology.river>=0);results.push({biome,water,harvestedKg:harvested,failedBeds:failed,eggs});
}
console.log(JSON.stringify(results));console.log('PASS 365-day coupled weather, water, irrigated crops and ration-limited animals across nine environments (diagnostic labor fixture)');
