// One game day is 24 hours for people, bills and biological growth alike.
// Reference durations and engineering assumptions: docs/economy-biology.md.
export const GAME_DAY=1440/.45;
export const BIOLOGY={
 vegetables:{days:45,window:7,seasonal:true},greenhouse:{days:40,window:7,seasonal:false},
 fruit:{days:120,window:14,seasonal:true},bananas:{days:270,window:14,seasonal:true},
 wood:{days:6*365,window:Infinity,seasonal:true},bamboo:{days:365,window:Infinity,seasonal:true},
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
export function beginBiology(s,op,r){
 const b=BIOLOGY[op.recipe];if(!b||op.planted||s.mode==='sandbox')return false;
 op.planted=true;op.phase='growing';op.growthRemaining=b.days*GAME_DAY;
 op.status=`Growing / curing: ${b.days} game days before harvest work`;
 r.operation=null;r.cargo=false;r.action='idle';r.target=null;r.walk=[];return true;
}
export const CROP_CARE={vegetables:{kind:"garden",area:16,liters:48},greenhouse:{kind:"greenhouse",area:24,liters:48},fruit:{kind:"orchard",area:64,liters:32},bananas:{kind:"grove",area:32,liters:48}};
export function biologicalStep(s,dt,useWater){
 const active=new Set((s.operations||[]).filter(o=>!o.done&&o.phase==='growing'&&CROP_CARE[o.recipe]).map(o=>o.site));
 for(const p of s.projects||[])if(p.soilFertility!==undefined&&!active.has(p.id))p.soilFertility=Math.min(1,p.soilFertility+dt/(180*GAME_DAY));
 for(const op of s.operations||[]){
  if(op.done||op.phase!=='growing')continue;
  const crop=CROP_CARE[op.recipe],site=s.projects?.find(p=>p.id===op.site);
  let moisture=1,fertility=1;
  if(crop&&site){
   site.soilMoisture??=.75;site.soilFertility??=1;
   const need=crop.liters*dt/GAME_DAY;
   const rain=s.rain&&op.recipe!=='greenhouse';
   const irrigated=!rain&&useWater?.(s,op.site,need,true);
   site.soilMoisture=Math.max(0,Math.min(1,site.soilMoisture+(rain?2:irrigated?1:-1)*dt/GAME_DAY));
   moisture=site.soilMoisture<.1?0:Math.min(1,site.soilMoisture/.4);
   fertility=.5+.5*site.soilFertility;
  }
  op.growthRemaining=Math.max(0,op.growthRemaining-dt*growthRate(s,op.recipe)*moisture*fertility);
  const days=op.growthRemaining/GAME_DAY;
  op.status=`${op.recipe==='compost'?'Curing':'Growing'}: ${days.toFixed(1)} growth days remaining · ${seasonAt(s.time)}${crop&&site?` · soil moisture ${Math.round(site.soilMoisture*100)}% · fertility ${Math.round(site.soilFertility*100)}% · ${crop.liters} L/day irrigation in dry weather`:""}`;
  if(!op.growthRemaining){if(crop&&site)site.soilFertility=Math.max(0,site.soilFertility-.1);op.phase='process';op.ripeAt=s.time;op.status='Ready for resident harvest work';}
 }
}
export function harvestOutput(s,op,recipe){
 const b=BIOLOGY[op.recipe];if(!b||!Number.isFinite(b.window)||op.ripeAt===undefined)return {...recipe.output};
 const elapsed=Math.max(0,(s.time-op.ripeAt)/GAME_DAY);
 const health=['eggs','milk'].includes(op.recipe)?(s.projects?.find(p=>p.id===op.site)?.animalHealth??100)/100:1;
 const factor=Math.max(0,1-Math.max(0,elapsed-b.window)/b.window)*health;
 const result={...recipe.output};for(const id of ['food','eggs','milk','honey'])if(result[id])result[id]=Math.floor(result[id]*factor+1e-8);
 return result;
}
export function biologyText(recipe){const b=BIOLOGY[recipe];return b?` · ${b.days} game days of growth/curing, separate from resident work${b.seasonal?'; slower in unfavorable seasons':''}${Number.isFinite(b.window)?`; harvest within ${b.window} days before gradual field losses`:''}`:'';}
export function validBiology(s,recipes){if(!(s.projects||[]).every(p=>[p.soilMoisture,p.soilFertility].every(n=>n===undefined||(Number.isFinite(n)&&n>=0&&n<=1))))return false;return (s.operations||[]).every(o=>{
 if(o.planted!==undefined&&typeof o.planted!=='boolean')return false;
 if(o.phase==='growing'&&(!BIOLOGY[o.recipe]||!o.planted||!Number.isFinite(o.growthRemaining)))return false;
 if(o.growthRemaining!==undefined&&(!BIOLOGY[o.recipe]||!Number.isFinite(o.growthRemaining)||o.growthRemaining<0||o.growthRemaining>BIOLOGY[o.recipe].days*GAME_DAY))return false;
 if(o.ripeAt!==undefined&&(!Number.isFinite(o.ripeAt)||o.ripeAt<0||o.ripeAt>s.time))return false;
 return o.harvestOutput===undefined||Object.entries(o.harvestOutput).every(([id,n])=>Number.isInteger(n)&&n>=0&&n<=(recipes[o.recipe]?.output[id]??-1));
});}
