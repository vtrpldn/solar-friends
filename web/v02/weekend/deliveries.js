import {blueprintManifest,fitsCargo,receiveBlueprintShipment,transportCost} from './physical-trade.js';
import {uncollectedProjects} from './trip-state.js';
import {transact} from './finances.js';
import {spendableMoney} from './procurement-budget.js';
import {freshLots,FOOD_DAYS} from './food-storage.js';
import {tripEstimate} from './economy-reference.js';
export const DELIVERY_LIMITS={cargoKg:5000,cargoM3:12};
export function orderDelivery(s,id,project,materials,stored,capacity){
 if(s.delivery||s.stage!=='playing')return false;
 const item=materials[id],shipments=project?blueprintManifest(uncollectedProjects(s),DELIVERY_LIMITS):null;
 if(!item?.quantity||(project&&!shipments.length)||(!project&&(!fitsCargo({[id]:item.quantity},DELIVERY_LIMITS)||stored+item.quantity>capacity)))return false;
 const fare=transportCost({...s,deliveryOnly:true}),cost=project?0:item.price;
 if((project?s.money:spendableMoney(s))<fare+cost)return false;
 if(cost)transact(s,-cost,'purchases',`Supplier delivery: ${item.name}`);
 transact(s,-fare,'transport','Supplier delivery freight');
 const duration=(360+tripEstimate(s.worldSettings?.town).minutes)/.45;
 s.delivery={material:id,quantity:project?0:item.quantity,left:duration,duration,...(shipments?{shipments}:{})};
 if(!project&&FOOD_DAYS[id])s.delivery.foodLots=freshLots(s,id,item.quantity);
 return true;
}
export function deliveryStep(s,dt,materials,changeMaterial,stored,capacity){
 const d=s.delivery;if(!d)return;d.left=Math.max(0,d.left-dt);if(d.left>0)return;
 if(d.shipments)receiveBlueprintShipment(s,d);
 else{
  const quantity=d.foodLots?d.foodLots.reduce((n,l)=>n+l.n,0):d.quantity;
  if(stored+quantity>capacity){d.status='Delivery waiting: storage full';return;}
  changeMaterial(s,d.material,quantity,d.foodLots);
 }
 s.delivery=null;
}
export function validDelivery(s,materials){
 if(s.deliveryOnly!==undefined&&typeof s.deliveryOnly!=='boolean')return false;
 const d=s.delivery;if(!d)return true;
 if(!materials[d.material]||!Number.isFinite(d.duration)||d.duration<=0||d.duration>1200||!Number.isFinite(d.left)||d.left<0||d.left>d.duration)return false;
 if(!d.shipments)return d.quantity===materials[d.material].quantity;
 if(!Array.isArray(d.shipments)||!d.shipments.length||d.shipments.length>512)return false;
 const cargo={},seen=new Set();for(const part of d.shipments){const p=s.projects.find(p=>p.id===part.project);if(!p?.pendingMaterials||seen.has(p.id)||!part.items)return false;seen.add(p.id);
  for(const [id,n]of Object.entries(part.items)){if(!materials[id]||!Number.isFinite(n)||n<=0||n>(p.pendingMaterials[id]||0))return false;cargo[id]=(cargo[id]||0)+n;}
 }
 return fitsCargo(cargo,DELIVERY_LIMITS);
}
