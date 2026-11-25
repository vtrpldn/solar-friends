import assert from 'node:assert/strict';
import {MATERIALS,PROCESSES,PROJECTS,createSandbox,save,restore} from '../web/v02/weekend/simulation.js';
import {CROPS,cultivationStep,ensureCultivation,validCultivation} from '../web/v02/weekend/cultivation.js';
import {seedId,cropFacts} from '../web/v02/weekend/crops.js';
import {FOOD_DAYS,freshLots} from '../web/v02/weekend/food-storage.js';
import {materialMass} from '../web/v02/weekend/material-measures.js';
import {buyerFor,supplierFor} from '../web/v02/weekend/local-market.js';
import {recipeBalance} from '../web/v02/weekend/production-accounting.js';
import {GAME_DAY,seasonAt} from '../web/v02/weekend/biological-production.js';

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
console.log('PASS Brazilian staple crops: complete stock items, drought tolerance, dry-season growth, farinha and older saves');
