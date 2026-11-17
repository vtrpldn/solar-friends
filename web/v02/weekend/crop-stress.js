import {DAY} from './weather.js';
// Authored thresholds, not crop-specific agronomic prescriptions.
export function cropStress(crop,moisture,dt){
 crop.drySeconds=moisture<.1?(crop.drySeconds||0)+dt:0;
 crop.droughtDamage=Math.max(crop.droughtDamage||0,Math.min(1,Math.max(0,crop.drySeconds-DAY)/(6*DAY)));
 return crop.droughtDamage>=1?'failed':crop.droughtDamage>0?'damaged':moisture<.2?'wilting':'healthy';
}
export function validCropStress(c){return (c.drySeconds===undefined||Number.isFinite(c.drySeconds)&&c.drySeconds>=0)&&(c.droughtDamage===undefined||Number.isFinite(c.droughtDamage)&&c.droughtDamage>=0&&c.droughtDamage<=1);}
export function cropCondition(c){return c.stage==='failed'?'Failed · clear and prepare this bed':c.droughtDamage>0?`Damaged · ${Math.round(c.droughtDamage*100)}% irreversible drought loss`:c.moisture<.2?'Wilting · restore irrigation':'Healthy';}
