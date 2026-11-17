import assert from 'node:assert/strict';
import {createWeekend,chooseCamp,planField,queueBedJob,plantingPurchase,tick,save,restore,committedMaterials,enableFastNavigation,MATERIALS,PROJECTS,PROCESSES} from '../web/v02/weekend/simulation.js';
import {queueCultivation} from '../web/v02/weekend/cultivation-overview.js';
import {inventoryOwnership} from '../web/v02/weekend/economy-inventory.js';
function fresh(){
 const s=createWeekend();chooseCamp(s,'clearing');enableFastNavigation(s);s.money=1000;s.autoBuy=true;s.autoFood=false;
 for(let x=35;x<50&&!s.projects.some(p=>p.key==='field');x+=3)for(let z=24;z<45;z+=3){if(!planField(s,x,z,[2,2]))break;}
 const p=s.projects.find(p=>p.key==='field');assert(p);
 p.cultivation.beds.forEach(b=>b.stage='prepared');
 for(const id of ['greens_seed','beans_seed','corn_seed'])s.materials[id]=0;
 return {s,p};
}
const run=(s,seconds,done)=>{for(let i=0;i<seconds*4;i++){tick(s,.25);if(done())return true;}return false;};
{
 const {s,p}=fresh();s.autoBuy=false;const before=save(s);
 assert.match(queueBedJob(s,p.id,0,'plant'),/Auto-buy is off/);assert.equal(save(s),before);
 s.autoBuy=true;s.money=0;assert.match(queueBedJob(s,p.id,0,'plant'),/savings/);assert.equal(s.operations?.length||0,0);
}
{
 const {s,p}=fresh();s.materials.greens_seed=1;s.autoBuy=false;
 assert.equal(queueBedJob(s,p.id,0,'plant'),'');assert.equal(s.materials.greens_seed,0);assert(!s.operations.at(-1).waitingSeeds);
}
{
 const {s,p}=fresh();const quote=plantingPurchase(s,p.cultivation.beds[0]);assert.equal(quote.cost,MATERIALS.greens_seed.price);
 const result=queueCultivation(s,p,'plant');assert.equal(result.queued,p.cultivation.beds.length);
 assert.equal(queueCultivation(s,p,'plant').queued,0,'Repeated click cannot buy or queue twice');
 assert.equal(committedMaterials(s).greens_seed||0,0,'Unpurchased seeds are not reserved inventory');
 assert.equal(inventoryOwnership(s,PROJECTS,PROCESSES,MATERIALS).rows.greens_seed.processing,0);
 assert(run(s,60,()=>s.trip?.material==='greens_seed'),'A resident collects seeds automatically');
 const bought=s.suppliers.greens_seed.units;assert.equal(bought,5);
 assert(s.operations.filter(o=>o.farm).every(o=>o.work===0),'No planting before seed arrival');
 const invalid=JSON.parse(save(s));invalid.operations.find(o=>o.waitingSeeds).work=1;assert.equal(restore(JSON.stringify(invalid)),null,'Waiting jobs cannot claim completed work');
 const loaded=restore(save(s));assert(loaded,'Waiting planting and paid seed trip survive reload');enableFastNavigation(loaded);
 assert(run(loaded,1800,()=>loaded.operations.filter(o=>o.farm).every(o=>!o.waitingSeeds)),'Delivered seeds release planting jobs');
 assert.equal(loaded.suppliers.greens_seed.units,bought,'Incoming packets are not bought twice');
 assert(run(loaded,1800,()=>loaded.projects.find(a=>a.id===p.id).cultivation.beds.some(b=>b.stage==='growing')),'Resident physically plants after collection');
 assert(restore(save(loaded)),'Completed planting reloads');
}
{
 const {s,p}=fresh();s.deliveryOnly=true;
 assert.equal(queueBedJob(s,p.id,0,'plant'),'');
 assert(run(s,2,()=>!!s.delivery),'Delivery-only villages order seeds');assert.equal(s.delivery.material,'greens_seed');
 const loaded=restore(save(s));assert(loaded);enableFastNavigation(loaded);
 assert(run(loaded,1200,()=>!loaded.operations.find(o=>o.farm).waitingSeeds),'Delivered packets unlock planting');
}
{
 const {s,p}=fresh();s.autoBuy=false;
 run(s,15,()=>false);
 assert(!s.operations?.some(o=>o.waitingSeeds),'No automatic seed orders with Auto-buy off');
 s.autoBuy=true;
 assert(run(s,1800,()=>p.cultivation.beds.some(b=>b.stage==='growing')),
   'An unattended prepared field buys, receives and plants missing seed');
 assert.equal(s.suppliers.greens_seed.units,MATERIALS.greens_seed.quantity,'One paid pack serves the field');
}
console.log('PASS seed auto-buy: toggle, funds, existing stock, bulk jobs, physical pickup/delivery, no duplicates, ownership, planting and saves');
