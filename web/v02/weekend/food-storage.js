import {recordMaterial} from './material-ledger.js';
import {materialMass} from './material-measures.js';
import {activeTrips} from "./trip-state.js";
// Authored game shelf lives, not food-safety guidance. One day is 3200 sim seconds.
import {CROPS} from './crops.js';
export const FOOD_DAYS={...Object.fromEntries(Object.entries(CROPS).map(([id,c])=>[id,c.shelf])),food:3,meals:2,eggs:7,milk:1};
const day=3200;
export function freshLots(s,id,n,recipe){const duration=recipe?.preservedDays?.[id]||FOOD_DAYS[id];return duration&&n>0?[{n,expires:s.time+duration*day,...(recipe?.preservedDays?.[id]?{preserved:true}:{})}]:[];}
export function refreshSandboxFood(s){
 if(s.mode==='sandbox'&&s.foodStorage)for(const id of Object.keys(FOOD_DAYS))s.foodStorage.lots[id]=freshLots(s,id,s.materials[id]||0);
}
export function ensureFoodStorage(s){
 // Older in-memory villages may not yet contain the new crop inventory keys.
 for(const id of Object.keys(FOOD_DAYS))if(s.materials[id]===undefined)s.materials[id]=0;
 if(!s.foodStorage)s.foodStorage={version:1,lots:Object.fromEntries(Object.keys(FOOD_DAYS).map(id=>[id,freshLots(s,id,s.materials[id]||0)])),spoiled:{}};
 for(const id of Object.keys(FOOD_DAYS))s.foodStorage.lots[id]??=freshLots(s,id,s.materials[id]||0);
 return s.foodStorage;
}
function merge(lots){
 const result=[];for(const lot of lots.sort((a,b)=>a.expires-b.expires)){
  // Hour-sized buckets retain the earliest expiry, never making old food fresh.
  const last=result.at(-1);if(last&&!!last.preserved===!!lot.preserved&&!!last.chilled===!!lot.chilled&&lot.expires-last.expires<day/24)last.n+=lot.n;else result.push({...lot});
 }return result;
}
export function foodChange(s,id,n,lots,reason='transfer'){
 recordMaterial(s,id,n,reason);
 if(id==='wood'){s.wood+=n;return [];}
 if(!FOOD_DAYS[id]||s.mode==='sandbox'){s.materials[id]+=n;refreshSandboxFood(s);return [];}
 const f=ensureFoodStorage(s),taken=[];
 if(n<0){let left=-n;for(const lot of f.lots[id]){const q=Math.min(left,lot.n);if(q>0){taken.push({...lot,n:q});lot.n-=q;left-=q;}}
  f.lots[id]=f.lots[id].filter(l=>l.n>1e-8);
 }else f.lots[id]=merge([...f.lots[id],...(lots||freshLots(s,id,n))]);
 s.materials[id]+=n;return taken;
}
export function addOrganicWaste(s,kg){
 const f=ensureFoodStorage(s);const total=(f.wasteRemainderKg||0)+kg,whole=Math.floor(total+1e-9);
 f.wasteRemainderKg=Math.max(0,Math.round((total-whole)*1000000)/1000000);recordMaterial(s,'scraps',whole,'organic residues');s.materials.scraps=(s.materials.scraps||0)+whole;
}
function expire(s,id,lots){
 const good=lots.filter(l=>l.expires>s.time),lost=lots.filter(l=>l.expires<=s.time).reduce((n,l)=>n+l.n,0);
 if(lost){const f=ensureFoodStorage(s);f.spoiled[id]=(f.spoiled[id]||0)+lost;addOrganicWaste(s,materialMass({[id]:lost}));}
 return {good,lost};
}
export function foodStorageStep(s,recipes,materials={}){
 if(s.mode==='sandbox')return;
 const f=ensureFoodStorage(s);
 for(const id of Object.keys(FOOD_DAYS)){const result=expire(s,id,f.lots[id]);f.lots[id]=result.good;recordMaterial(s,id,-result.lost,'spoilage');s.materials[id]-=result.lost;}
 for(const o of s.trade?.orders||[]){
  if(!['queued','loaded'].includes(o.status)&&!o.returnFood)continue;
  if(!FOOD_DAYS[o.material])continue;
  o.foodLots??=freshLots(s,o.material,o.quantity);
  const {good,lost}=expire(s,o.material,o.foodLots);if(!lost)continue;
  o.returnFood=o.status==='loaded'||o.returnFood; o.status='spoiled';o.foodLots=good;
  const quantity=good.reduce((n,l)=>n+l.n,0);if(quantity&&!o.returnFood){foodChange(s,o.material,quantity,good);o.foodLots=[];}
 }
 for(const op of s.operations||[]){
  if(op.done||op.water)continue;const recipe=recipes[op.recipe];if(!recipe)continue;
  const output=op.phase==='return',items=output?(op.haulRemaining||op.returnItems||op.harvestOutput||recipe.output):(op.input||recipe.input);
  const field=output?'foodOutput':'foodInput';op[field]??=Object.fromEntries(Object.entries(items).filter(([id])=>FOOD_DAYS[id]).map(([id,n])=>[id,freshLots(s,id,n,output?recipe:null)]));
  let spoiled=false;const survivors={};
  for(const [id,lots]of Object.entries(op[field])){const result=expire(s,id,lots);survivors[id]=result.good;spoiled ||= result.lost>0;}
  if(spoiled){
   op.returnItems=Object.fromEntries(Object.entries(items).map(([id,n])=>[id,FOOD_DAYS[id]?(survivors[id]||[]).reduce((sum,l)=>sum+l.n,0):n]));
   if(op.haulRemaining)op.haulRemaining={...op.returnItems};
   op.foodInput={};op.foodOutput=survivors;op.phase='return';op.status='Returning usable remains after food spoilage';
  }
 }
 for(const trip of [...activeTrips(s),s.delivery].filter(Boolean)){
 if(trip&&!trip.project&&!trip.shipments&&!trip.saleOnly&&FOOD_DAYS[trip.material]&&!trip.foodSpoiled){
  if(!trip.foodLots&&materials[trip.material])trip.foodLots=freshLots(s,trip.material,materials[trip.material].quantity);
  if(trip.foodLots){const result=expire(s,trip.material,trip.foodLots);if(result.lost){trip.foodLots=result.good;trip.foodSpoiled=true;}}
 }
 }
}
export function validFoodStorage(s,recipes={},materials={}){
 const f=s.foodStorage;if(f===undefined)return true;
 if(f?.wasteRemainderKg!==undefined&&(!Number.isFinite(f.wasteRemainderKg)||f.wasteRemainderKg<0||f.wasteRemainderKg>=1))return false;
 if(!f||f.version!==1||!f.lots||!f.spoiled)return false;
 const valid=lots=>Array.isArray(lots)&&lots.length<=100000&&lots.every(l=>l&&Number.isFinite(l.n)&&l.n>0&&Number.isFinite(l.expires)&&l.expires>=0&&(l.preserved===undefined||typeof l.preserved==='boolean')&&(l.chilled===undefined||typeof l.chilled==='boolean'));
 if(Object.keys(f.lots).some(id=>!FOOD_DAYS[id])||Object.entries(f.spoiled).some(([id,n])=>!FOOD_DAYS[id]||!Number.isFinite(n)||n<0))return false;
 for(const id of Object.keys(FOOD_DAYS))if(!valid(f.lots[id])||Math.abs(f.lots[id].reduce((n,l)=>n+l.n,0)-(s.materials[id]||0))>1e-6)return false;
 for(const o of s.trade?.orders||[])if(o.foodLots!==undefined&&(!FOOD_DAYS[o.material]||!valid(o.foodLots)||(['queued','loaded'].includes(o.status)&&Math.abs(o.foodLots.reduce((n,l)=>n+l.n,0)-o.quantity)>1e-6)||o.foodLots.reduce((n,l)=>n+l.n,0)>o.quantity+1e-6))return false;
 for(const op of s.operations||[])for(const field of ['foodInput','foodOutput'])if(op[field]!==undefined&&(!op[field]||Object.entries(op[field]).some(([id,lots])=>!FOOD_DAYS[id]||!valid(lots))))return false;
 for(const op of s.operations||[]) {
  const recipe=recipes[op.recipe];
  if(op.returnItems&&(!recipe||Object.entries(op.returnItems).some(([id,n])=>!Number.isFinite(n)||n<0||n>Math.max(recipe.input[id]||0,recipe.output[id]||0))))return false;
  if(recipe&&!op.done)for(const [field,expected]of [['foodInput',recipe.input],['foodOutput',op.haulRemaining||op.returnItems||op.harvestOutput||recipe.output]]){
   if(op[field])for(const [id,lots]of Object.entries(op[field]))if(lots.reduce((n,l)=>n+l.n,0)>(expected[id]||0)+1e-6)return false;
  }
 }
 return [...activeTrips(s),s.delivery].filter(Boolean).every(t=>!t.foodLots||(valid(t.foodLots)&&(!materials[t.material]||t.foodLots.reduce((n,l)=>n+l.n,0)<=materials[t.material].quantity+1e-6)));
}
export function foodStorageText(s){
 if(s.mode==='sandbox')return 'Food spoilage is disabled in sandbox.';
 const f=ensureFoodStorage(s),next=Object.values(f.lots).flat().reduce((n,l)=>Math.min(n,l.expires),Infinity),lost=Object.values(f.spoiled).reduce((n,q)=>n+q,0);
 const preserved=(f.lots.meals||[]).filter(l=>l.preserved).reduce((n,l)=>n+l.n,0);
 return `Residents use oldest food first. One camp serving: 1 meal, 1 kg ingredients, 4 cooked eggs or 2 L milk (simplified food portions). Crops keep from 3 days (greens, corn, cassava) to 30 (pumpkin); cook them into meals at a kitchen. Ingredients: 3 days; fresh meals: 2; dried provisions: 10, or 30 as cassava farinha; eggs: 7; milk: 1. ${preserved} of the meals in stores are dried provisions. ${Number.isFinite(next)?`Next stored batch expires in ${Math.max(0,(next-s.time)*.45/60).toFixed(1)} game hours.`:'No perishable food in stores.'} ${lost} units spoiled into organic residues. Reserved and carried food also ages.`;
}

