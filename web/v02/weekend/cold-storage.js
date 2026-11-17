import {ensureFoodStorage,FOOD_DAYS} from './food-storage.js';
export const COLD_STORAGE={units:40,kw:.08,agingRate:.25};
export function coolingStatus(s){
 const nodes=Object.values(s.infrastructure?.nodes||{}).filter(n=>n.coldStorage);
 const powered=nodes.filter(n=>n.enabled&&n.coolingEnabled!==false&&n.power>.99);
 return {installed:nodes.length,powered:powered.length,capacity:powered.length*COLD_STORAGE.units};
}
export function coolStoredFood(s,dt){
 if(s.mode==='sandbox')return;
 const f=ensureFoodStorage(s),{capacity}=coolingStatus(s);let left=capacity;
 const candidates=[];
 for(const id of Object.keys(FOOD_DAYS))for(const lot of f.lots[id]){
  if(!lot.preserved&&lot.expires>s.time-dt)candidates.push({id,lot});else lot.chilled=false;
 }
 candidates.sort((a,b)=>Number(!!b.lot.chilled)-Number(!!a.lot.chilled)||a.lot.expires-b.lot.expires);
 for(const {id,lot}of candidates){
  const amount=Math.min(left,lot.n);left-=amount;
  if(amount>0&&amount<lot.n){f.lots[id].push({...lot,n:lot.n-amount,chilled:false});lot.n=amount;}
  lot.chilled=amount>0;
  if(lot.chilled)lot.expires+=dt*(1-COLD_STORAGE.agingRate);
 }
 // Cooling changes deadlines; consumption must still choose earliest expiry.
 for(const id of Object.keys(FOOD_DAYS))f.lots[id].sort((a,b)=>a.expires-b.expires);
}
export function coolingText(s){const c=coolingStatus(s);return `${c.powered}/${c.installed} cold stores powered · ${c.capacity} food units can age at one-quarter speed. Dried provisions do not use cooling space. Unpowered or excess stock ages normally.`;}
