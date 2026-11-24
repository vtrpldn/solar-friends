import {reserveSupplier,purchaseCategory} from './supplier-stock.js';
import {blueprintManifest,fitsCargo,receiveBlueprintShipment,transportCost,TRUCK_LIMITS} from './physical-trade.js';
import {uncollectedProjects} from './trip-state.js';
import {transact} from './finances.js';
import {spendableMoney} from './procurement-budget.js';
import {freshLots,FOOD_DAYS} from './food-storage.js';
import {tripEstimate} from './economy-reference.js';
import {TRUCK_DRIVE,TRUCK_UNLOAD} from './delivery-truck.js';
export const DELIVERY_LIMITS=TRUCK_LIMITS;
export function orderDelivery(s,id,project,materials,stored,capacity){
 if(s.delivery||s.stage!=='playing')return false;
 const item=materials[id],shipments=project?blueprintManifest(uncollectedProjects(s),DELIVERY_LIMITS):null;
 if(!item?.quantity||(project&&!shipments.length)||(!project&&(!fitsCargo({[id]:item.quantity},DELIVERY_LIMITS)||stored+item.quantity>capacity)))return false;
 const fare=transportCost({...s,deliveryOnly:true}),cost=project?0:item.price;
 if((project?s.money:spendableMoney(s))<fare+cost)return false;
 if(!project&&!reserveSupplier(s,{[id]:item.quantity},materials))return false;
 if(cost)transact(s,-cost,purchaseCategory(id),`Supplier delivery: ${item.name}`);
 transact(s,-fare,'transport','Supplier delivery freight');
 const duration=(360+tripEstimate(s.worldSettings?.town).minutes)/.45;
 s.delivery={material:id,quantity:project?0:item.quantity,left:duration,duration,...(shipments?{shipments}:{})};
 if(!project&&FOOD_DAYS[id])s.delivery.foodLots=freshLots(s,id,item.quantity);
 return true;
}
export function deliveryStep(s,dt,materials,changeMaterial,stored,capacity){
 if(s.truckLeaving){s.truckLeaving.left-=dt;if(s.truckLeaving.left<=0)delete s.truckLeaving;}
 const d=s.delivery;if(!d)return;
 if(d.left>0){d.left=Math.max(0,d.left-dt);return;}
 // Parked: the goods count as received once the crane has cleared the bed.
 d.unloaded=Math.min(TRUCK_UNLOAD,(d.unloaded||0)+dt);if(d.unloaded<TRUCK_UNLOAD)return;
 if(d.shipments)receiveBlueprintShipment(s,d);
 else{
  const quantity=d.foodLots?d.foodLots.reduce((n,l)=>n+l.n,0):d.quantity;
  if(stored+quantity>capacity){d.status='Delivery waiting: storage full';return;}
  changeMaterial(s,d.material,quantity,d.foodLots);
 }
 s.delivery=null;s.truckLeaving={left:TRUCK_DRIVE};
}
export function validDelivery(s,materials){
 if(s.deliveryOnly!==undefined&&typeof s.deliveryOnly!=='boolean')return false;
 const out=s.truckLeaving;if(out!==undefined&&(!out||!Number.isFinite(out.left)||out.left<=0||out.left>TRUCK_DRIVE))return false;
 const d=s.delivery;if(!d)return true;
 if(d.unloaded!==undefined&&(!Number.isFinite(d.unloaded)||d.unloaded<0||d.unloaded>TRUCK_UNLOAD||d.left>0))return false;
 if(!materials[d.material]||!Number.isFinite(d.duration)||d.duration<=0||d.duration>1200||!Number.isFinite(d.left)||d.left<0||d.left>d.duration)return false;
 if(!d.shipments)return d.quantity===materials[d.material].quantity;
 if(!Array.isArray(d.shipments)||!d.shipments.length||d.shipments.length>512)return false;
 const cargo={},seen=new Set();for(const part of d.shipments){const p=s.projects.find(p=>p.id===part.project);if(!p?.pendingMaterials||seen.has(p.id)||!part.items)return false;seen.add(p.id);
  for(const [id,n]of Object.entries(part.items)){if(!materials[id]||!Number.isFinite(n)||n<=0||n>(p.pendingMaterials[id]||0))return false;cargo[id]=(cargo[id]||0)+n;}
 }
 return fitsCargo(cargo,DELIVERY_LIMITS);
}
