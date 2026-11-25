import {materialMass} from './material-measures.js';
import {CROPS} from './crops.js';
const sinks={corn_feed:'Drying moisture losses',...Object.fromEntries(Object.keys(CROPS).map(id=>[`cook_${id}`,'Cooking evaporation'])),preserve_meals:'Drying moisture losses',farinha:'Pressing and toasting moisture losses',saw_timber:'Uncollected wood offcuts and sawdust',saw_planks:'Uncollected wood offcuts and sawdust',frames:'Joinery offcuts and fastening waste',walls:'Unrecovered earth trimmings',tiles:'Firing moisture and fuel losses',meals:'Cooking evaporation',compost:'Composting gas and moisture'};
export function recipeBalance(id,recipe){
 if(!sinks[id])return null;
 const inputKg=materialMass(recipe.input)+(recipe.water||0),outputKg=materialMass(recipe.output);
 return {inputKg,outputKg,lossKg:inputKg-outputKg,sink:sinks[id]};
}
export function recordProduction(s,id,recipe){
 const b=recipeBalance(id,recipe);if(!b||s.mode==='sandbox')return;
 if(b.lossKg< -1e-8)throw new Error(`Recipe ${id} creates material mass`);
 const ledger=s.productionAccounting??={version:1,since:s.time,batches:{}};
 ledger.batches[id]=(ledger.batches[id]||0)+1;
}
export function productionSummary(s,recipes){
 const totals={inputKg:0,outputKg:0,lossKg:0,batches:0};
 for(const [id,n]of Object.entries(s.productionAccounting?.batches||{})){
  const b=recipeBalance(id,recipes[id]);if(!b)continue;
  for(const k of ['inputKg','outputKg','lossKg'])totals[k]+=b[k]*n;
  totals.batches+=n;
 }
 return totals;
}
export function validProductionAccounting(s,recipes){
 const a=s.productionAccounting;if(a===undefined)return true;
 return !!a&&a.version===1&&Number.isFinite(a.since)&&a.since>=0&&a.since<=s.time&&a.batches&&typeof a.batches==='object'&&!Array.isArray(a.batches)&&Object.entries(a.batches).every(([id,n])=>!!recipes[id]&&!!sinks[id]&&Number.isSafeInteger(n)&&n>=0);
}
export function recipeLossText(id,recipe){const b=recipeBalance(id,recipe);return b?` · Approx. ${b.inputKg.toFixed(1)} kg in → ${b.outputKg.toFixed(1)} kg usable; ${b.lossKg.toFixed(1)} kg ${b.sink.toLowerCase()}`:'';}
