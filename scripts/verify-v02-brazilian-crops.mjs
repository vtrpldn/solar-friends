import assert from 'node:assert/strict';
import {MATERIALS,PROCESSES,PROJECTS,createSandbox,save,restore,plan,enableFastNavigation,holdInGround} from '../web/v02/weekend/simulation.js';
import {CROPS,cultivationStep,ensureCultivation,validCultivation} from '../web/v02/weekend/cultivation.js';
import {seedId,cropFacts} from '../web/v02/weekend/crops.js';
import {FOOD_DAYS,freshLots} from '../web/v02/weekend/food-storage.js';
import {materialMass} from '../web/v02/weekend/material-measures.js';
import {buyerFor,supplierFor} from '../web/v02/weekend/local-market.js';
import {recipeBalance} from '../web/v02/weekend/production-accounting.js';
import {BIOLOGY,CROP_CARE,GAME_DAY,seasonAt,validBiology,beginBiology,biologicalStep,biologyText,orchardPlanting,NATIVE_ORCHARDS} from '../web/v02/weekend/biological-production.js';

// Every crop in the table is a complete stock item: product, planting stock,
// shelf life, measure, buyer, supplier and a cooking recipe that loses mass.
for(const id of ['cassava','sweet_potato','pumpkin','cowpea'])assert(CROPS[id],`${id} is a bed crop`);
for(const [id,crop] of Object.entries(CROPS)){
 assert.equal(MATERIALS[id].price,crop.price);assert.equal(FOOD_DAYS[id],crop.shelf);
 assert.equal(MATERIALS[seedId(id)].name,`${crop.name} ${crop.start[0]}`);
 assert.equal(materialMass({[id]:3,[seedId(id)]:2}),3+2*crop.start[1]);
 assert.equal(buyerFor(id).name,'Town produce stall');assert.equal(supplierFor(seedId(id)),'Agricultural supply store');
 assert.deepEqual(PROCESSES[`cook_${id}`].input,{[id]:4});assert(recipeBalance(`cook_${id}`,PROCESSES[`cook_${id}`]).lossKg>=0);
 assert(crop.local&&crop.note&&cropFacts(id).includes(String(crop.days)));
}
assert.equal(MATERIALS.cassava_seed.name,'Cassava cutting bundles');

// One bed of each crop on the same land, with irrigation off.
const village=(biome,crops)=>{
 const p={id:1,key:'field',fieldSize:[4,2],work:10000};
 const s={time:0,mode:'story',worldSettings:{biome},projects:[p],operations:[],infrastructure:{nodes:{1:{enabled:true}}}};
 ensureCultivation(s,p);
 crops.forEach((crop,i)=>Object.assign(p.cultivation.beds[i],{crop,stage:'growing',moisture:.75,irrigation:false}));
 return {s,beds:Object.fromEntries(crops.map((crop,i)=>[crop,p.cultivation.beds[i]]))};
};
const run=(s,days,each=()=>{})=>{for(let d=0;d<days;d++){s.time+=GAME_DAY;each();cultivationStep(s,GAME_DAY,()=>false,PROJECTS);}};

// Dry soil for eight days ruins beans; cassava is untouched and sweet potato only damaged.
{const {s,beds}=village('mata-atlantica',['beans','cassava','sweet_potato','cowpea']);
 run(s,8,()=>{for(const b of Object.values(beds))b.moisture=0;});
 assert.equal(beds.beans.stage,'failed');assert.equal(beds.cassava.stage,'growing');assert((beds.cassava.droughtDamage||0)<.01,'cassava survives eight dry days');
 assert.equal(beds.sweet_potato.stage,'growing');assert(beds.sweet_potato.droughtDamage>0&&beds.sweet_potato.droughtDamage<1);
 assert(beds.cowpea.droughtDamage<1);assert(validCultivation(s));
 run(s,26,()=>{beds.cassava.moisture=0;});assert.equal(beds.cassava.stage,'failed','no crop is immune to drought');}

