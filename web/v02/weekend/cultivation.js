import {GAME_DAY,growthRate} from './biological-production.js';
// Calendar ranges: UMN Extension vegetable planning; other coefficients are
// explicit simulation estimates, not agronomic prescriptions. See docs/farming.md.
export const CROPS={
 greens:{name:'Leafy greens',days:45,window:4,plants:12,yieldKg:2,water:3,residue:.3,height:.28},
 beans:{name:'Bush beans',days:60,window:7,plants:8,yieldKg:1.2,water:3,residue:.6,height:.65},
 corn:{name:'Sweet corn',days:85,window:5,plants:4,yieldKg:1.5,water:4,residue:1,height:2},
};
export const FARM_ACTIONS=['prepare','plant','harvest','clear','amend','collect'];
export const CULTIVATION_KEYS=['field','garden','greenhouse'];
export const fieldSizeValid=size=>Array.isArray(size)&&size.length===2&&size.every(n=>Number.isInteger(n)&&n>=2&&n<=32);
export function bedLayout(p){
 if(p.key==='garden')return [-1.5,1.5].flatMap(x=>[-2.6,2.6].map(z=>({x,z,w:1.2,d:4})));
 if(p.key==='greenhouse')return [-1.2,1.2].map(x=>({x,z:0,w:1.2,d:8}));
 if(p.key!=='field'||!fieldSizeValid(p.fieldSize))return [];
 const [w,d]=p.fieldSize.map(n=>n*2), beds=[];
 // 1.2 m beds separated by 0.8 m aisles; 1 m clear headlands.
 for(let x=-w/2+1;x<=w/2-1;x+=2)for(let z=-d/2+1;z<d/2-1;z+=5){
  const length=Math.min(4,d/2-1-z);if(length>0)beds.push({x,z:z+length/2,w:1.2,d:length});
 }
 return beds;
}
export function ensureCultivation(s,p){
 if(!CULTIVATION_KEYS.includes(p.key)||p.felled)return null;
 if(p.cultivation)return p.cultivation;
 if((s.operations||[]).some(o=>o.site===p.id&&!o.done&&!o.farm&&!o.water))return null;
 p.cultivation={version:1,beds:bedLayout(p).map((g,id)=>({...g,id,stage:'unprepared',crop:'greens',density:1,irrigation:true,residues:'leave',moisture:p.soilMoisture??.75,fertility:p.soilFertility??1,organic:0,cover:0,residueKg:0,amendmentKg:0,growth:0,stress:0,elapsed:0,irrigated:0,rainLiters:0,evaporated:0,drained:0,decomposed:0,exportedKg:0}))};
 delete p.repeat;
 return p.cultivation;
}
export function bedWorld(p,b,size){
 const a=(p.rotation||0)*Math.PI/2;
 return {x:p.x+(size[0]-1)/2+(Math.cos(a)*b.x+Math.sin(a)*b.z)/2,z:p.z+(size[1]-1)/2+(-Math.sin(a)*b.x+Math.cos(a)*b.z)/2};
}
export function farmRecipe(op,recipes){return op?.farm?{...recipes[op.recipe],input:op.input,output:op.harvestOutput||{},work:op.farm.work}:recipes[op?.recipe];}
export function farmJobError(s,p,b,action){
 if(!b||!FARM_ACTIONS.includes(action))return 'Choose a bed and an action.';
 if((s.operations||[]).some(o=>o.site===p.id&&!o.done&&(o.farm?.bed===b.id||(!o.farm&&!o.water))))return 'This bed already has work pending.';
 if(action==='prepare'&&!['unprepared','harvested'].includes(b.stage))return 'Clear this bed before preparing it.';
 if(action==='plant'&&b.stage!=='prepared')return 'Prepare the soil before planting.';
 if(action==='harvest'&&b.stage!=='harvestable')return 'This crop is not ready for harvest.';
 if(action==='clear'&&!['growing','harvestable'].includes(b.stage))return 'There is no standing crop to clear.';
 if(action==='collect'&&b.residueKg<1)return 'At least 1 kg of residues is needed for collection.';
 return '';
}
export function farmJobSpec(b,action){
 const area=b.w*b.d;
 return {input:action==='plant'?{[`${b.crop}_seed`]:Math.max(1,Math.ceil(area*b.density/4))}:action==='amend'?{compost:Math.ceil(area*.5)}:{},work:Math.ceil(area*({prepare:18,plant:12,harvest:15,clear:8,amend:5,collect:5}[action]))};
}
export function finishFarmJob(s,p,op){
 const b=p.cultivation.beds[op.farm.bed],crop=CROPS[b.crop],area=b.w*b.d;
 let output={};
 switch(op.farm.action){
 case 'prepare':b.stage='prepared';break;
 case 'plant':
  Object.assign(b,{stage:s.mode==='sandbox'?'harvestable':'growing',growth:s.mode==='sandbox'?1:0,stress:0,elapsed:0,plantedAt:s.time});
  if(s.mode==='sandbox')b.ripeAt=s.time;else delete b.ripeAt;
  break;
 case 'amend':b.amendmentKg+=op.input.compost;break;
 case 'collect':{const n=Math.floor(b.residueKg);output={scraps:n};b.residueKg-=n;break;}
 case 'clear':case 'harvest':{
  const health=b.elapsed?Math.max(0,1-b.stress/b.elapsed):1;
  const crowd=1/(1+Math.max(0,b.density-1)*1.5);
  const late=op.farm.action==='harvest'?Math.max(0,1-Math.max(0,(s.time-b.ripeAt)/GAME_DAY-crop.window)/crop.window):0;
  const kg=Math.floor(area*crop.yieldKg*Math.min(b.density,1.2)*crowd*health*late);
  if(kg)output[b.crop]=kg;
  const residues=area*crop.residue*b.growth*health;
  b.residueKg+=residues;
  if(b.residues==='collect'){output.scraps=Math.floor(b.residueKg);b.residueKg-=output.scraps;}
  b.exportedKg+=kg;b.fertility=Math.max(0,b.fertility-kg/(area*20));b.stage='harvested';b.growth=0;delete b.ripeAt;
  break;
 }
 }
 b.cover=Math.min(1,b.residueKg/(area*.5));
 op.harvestOutput=output;
}
export function cultivationStep(s,dt,useWater,defs){
 for(const p of s.projects){
  if(p.work<(defs[p.key]?.work||0))continue;
  const farm=ensureCultivation(s,p);if(!farm)continue;
  // Bounded steps make evaporation and decomposition stable across fast-forward.
  for(let remaining=dt;remaining>1e-8;){const step=Math.min(remaining,GAME_DAY/24),days=step/GAME_DAY;remaining-=step;
   for(const b of farm.beds){
    const area=b.w*b.d;
    const decay=b.residueKg*(1-Math.exp(-days/60)),amend=b.amendmentKg*(1-Math.exp(-days/30));
    b.residueKg-=decay;b.amendmentKg-=amend;b.decomposed+=decay+amend;
    b.organic=Math.min(1,b.organic+(decay+amend)/(area*10));b.fertility=Math.min(1,b.fertility+(decay+amend)/(area*8));b.cover=Math.min(1,b.residueKg/(area*.5));
    if(s.mode==='sandbox')continue;
    const growing=b.stage==='growing',crop=CROPS[b.crop],capacity=area*16;
    const demand=area*(growing?crop.water*b.density:1)*(1-.4*b.cover)*days;
    const rain=s.rain&&p.key!=='greenhouse'?area*6*days:0;
    const irrigate=growing&&b.irrigation&&s.infrastructure?.nodes[p.id]?.enabled!==false&&b.moisture<.75&&!rain&&useWater(s,p.id,demand,true)?demand:0;
    b.irrigated+=irrigate;b.rainLiters+=rain;
    const available=b.moisture*capacity+rain+irrigate;
    b.evaporated+=Math.min(available,demand);b.drained+=Math.max(0,available-demand-capacity);
    b.moisture=Math.max(0,Math.min(1,(available-demand)/capacity));
    if(!growing)continue;
    const moisture=Math.min(1,b.moisture/.4),fertility=.3+.7*b.fertility,crowd=1/(1+Math.max(0,b.density-1));
    const condition=moisture*fertility*crowd;
    b.elapsed+=step;b.stress+=step*(1-condition);
    b.growth=Math.min(1,b.growth+days/crop.days*condition*(p.key==='greenhouse'?1:growthRate(s,'vegetables')));
    if(b.growth>=1){b.stage='harvestable';b.ripeAt=s.time;}
   }
  }
 }
}
export function validCultivation(s){
 for(const p of s.projects){
  if(p.key==='field'&&!fieldSizeValid(p.fieldSize))return false;
  if(!p.cultivation)continue;
  const layout=bedLayout(p),f=p.cultivation;
  if(!CULTIVATION_KEYS.includes(p.key)||f.version!==1||!Array.isArray(f.beds)||f.beds.length!==layout.length)return false;
  for(const [i,b]of f.beds.entries()){
   if(b.id!==i||['x','z','w','d'].some(k=>b[k]!==layout[i][k])||!CROPS[b.crop]||![.5,1,1.5].includes(b.density)||typeof b.irrigation!=='boolean'||!['leave','collect'].includes(b.residues))return false;
   if(!['unprepared','prepared','growing','harvestable','harvested'].includes(b.stage))return false;
   if(['moisture','fertility','organic','cover','growth'].some(k=>!Number.isFinite(b[k])||b[k]<0||b[k]>1))return false;
   if(['residueKg','amendmentKg','stress','elapsed','irrigated','rainLiters','evaporated','drained','decomposed','exportedKg'].some(k=>!Number.isFinite(b[k])||b[k]<0)||b.stress>b.elapsed+1e-6)return false;
   if(b.stage==='harvestable'&&(!Number.isFinite(b.ripeAt)||b.ripeAt>s.time||b.ripeAt<0))return false;
  }
 }
 for(const o of s.operations||[]){if(!o.farm)continue;
  const p=s.projects.find(p=>p.id===o.site),b=p?.cultivation?.beds[o.farm.bed];
  if(!b||!FARM_ACTIONS.includes(o.farm.action)||o.recipe!==`farm_${o.farm.action}`||!Number.isFinite(o.farm.work)||o.farm.work<=0||o.farm.work>10000)return false;
  if(!o.input||Object.entries(o.input).some(([id,n])=>!['compost',...Object.keys(CROPS).map(c=>`${c}_seed`)].includes(id)||!Number.isInteger(n)||n<0||n>100))return false;
  if(o.harvestOutput&&Object.entries(o.harvestOutput).some(([id,n])=>![...Object.keys(CROPS),'scraps'].includes(id)||!Number.isInteger(n)||n<0||n>100))return false;
 }
 return true;
}