export function returnUnsoldFood(s,trip){
 for(const id of trip.exports||[]){const o=s.trade?.orders.find(o=>o.id===id);if(!o?.returnFood)continue;
  foodChange(s,o.material,o.foodLots.reduce((n,l)=>n+l.n,0),o.foodLots);o.foodLots=[];o.returnFood=false;
 }
}

// Split a batch without changing its age, preservation or refrigeration state.
export function takeFoodLots(lots,n){
 const taken=[];let left=n;
 for(const lot of lots){const quantity=Math.min(left,lot.n);if(quantity>0){taken.push({...lot,n:quantity});lot.n-=quantity;left-=quantity;}}
 for(let i=lots.length-1;i>=0;i--)if(lots[i].n<=1e-8)lots.splice(i,1);
 return taken;
}

// Whole-stock serving estimates keep saves and the physical ledger integral.
// Eggs are prepared as a simple camp meal; these are gameplay portions, not a nutrition model.
export const FOOD_SERVINGS={meals:1,food:1,eggs:4,milk:2};
export function foodPortions(s){return Object.entries(FOOD_SERVINGS).reduce((n,[id,size])=>n+Math.floor((s.materials[id]||0)/size),0);}
export function nextMeal(s){
 const storage=ensureFoodStorage(s);
 return Object.entries(FOOD_SERVINGS).filter(([id,size])=>(s.materials[id]||0)>=size)
 .sort(([a],[b])=>(storage.lots[a]?.[0]?.expires??Infinity)-(storage.lots[b]?.[0]?.expires??Infinity))
 .map(([id,quantity])=>({id,quantity}))[0]||null;
}
export function eatMeal(s){
 const meal=nextMeal(s);if(!meal)return false;
 foodChange(s,meal.id,-meal.quantity,undefined,'resident meal');
 addOrganicWaste(s,meal.id==='eggs'?.024:meal.id==='milk'?0:.2);
 return true;
}
