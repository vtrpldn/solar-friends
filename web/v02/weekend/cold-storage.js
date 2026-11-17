import {materialMeasure} from './material-measures.js';
import {ensureFoodStorage,FOOD_DAYS} from './food-storage.js';
export const COLD_STORAGE={litres:80,kw:.08,agingRate:.25};
export function coolingStatus(s){
 const nodes=Object.values(s.infrastructure?.nodes||{}).filter(n=>n.coldStorage);
 const powered=nodes.filter(n=>n.enabled&&n.coolingEnabled!==false&&n.power>.99);
 const occupied=Object.entries(s.foodStorage?.lots||{}).reduce((n,[id,lots])=>n+lots.filter(l=>l.chilled).reduce((a,l)=>a+l.n*materialMeasure(id).m3*1000,0),0);
 return {installed:nodes.length,powered:powered.length,capacity:powered.length*COLD_STORAGE.litres,occupied};
}
export function coolStoredFood(s,dt){
 if(s.mode==='sandbox')return;
 const f=ensureFoodStorage(s),{capacity}=coolingStatus(s);let left=capacity;
 const candidates=[];
 for(const id of Object.keys(FOOD_DAYS))for(const lot of f.lots[id]){
  if(!lot.preserved&&lot.expires>s.time-dt)candidates.push({id,lot});else lot.chilled=false;
 }
 const priority=s.foodPolicy?.coolingPriority||'expiry';
 const rank=id=>priority==='meals'?(id==='meals'?0:1):priority==='ingredients'?(id==='meals'?1:0):0;
 candidates.sort((a,b)=>rank(a.id)-rank(b.id)||a.lot.expires-b.lot.expires||a.id.localeCompare(b.id));
 for(const {id,lot}of candidates){
  const litres=materialMeasure(id).m3*1000;
  const amount=Math.min(Math.floor((left+1e-9)/litres),lot.n);left-=amount*litres;
  if(amount>0&&amount<lot.n){f.lots[id].push({...lot,n:lot.n-amount,chilled:false});lot.n=amount;}
  lot.chilled=amount>0;
  if(lot.chilled)lot.expires+=dt*(1-COLD_STORAGE.agingRate);
 }
 // Cooling changes deadlines; consumption must still choose earliest expiry.
 for(const id of Object.keys(FOOD_DAYS))f.lots[id].sort((a,b)=>a.expires-b.expires);
}
export function coolingText(s){const c=coolingStatus(s);return `${c.powered}/${c.installed} cold stores powered · ${c.occupied.toFixed(1)} / ${c.capacity} L occupied / powered capacity (${c.installed*COLD_STORAGE.litres} L installed). Chilled food ages at one-quarter speed. Dried provisions do not use cooling space. Unpowered or excess stock ages normally.`;}