// In the Caatinga winter, watered soil still grows the drought-adapted crops
// at their floor while beans crawl; in summer the floor changes nothing.
const seasonal=(season)=>{
 const {s,beds}=village('caatinga',['beans','cowpea','cassava']);
 while(seasonAt(s.time)!==season)s.time+=GAME_DAY;
 run(s,10,()=>{assert.equal(seasonAt(s.time),season);for(const b of Object.values(beds))b.moisture=.75;});
 return Object.fromEntries(Object.entries(beds).map(([id,b])=>[id,b.growth*CROPS[id].days]));
};
const winter=seasonal('Winter'),summer=seasonal('Summer');
assert(Math.abs(winter.beans-3)<.01&&Math.abs(winter.cowpea-6)<.01&&Math.abs(winter.cassava-7)<.01,JSON.stringify(winter));
for(const days of Object.values(summer))assert(Math.abs(days-10)<.01,JSON.stringify(summer));

// A village saved before these crops existed loads with empty stock, not free food.
const legacy=JSON.parse(save(createSandbox(42)));
for(const id of ['cassava','sweet_potato','pumpkin','cowpea']){delete legacy.materials[id];delete legacy.materials[seedId(id)];if(legacy.foodStorage)delete legacy.foodStorage.lots[id];}
legacy.mode='story';
const loaded=restore(JSON.stringify(legacy));assert(loaded,'older village loads');

// Farinha turns a cassava harvest into provisions that keep a month, losing only moisture.
{const r=PROCESSES.farinha,balance=recipeBalance('farinha',r);
 assert.deepEqual(r.input,{cassava:8});assert.equal(balance.lossKg,2);
 const [lot]=freshLots({time:0},'meals',4,r);assert(lot.preserved);assert.equal(lot.expires,30*GAME_DAY);
 assert.equal(freshLots({time:0},'meals',4,PROCESSES.preserve_meals)[0].expires,10*GAME_DAY);}

// An orchard is planted with the native fruit tree of a dry biome: pequi in the
// Cerrado, umbu in the Caatinga. Natives drink less, outlast dry soil and keep
// growing through the dry season; the Mata Atlântica orchard is unchanged.
{const orchard=(biome,season)=>{
  const s={time:0,mode:'story',worldSettings:{biome},projects:[{id:1,soilMoisture:.75,soilFertility:1}],
   operations:[{site:1,recipe:'fruit',phase:'growing',planted:true,growthRemaining:120*GAME_DAY}]};
  while(seasonAt(s.time)!==season)s.time+=GAME_DAY;
  return s;
 };
 const days=(s,n,moisture,water=()=>false)=>{for(let d=0;d<n;d++){s.time+=GAME_DAY;if(moisture!==undefined)s.projects[0].soilMoisture=moisture;biologicalStep(s,GAME_DAY,water);}return s.operations[0];};
 assert.equal(orchardPlanting({worldSettings:{biome:'mata-atlantica'}}),null);assert.equal(orchardPlanting({}),null);
 assert.equal(orchardPlanting({worldSettings:{biome:'cerrado'}}).species,'pequi');assert.equal(orchardPlanting({worldSettings:{biome:'caatinga'}}).species,'umbuzeiro');
 // Ten well-watered winter days: umbu grows eight days' worth, where the seasonal factor alone allows three.
 const grown=op=>120-op.growthRemaining/GAME_DAY;
 assert(Math.abs(grown(days(orchard('caatinga','Winter'),10,.75))-8)<.01);
 assert(Math.abs(grown(days(orchard('mata-atlantica','Winter'),10,.75))-7)<.01);
 assert(Math.abs(grown(days(orchard('cerrado','Summer'),10,.75))-10)<.01,'no bonus in the growing season');
 // Ten days of dry soil kill a Mata Atlântica orchard crop and leave umbu and pequi unharmed.
 assert.equal(days(orchard('mata-atlantica','Summer'),10,0).status,'Crop failed · resident clearing work remains');
 for(const biome of ['cerrado','caatinga']){const op=days(orchard(biome,'Summer'),10,0);assert.equal(op.phase,'growing');assert(!op.droughtDamage);}
 assert.match(days(orchard('caatinga','Summer'),80,0).status,/failed/,'two dry months still kill a native orchard');
 // Irrigation drawn in one dry day, from the same starting moisture.
 const drawn=biome=>{let liters=0;const s=orchard(biome,'Summer');s.projects[0].soilMoisture=.5;days(s,1,undefined,(_,__,n)=>{liters+=n;return true;});return liters;};
 const usual=drawn('mata-atlantica');assert(Math.abs(drawn('caatinga')-(usual-32*.75))<1e-6&&Math.abs(drawn('cerrado')-(usual-32*.5))<1e-6,'natives need a fraction of the irrigation');
 assert.match(days(orchard('cerrado','Summer'),1,.75).status,/^Pequi · Growing/);
 assert.match(biologyText('fruit',{worldSettings:{biome:'caatinga'}}),/planted with umbu/);assert.doesNotMatch(biologyText('fruit',{worldSettings:{biome:'mata-atlantica'}}),/native/);
 assert.equal(biologyText('bananas',{worldSettings:{biome:'caatinga'}}),biologyText('bananas'));
 // Each native orchard has its own model in the shared library.
 const {ASSETS}=await import('../web/v02/library/catalog.js');
 for(const n of Object.values(NATIVE_ORCHARDS))assert(ASSETS.some(a=>a.id===`orchard-${n.species}`),`orchard-${n.species} model`);}

