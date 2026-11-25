import {ensureFoodStorage,FOOD_SERVINGS,FOOD_DAYS,foodPortions} from './food-storage.js';

const DAY=3200;
// Estimate evenly spaced portions, without future harvests, shopping or cooling.
export function pantryForecast(s,days=s.foodReserveDays??1.5){
 const demand=s.people.length*3,horizon=Math.max(0,Math.min(7,days));
 const storage=ensureFoodStorage(s);
 const lots=Object.fromEntries(Object.keys(FOOD_SERVINGS).map(id=>[id,storage.lots[id].map(l=>({...l})).sort((a,b)=>a.expires-b.expires)]));
 const target=Math.ceil(demand*horizon);let served=0,atRisk=0;
 const expire=time=>{for(const [id,batches] of Object.entries(lots))for(const lot of batches)if(lot.expires<=time){atRisk+=lot.n/FOOD_SERVINGS[id];lot.n=0;}};
 for(let slot=0;slot<target;slot++){
  expire(s.time+slot*DAY/demand);
  const options=Object.entries(FOOD_SERVINGS).filter(([id,size])=>lots[id].reduce((n,l)=>n+l.n,0)+1e-8>=size);
  options.sort(([a],[b])=>(lots[a].find(l=>l.n>0)?.expires??Infinity)-(lots[b].find(l=>l.n>0)?.expires??Infinity));
  if(!options.length)break;
  const [id,size]=options[0];let left=size;
  for(const lot of lots[id]){const n=Math.min(left,lot.n);lot.n-=n;left-=n;}
  served++;
 }
 expire(s.time+horizon*DAY);
 return {portions:foodPortions(s),target,served,shortfall:target-served,days:demand?served/demand:0,atRisk};
}

// Fresh cooking and preservation have separate pools, including queued work.
export function productionStock(s,recipe,recipes){
 const id=Object.keys(recipe.output)[0];if(!id)return 0;
 const preserved=!!recipe.preservedDays?.[id];
 const matches=r=>!!r?.output[id]&&(id!=='meals'||!!r.preservedDays?.[id]===preserved);
 const stored=id==='meals'?ensureFoodStorage(s).lots.meals.filter(l=>!!l.preserved===preserved).reduce((n,l)=>n+l.n,0):(id==='wood'?s.wood:s.materials[id]||0);
 return stored+(s.operations||[]).filter(o=>!o.done&&matches(recipes[o.recipe])).reduce((n,o)=>n+((o.haulRemaining||o.returnItems||o.harvestOutput||recipes[o.recipe].output)[id]||0),0);
}

// What the village cannot eat before it spoils, per food, in stock units.
// Batches are eaten earliest-expiry first at three portions a person a day;
// whatever would still be on the shelf when its batch expires is surplus.
// Raw crops only count as food when a kitchen can cook them: `cooking` maps a
// crop to {size: units per portion, keepDays: how long the cooked meal lasts}.
export function foodSurplus(s,cooking={}){
 const storage=ensureFoodStorage(s),perDay=s.people.length*3,lots=[],surplus={};
 for(const id of Object.keys(FOOD_DAYS)){
  const size=FOOD_SERVINGS[id]||cooking[id]?.size,extra=FOOD_SERVINGS[id]?0:(cooking[id]?.keepDays||0)*DAY;
  for(const lot of storage.lots[id]||[]){
   if(lot.n<=0)continue;
   if(size)lots.push({id,size,n:lot.n,deadline:lot.expires+extra});
   else surplus[id]=(surplus[id]||0)+lot.n;
  }
 }
 lots.sort((a,b)=>a.deadline-b.deadline);
 let eaten=0;
 for(const lot of lots){
  const room=Math.max(0,perDay*(lot.deadline-s.time)/DAY-eaten),kept=Math.min(lot.n/lot.size,room);
  eaten+=kept;
  const left=lot.n-kept*lot.size;
  if(left>1e-8)surplus[lot.id]=(surplus[lot.id]||0)+left;
 }
 return Object.fromEntries(Object.entries(surplus).map(([id,n])=>[id,Math.floor(n+1e-8)]).filter(([,n])=>n>0));
}
