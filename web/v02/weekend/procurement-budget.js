import {blueprintManifest,transportCost} from './physical-trade.js';

// Derive commitments from undelivered goods rather than a second mutable wallet.
// An active shipment has already paid its fare and must not reserve it twice.
const cache=new WeakMap();
export function collectionBudget(s,extra={}) {
 if(s.mode==='sandbox')return {trips:0,cost:0};
 const pending=(s.projects||[]).filter(p=>p.pendingMaterials).map(p=>({id:p.id,pendingMaterials:{...p.pendingMaterials}}));
 for(const shipment of s.trip?.shipments||[]){
  const p=pending.find(p=>p.id===shipment.project);if(!p)continue;
  for(const [id,n]of Object.entries(shipment.items))p.pendingMaterials[id]=Math.max(0,(p.pendingMaterials[id]||0)-n);
 }
 // Legacy trips collect their entire order; their fare was paid on departure.
 if(s.trip?.project!==undefined&&!s.trip.shipments){
  for(const p of pending)if((s.trip.projects||[s.trip.project]).includes(p.id))p.pendingMaterials={};
 }
 if(Object.keys(extra).length)pending.push({id:'new',pendingMaterials:{...extra}});
 const fare=transportCost(s),key=JSON.stringify([fare,pending]);
 const previous=cache.get(s);if(previous?.key===key)return previous.value;
 let trips=0;
 while(pending.some(p=>Object.values(p.pendingMaterials).some(n=>n>0))){
  const manifest=blueprintManifest(pending);
  if(!manifest.length)return {trips:Infinity,cost:Infinity};
  for(const part of manifest){const p=pending.find(p=>p.id===part.project);for(const [id,n]of Object.entries(part.items))p.pendingMaterials[id]-=n;}
  trips++;
 }
 const value={trips,cost:trips*fare};cache.set(s,{key,value});return value;
}
export function spendableMoney(s){return Math.max(0,s.money-collectionBudget(s).cost);}