// Coffee is a cash crop: a grove of its own, one crop a year from the third
// year, sold dried to the town café rather than eaten.
{assert.equal(PROJECTS.coffee.name,'Coffee grove');assert.deepEqual(PROJECTS.coffee.size,[6,6]);assert.equal(PROJECTS.coffee.materials.coffee_starts,40);
 assert.deepEqual(BIOLOGY.coffee,{days:330,window:21,seasonal:true,establish:730});assert.equal(CROP_CARE.coffee.kind,'coffee');
 assert.equal(buyerFor('coffee').name,'Local café');assert.equal(supplierFor('coffee_starts'),'Agricultural supply store');
 assert(!FOOD_DAYS.coffee,'dried coffee does not spoil');assert.equal(materialMass({coffee:24}),24);
 // Planting work done, the grove grows on its own for three years.
 const site={id:1,key:'coffee'},op={site:1,recipe:'coffee',phase:'process',work:500},s={time:0,mode:'story',projects:[site],operations:[op]};
 assert(beginBiology(s,op,{}));assert.equal(op.phase,'growing');assert.equal(op.establishmentDays,730);
 assert.equal(op.growthRemaining,(330+730)*GAME_DAY,'the first crop waits for the third year');assert(site.orchardEstablished);assert(validBiology(s,PROCESSES));
 const next={site:1,recipe:'coffee',phase:'process',work:500};assert(beginBiology(s,next,{}));assert.equal(next.growthRemaining,330*GAME_DAY,'later crops take one season');
 op.establishmentDays=610;assert(!validBiology(s,PROCESSES),'a tampered establishment period is rejected');
 // The grove is a normal building: it can be planned on open land and saved.
 const land=createSandbox(42);enableFastNavigation(land);let placed='none';for(let z=40;z<70&&placed;z++)for(let x=40;x<70&&placed;x++)placed=plan(land,'coffee',x,z);
 assert.equal(placed,'');assert(restore(save(land)));}

// Ripe cassava waits in the ground while the stores hold a kitchen batch, and is
// lifted when they run low or its time in the ground is nearly up. Other crops never wait.
{const s={time:20*GAME_DAY,materials:{cassava:8,beans:50}},bed=(crop,ripeDays)=>({crop,stage:'harvestable',ripeAt:s.time-ripeDays*GAME_DAY});
 assert(holdInGround(s,bed('cassava',5)));assert(!holdInGround(s,bed('cassava',54)),'lifted before the window closes');
 s.materials.cassava=7;assert(!holdInGround(s,bed('cassava',5)),'lifted when the stores run low');
 assert(!holdInGround(s,bed('beans',1)));s.materials.sweet_potato=50;assert(!holdInGround(s,bed('sweet_potato',1)));}
console.log('PASS Brazilian staple crops: complete stock items, drought tolerance, dry-season growth, farinha, native orchards, coffee and older saves');
