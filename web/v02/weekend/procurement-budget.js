import {activeTrips} from "./trip-state.js";
import {blueprintManifest,projectFreight} from './physical-trade.js';

// Derive commitments from undelivered goods rather than a second mutable wallet.
// An active shipment has already paid its fare and must not reserve it twice.
const cache=new WeakMap();
export function collectionBudget(s,extra={}) {
 if(s.mode==='sandbox')return {trips:0,cost:0};
 const boardingPaid=s.deliveryOnly?0:activeTrips(s).filter(t=>t.phase==='boarding'&&t.shipments).length;
 const pending=(s.projects||[]).filter(p=>p.pendingMaterials).map(p=>({id:p.id,pendingMaterials:{...p.pendingMaterials}}));
 for(const shipment of [...activeTrips(s).filter(t=>s.deliveryOnly||t.phase!=='boarding'),s.delivery].filter(Boolean).flatMap(t=>t.shipments||[])){
  const p=pending.find(p=>p.id===shipment.project);if(!p)continue;
  for(const [id,n]of Object.entries(shipment.items))p.pendingMaterials[id]=Math.max(0,(p.pendingMaterials[id]||0)-n);
 }
 // Legacy trips collect their entire order; their fare was paid on departure.
 for(const trip of activeTrips(s))if(trip.project!==undefined&&!trip.shipments){
  for(const p of pending)if((trip.projects||[trip.project]).includes(p.id))p.pendingMaterials={};
 }
 if(Object.keys(extra).length)pending.push({id:'new',pendingMaterials:{...extra}});
 const key=JSON.stringify([s.worldSettings?.town,!!s.deliveryOnly,pending,boardingPaid]);
 const previous=cache.get(s);if(previous?.key===key)return previous.value;
 const load=limits=>{
  const manifest=blueprintManifest(pending,limits);
  for(const part of manifest){const p=pending.find(p=>p.id===part.project);for(const [id,n]of Object.entries(part.items))p.pendingMaterials[id]-=n;}
  return manifest.length;
 };
 // Cars still boarding have paid their fare and take the first loads.
 for(let i=0;i<boardingPaid;i++)load();
 let trips=0,cost=0,truck=false;
 while(pending.some(p=>Object.values(p.pendingMaterials).some(n=>n>0))){
  const freight=projectFreight(s,pending);
  if(!load(freight.limits))return {trips:Infinity,cost:Infinity};
  trips++;cost+=freight.fare;truck||=freight.truck;
 }
 const value={trips,cost:Math.round(cost*100)/100,...(truck?{truck}:{})};cache.set(s,{key,value});return value;
}
export function spendableMoney(s){return Math.max(0,Math.round((s.money-collectionBudget(s).cost)*100)/100);}
