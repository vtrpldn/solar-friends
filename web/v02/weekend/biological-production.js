import {rainfallRate} from './weather.js';
import {cropStress,validCropStress} from './crop-stress.js';
// One game day is 24 hours for people, bills and biological growth alike.
// Reference durations and engineering assumptions: docs/economy-biology.md.
export const GAME_DAY=1440/.45;
export const BIOLOGY={
 baby_greens:{days:21,window:3,seasonal:true},
 vegetables:{days:45,window:7,seasonal:true},greenhouse:{days:40,window:7,seasonal:false},
 fruit:{days:120,window:14,seasonal:true},bananas:{days:270,window:14,seasonal:true},
 wood:{days:6*365,window:Infinity,seasonal:true,plantingFraction:.1},bamboo:{days:365,window:Infinity,seasonal:true},
 compost:{days:60,window:Infinity,seasonal:false},
 eggs:{days:3,window:3,seasonal:false},milk:{days:1,window:1,seasonal:false},
 honey:{days:90,window:30,seasonal:true},
};
export function seasonAt(time){
 const day=(304+(540+time*.45)/1440)%365;
 return ['Summer','Autumn','Winter','Spring'][Math.floor(((day+31)%365)/91.25)];
}
export function growthRate(s,recipe){
 if(!BIOLOGY[recipe]?.seasonal)return 1;
 const season=seasonAt(s.time),biome=s.worldSettings?.biome||'mata-atlantica';
 const factors=biome==='caatinga'?{Summer:1,Autumn:.8,Winter:.3,Spring:.45}:biome==='cerrado'?{Summer:1,Autumn:.8,Winter:.45,Spring:.8}:{Summer:1,Autumn:.9,Winter:.7,Spring:1};
 return factors[season];
}
// An orchard is planted with the fruit tree that belongs to its land. Pequi and
// umbu are adapted to a long dry season: they need a fraction of the irrigation,
// sit out dry soil like timber does and keep most of their growth through it.
// Authored factors, not agronomic figures; see docs/economy-biology.md.
export const NATIVE_ORCHARDS={
 cerrado:{species:'pequi',fruit:'Pequi',water:.5,season:.8,dry:{graceDays:14,lossDays:60}},
 caatinga:{species:'umbuzeiro',fruit:'Umbu',water:.25,season:.8,dry:{graceDays:14,lossDays:60}},
};
export const orchardPlanting=s=>NATIVE_ORCHARDS[s?.worldSettings?.biome]||null;
const nativeFor=(s,recipe)=>recipe==='fruit'?orchardPlanting(s):null;
export function biologyLabel(recipe){return ['eggs','milk','honey'].includes(recipe)?'Next collection':recipe==='compost'?'Composting':'Growing';}
export const IRRIGATION_POLICIES={balanced:'Balanced · maintain 75% soil moisture',conserve:'Conserve water · maintain 40% soil moisture',rainfed:'Rain-fed · no stored water'};
export function beginBiology(s,op,r){
 if(['eggs','milk'].includes(op.recipe)&&s.mode!=='sandbox')return false;
 const b=BIOLOGY[op.recipe];if(!b||op.planted||s.mode==='sandbox')return false;
 op.planted=true;op.phase='growing';op.growthRemaining=b.days*GAME_DAY;
 const site=s.projects?.find(p=>p.id===op.site);
 if(op.recipe==='fruit'&&site&&!site.orchardEstablished){op.establishmentDays=610;op.growthRemaining+=610*GAME_DAY;site.orchardEstablished=true;}
 op.status=`${biologyLabel(op.recipe)}: ${b.days} game days before collection work`;
 r.operation=null;r.cargo=false;r.action='idle';r.target=null;r.walk=[];return true;
}
export const CROP_CARE={wood:{kind:"supply-0",area:36,liters:36},bamboo:{kind:"supply-1",area:16,liters:24},baby_greens:{kind:"garden",area:8,liters:24},vegetables:{kind:"garden",area:16,liters:48},greenhouse:{kind:"greenhouse",area:24,liters:48},fruit:{kind:"orchard",area:64,liters:32},bananas:{kind:"grove",area:32,liters:48}};
export function biologicalStep(s,dt,useWater){
 const active=new Set((s.operations||[]).filter(o=>!o.done&&o.phase==='growing'&&CROP_CARE[o.recipe]).map(o=>o.site));
 for(const p of s.projects||[])if(!p.cultivation&&p.soilFertility!==undefined&&!active.has(p.id))p.soilFertility=Math.min(1,p.soilFertility+dt/(180*GAME_DAY));
 for(const op of s.operations||[]){
  if(op.done||!(op.phase==='growing'||op.phase==='process'&&op.ripeAt!==undefined))continue;
  const native=nativeFor(s,op.recipe),care=CROP_CARE[op.recipe],crop=care&&native?{...care,liters:care.liters*native.water}:care,site=s.projects?.find(p=>p.id===op.site);
  let moisture=1,fertility=1;
  if(crop&&site){
   site.soilMoisture??=.75;site.soilFertility??=1;
   const need=crop.liters*dt/GAME_DAY;
   const rain=op.recipe!=='greenhouse'?rainfallRate(s)*24*dt/GAME_DAY*crop.area:0;
   const target=site.irrigationPolicy==='rainfed'?0:site.irrigationPolicy==='conserve'?.4:.75;
   const refill=Math.max(0,need-rain)+crop.area*2*dt/GAME_DAY;
   const irrigated=rain<need&&site.soilMoisture<=target&&target>0&&useWater?.(s,op.site,refill,true);
   site.soilMoisture=Math.max(0,Math.min(1,site.soilMoisture+(rain+(irrigated?refill:0)-need)/(crop.area*16)));
   moisture=site.soilMoisture<.1?0:Math.min(1,site.soilMoisture/.4);
   fertility=.5+.5*site.soilFertility;
   if(cropStress(op,site.soilMoisture,dt,op.recipe==='wood'?{graceDays:14,lossDays:60}:native?.dry)==='failed'){op.growthRemaining=0;op.phase='process';op.ripeAt??=s.time;op.status='Crop failed · resident clearing work remains';continue;}
  }
  if(op.phase!=='growing')continue;
  op.growthRemaining=Math.max(0,op.growthRemaining-dt*Math.max(native?.season||0,growthRate(s,op.recipe))*moisture*fertility);
  const days=op.growthRemaining/GAME_DAY;
  op.status=`${native?`${native.fruit} · `:''}${biologyLabel(op.recipe)}: ${days.toFixed(1)} game days remaining · ${seasonAt(s.time)}${crop&&site?` · soil moisture ${Math.round(site.soilMoisture*100)}% · fertility ${Math.round(site.soilFertility*100)}% · up to ${crop.liters} L/day irrigation · ${IRRIGATION_POLICIES[site.irrigationPolicy||'balanced']}`:""}`;
  if(!op.growthRemaining){if(crop&&site)site.soilFertility=Math.max(0,site.soilFertility-.1);op.phase='process';op.ripeAt=s.time;op.status=['eggs','milk','honey'].includes(op.recipe)?'Ready for resident collection':'Ready for resident harvest work';}
 }
}
export function harvestOutput(s,op,recipe){
 const b=BIOLOGY[op.recipe];if(!b||op.ripeAt===undefined)return {...recipe.output};
 const elapsed=Math.max(0,(s.time-op.ripeAt)/GAME_DAY);
 const health=1;
 const factor=(Number.isFinite(b.window)?Math.max(0,1-Math.max(0,elapsed-b.window)/b.window):1)*health*(1-(op.droughtDamage||0));
 const result={...recipe.output};for(const id of Object.keys(result))if(result[id])result[id]=Math.floor(result[id]*factor+1e-8);
 return result;
}
export function biologyText(recipe,s){const b=BIOLOGY[recipe],native=nativeFor(s,recipe);if(native)return `${biologyText(recipe)} · On this land the orchard is planted with ${native.fruit.toLowerCase()}, a native tree that needs ${Math.round(native.water*100)}% of the usual irrigation, survives two dry weeks and keeps growing through the dry season`;if(recipe==='wood')return ' · Four trees on 36 m²; six favorable growing years, longer in dry or cool conditions · 288 kg raw logs at full health, requiring processing before construction · Four replacement seedlings per later rotation · Planting, felling and hauling require resident work';return b?` · ${b.days} game days ${['eggs','milk','honey'].includes(recipe)?'between collections':'of growth/curing'}, separate from resident work${b.seasonal?'; slower in unfavorable seasons':''}${Number.isFinite(b.window)?`; ${['eggs','milk','honey'].includes(recipe)?'collect':'harvest'} within ${b.window} days before gradual ${['eggs','milk','honey'].includes(recipe)?'uncollected output':'field'} losses`:''}`:'';}
export function validBiology(s,recipes){if(!(s.projects||[]).every(p=>p.irrigationPolicy===undefined||Object.hasOwn(IRRIGATION_POLICIES,p.irrigationPolicy)))return false;if(!(s.projects||[]).every(p=>[p.soilMoisture,p.soilFertility].every(n=>n===undefined||(Number.isFinite(n)&&n>=0&&n<=1))))return false;if(!(s.projects||[]).every(p=>(p.starterSeedlingsUsed===undefined||typeof p.starterSeedlingsUsed==='boolean')&&(p.orchardEstablished===undefined||typeof p.orchardEstablished==='boolean')&&(p.harvestCount===undefined||(Number.isInteger(p.harvestCount)&&p.harvestCount>=0))))return false;return (s.operations||[]).every(o=>{
 if(!validCropStress(o))return false;
 if(o.farm)return true;
 if(o.establishmentDays!==undefined&&(o.recipe!=='fruit'||o.establishmentDays!==610))return false;
 if(o.planted!==undefined&&typeof o.planted!=='boolean')return false;
 if(o.phase==='growing'&&(!BIOLOGY[o.recipe]||!o.planted||!Number.isFinite(o.growthRemaining)))return false;
 if(o.growthRemaining!==undefined&&(!BIOLOGY[o.recipe]||!Number.isFinite(o.growthRemaining)||o.growthRemaining<0||o.growthRemaining>(BIOLOGY[o.recipe].days+(o.establishmentDays||0))*GAME_DAY))return false;
 if(o.ripeAt!==undefined&&(!Number.isFinite(o.ripeAt)||o.ripeAt<0||o.ripeAt>s.time))return false;
 return o.harvestOutput===undefined||Object.entries(o.harvestOutput).every(([id,n])=>Number.isInteger(n)&&n>=0&&n<=(recipes[o.recipe]?.output[id]??-1));
});}
