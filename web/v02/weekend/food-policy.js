import {ensureFoodStorage,FOOD_SERVINGS} from './food-storage.js';
import {productionStock} from './food-planning.js';

export function foodPolicy(s){return s.foodPolicy??={version:1,automatic:false,freshDays:1,provisionDays:2,coolingPriority:'expiry'};}
export function validFoodPolicy(s){
 const p=s.foodPolicy;
 return p===undefined||!!(p&&p.version===1&&typeof p.automatic==='boolean'&&['freshDays','provisionDays'].every(k=>Number.isFinite(p[k])&&p[k]>=0&&p[k]<=7)&&['expiry','meals','ingredients'].includes(p.coolingPriority));
}
export function kitchenPlan(s,p,recipes,api){
 const policy=foodPolicy(s);
 if(s.mode==='sandbox')return {reason:'Food automation is inactive in sandbox.'};
 if(!policy.automatic)return {reason:'Automatic food management is off.'};
 if(s.infrastructure?.nodes[p.id]?.enabled===false)return {reason:'Kitchen is switched off.'};
 if(p.repeat)return {reason:'Following the manual repeating recipe.'};
 if(s.operations?.some(o=>!o.done&&o.site===p.id&&!o.water))return {reason:'Kitchen has a job in progress.'};
 const storage=ensureFoodStorage(s),daily=s.people.length*2;
 let reason='Fresh meals and provisions meet their targets.';
 for(const preserved of [false,true]){
  const target=Math.ceil(daily*(preserved?policy.provisionDays:policy.freshDays));
  const candidates=Object.entries(recipes).filter(([,r])=>r.kind==='kitchen'&&r.output.meals&&!!r.preservedDays?.meals===preserved);
  const expiry=r=>Math.min(...Object.keys(r.input).map(id=>storage.lots[id]?.[0]?.expires??Infinity));
  candidates.sort((a,b)=>expiry(a[1])-expiry(b[1])||a[0].localeCompare(b[0]));
  for(const [id,r]of candidates){
   const stocked=productionStock(s,r,recipes);
   if(stocked>=target)continue;
   if(stocked+r.output.meals>target){reason='Waiting for room within the meal target for a whole batch.';continue;}
   const blocked=api.blocker(s,p.id,id);if(blocked){reason=blocked;continue;}
   const edibleAfter=Object.entries(FOOD_SERVINGS).reduce((n,[key,size])=>n+Math.floor(Math.max(0,(s.materials[key]||0)-(r.input[key]||0))/size),0);
   if(edibleAfter<daily){reason='Keeping one day of edible food available before starting another batch.';continue;}
   if(Object.entries(r.input).some(([key,n])=>{let left=n;for(const lot of storage.lots[key]||[]){const used=Math.min(left,lot.n);if(used>0&&lot.expires<=s.time+r.work)return true;left-=used;}return false;})){
    reason='Ingredients expire too soon to finish this batch.';continue;
   }
   const pending=(s.operations||[]).filter(o=>!o.done&&!o.water).reduce((n,o)=>n+Object.values(o.haulRemaining||o.returnItems||o.harvestOutput||recipes[o.recipe]?.output||{}).reduce((a,b)=>a+b,0),0);
   if(api.stored(s)+pending+Object.values(r.output).reduce((a,b)=>a+b,0)>api.capacity(s)){reason='Make storage space for the finished batch.';continue;}
   return {recipe:id,reason:`Next: ${r.name}`};
  }
 }
 return {reason};
}
export function manageKitchens(s,defs,recipes,api){
 if(s.mode==='sandbox'||!foodPolicy(s).automatic)return;
 for(const p of s.projects){
  if(defs[p.key]?.kind!=='kitchen'||p.work<defs[p.key].work||p.removal)continue;
  const plan=kitchenPlan(s,p,recipes,api);
  if(plan.recipe)p.productionStatus=api.queue(s,p.id,plan.recipe);
 }
}
