import {materialMeasure} from './material-measures.js';
// A hand-carried load is bounded by both weight and awkward volume. Equipment
// above these limits requires its own handling path, never an oversized load.
export const HAND_LOAD={kg:30,m3:.12};
export function productionLoad(items){
 const result={};let kg=0,m3=0;
 for(const [id,quantity]of Object.entries(items)){
  const unit=materialMeasure(id);
  const n=Math.max(0,Math.min(quantity,Math.floor((HAND_LOAD.kg-kg+1e-8)/unit.kg),Math.floor((HAND_LOAD.m3-m3+1e-8)/unit.m3)));
  if(n){result[id]=n;kg+=n*unit.kg;m3+=n*unit.m3;}
 }
 return result;
}
export function validProductionHauling(s,recipes){
 return (s.operations||[]).every(o=>{
  if(o.haulRemaining===undefined)return o.returningToSite===undefined;
  const output=o.returnItems||o.harvestOutput||recipes[o.recipe]?.output;
  return o.phase==='return'&&output&&typeof o.returningToSite==='boolean'&&Object.entries(o.haulRemaining).every(([id,n])=>Number.isInteger(n)&&n>=0&&n<=(output[id]??-1));
 });
}
