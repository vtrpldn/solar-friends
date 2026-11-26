import assert from 'node:assert/strict';
import {createSandbox,plan,queueProduction,tick,save,restore,enableFastNavigation,PROCESSES,MATERIALS,sellMaterial} from '../web/v02/weekend/simulation.js';
import {RESOURCE_GROUPS} from '../web/v02/weekend/resource-groups.js';
import {CROPS} from '../web/v02/weekend/cultivation.js';
import {foodChange,ensureFoodStorage,foodStorageStep,FOOD_DAYS} from '../web/v02/weekend/food-storage.js';
import {cancelExport} from '../web/v02/weekend/physical-trade.js';
import {recipeBalance} from '../web/v02/weekend/production-accounting.js';
import {village,advance} from './fixtures.mjs';
for(const crop of Object.keys(CROPS)){
 for(const id of [crop,`${crop}_seed`])assert(RESOURCE_GROUPS.some(group=>group.ids.includes(id)),`${id} must be reachable in inventory and trade`);
 let s=village({sandbox:true}).s;assert.equal(plan(s,'kitchen',50,50),'');const site=s.projects.at(-1);
 // Unlimited sandbox supplies isolate recipe routing and physical resident work;
 // regular-mode assertions below cover reservations, shelf lives and sale refunds.
 const generic=s.materials.food,before=s.materials[crop],meals=s.materials.meals;
 assert.equal(queueProduction(s,site.id,`cook_${crop}`),'');assert.equal(s.materials[crop],before-4);assert.equal(s.materials.food,generic);
 let op=s.operations.at(-1),resumed=false;
 for(let i=0;i<40000&&!op.done;i++){
  tick(s,.1);
  if(!resumed&&op.phase==='return'){
   assert.equal(s.materials.meals,meals,'cooked output stays out of stores until delivered');
   s=restore(save(s));assert(s,'cooked cargo reloads');enableFastNavigation(s);op=s.operations.find(o=>o.id===op.id);resumed=true;
  }
 }
 assert(op.done,`${crop} cooking finishes: ${op.status}`);assert(resumed);assert.equal(s.materials.meals,meals+4);
 assert.equal(recipeBalance(`cook_${crop}`,PROCESSES[`cook_${crop}`]).lossKg,2,'cooking water leaves as evaporation');
 const trade=village({sandbox:true,story:true,fast:false}).s;delete trade.foodStorage;for(const id of Object.keys(FOOD_DAYS))trade.materials[id]=0;ensureFoodStorage(trade);foodChange(trade,crop,24);
 assert(sellMaterial(trade,crop),`${crop} has an explicit market product`);const order=trade.trade.orders.at(-1);assert.equal(order.material,crop);assert(restore(save(trade)));
 assert(cancelExport(trade,order.id,foodChange));assert.equal(trade.materials[crop],24);assert.equal(trade.materials.food,0);
 trade.time=FOOD_DAYS[crop]*3200;foodStorageStep(trade,PROCESSES,MATERIALS);assert.equal(trade.materials[crop],0);assert.equal(trade.materials.scraps,createSandbox(42).materials.scraps+24);
 const waste=trade.materials.scraps;foodStorageStep(trade,PROCESSES,MATERIALS);assert.equal(trade.materials.scraps,waste,'expiry creates residues once');
}
const feed=village({sandbox:true}).s;assert.equal(plan(feed,'supply-5',50,50),'');const site=feed.projects.at(-1),corn=feed.materials.corn,fodder=feed.materials.fodder,scraps=feed.materials.scraps;
assert.equal(queueProduction(feed,site.id,'corn_feed'),'');assert.equal(feed.materials.corn,corn-4);const op=feed.operations.at(-1);advance(feed,{seconds:4000,until:()=>op.done});
assert(op.done);assert.equal(feed.materials.fodder,fodder+1);assert.equal(feed.materials.scraps,scraps+1);assert.equal(recipeBalance('corn_feed',PROCESSES.corn_feed).lossKg,2);assert(restore(save(feed)));
console.log('PASS distinct crop cooking, physical delivery and cargo reload; trade reservation/refund, shelf life, nonduplicating spoilage and corn feed balance');
