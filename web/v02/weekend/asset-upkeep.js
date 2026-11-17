import {activeTrips} from "./trip-state.js";
import {GAME_DAY} from './biological-production.js';
// Inspection/service intervals are engineering assumptions, not warranties.
const INTERVALS={home:365,shed:365,warehouse:365,kitchen:180,workshop:180,
 'water-pump':90,well:180,'groundwater-well':365,solar_farm:180,hydro:90,greenhouse:180};
export const ANIMAL_CARE={coop:{days:3,fodder:1,water:2,work:25},goat_pasture:{days:1,fodder:3,water:16,work:35}};
export function upkeep(s){return s.upkeep??={version:1,automatic:true,dailyBudget:100,day:-1,used:0,vehicles:[{condition:100,km:0},{condition:100,km:0}],jobs:[]};}
export function assetCondition(p){return p.condition??100;}
export function serviceFactor(p){return Math.max(0,Math.min(1,assetCondition(p)/40));}
export function recordVehicleDistance(s,index,km){const v=upkeep(s).vehicles[index];v.km+=km;v.condition=Math.max(0,v.condition-km*30/5000);}
export function upkeepStep(s,defs,dt){
 if(s.mode==='sandbox')return;const u=upkeep(s),day=Math.floor((540+s.time*.45)/1440);
 if(u.day!==day){u.day=day;u.used=0;}
 for(const p of s.projects){const d=defs[p.key],interval=INTERVALS[d.kind];if(p.work<d.work)continue;
  const care=ANIMAL_CARE[d.kind];
  if(care&&(p.key!=='goat-pasture-empty'||p.stocked)){
    p.animalHealth=Math.max(0,Math.min(100,(p.animalHealth??100)+(s.time<(p.careUntil||0)?2:-15)*dt/GAME_DAY));
    if(s.time>=(p.careUntil||0)&&!u.jobs.some(j=>j.target===p.id&&j.care&&!j.done))u.jobs.push({target:p.id,care:d.kind,work:0,partsPaid:false,done:false});
  }
  if(!interval)continue;
  p.condition=Math.max(0,assetCondition(p)-dt/GAME_DAY*30/interval);
  if(u.automatic&&p.condition<70&&!u.jobs.some(j=>j.target===p.id&&!j.done))u.jobs.push({target:p.id,work:0,partsPaid:false,done:false});
 }
 for(let i=0;i<2;i++)if(u.automatic&&u.vehicles[i].condition<70&&!u.jobs.some(j=>j.vehicle===i&&!j.done))u.jobs.push({vehicle:i,work:0,partsPaid:false,done:false});
 u.jobs=u.jobs.filter(j=>!j.done&&(j.vehicle!==undefined||s.projects.some(p=>p.id===j.target)));
}
export function performUpkeep(s,r,dt,go,changeMaterial,materials,carDoor,useWater,workSpot){
 const u=upkeep(s);if(r.cargo||r.outsideWork||s.people.some(p=>p!==r&&p.action==='service'))return false;
 const job=u.jobs.find(j=>!j.done&&(u.automatic||j.care)&&(!j.person||j.person===r.id||!s.people.some(p=>p.id===j.person&&p.action==='service'))&&
  (j.vehicle===undefined||!activeTrips(s).some(t=>t.vehicle===j.vehicle)));
 if(!job)return false;
 const p=job.vehicle===undefined?s.projects.find(p=>p.id===job.target):null;
 if(job.vehicle===undefined&&!p){job.done=true;return false;}
 const care=ANIMAL_CARE[job.care];
 const cost=materials.tools.price/materials.tools.quantity+materials.hardware.price/materials.hardware.quantity;
 if(!job.partsPaid){
  if(care?s.materials.fodder<care.fodder:(u.used+cost>u.dailyBudget||s.materials.tools<1||s.materials.hardware<1)){job.status=care?'Needs animal fodder':'Needs tools, fasteners or a higher daily service budget';return false;}
  if(!go(s,r,s.stock)){r.action='collect';return true;}
  if(care)changeMaterial(s,'fodder',-care.fodder);else{changeMaterial(s,'tools',-1);changeMaterial(s,'hardware',-1);u.used+=cost;}job.partsPaid=true;
 }
 job.person=r.id;r.job=null;r.operation=null;r.action='service';
 const target=p?(workSpot?workSpot(s,r,p):{x:p.x-1,z:p.z}):carDoor(job.vehicle);
 if(!target){job.status="No accessible service position";r.action="idle";return false;}
 if(!go(s,r,target))return true;
 if(care&&!job.waterPaid){if(!useWater(s,p.id,care.water,false)){job.status='Waiting for animal drinking water';return true;}job.waterPaid=true;}
 job.status=care?'Feeding and caring for animals':'Resident servicing equipment';job.work+=dt;r.work+=dt;r.energy=Math.max(0,r.energy-dt*.12);
 if(job.work>=(care?.work||240)){if(care){p.careUntil=s.time+care.days*GAME_DAY;p.animalHealth=Math.min(100,(p.animalHealth??100)+40);}else if(p)p.condition=100;else u.vehicles[job.vehicle].condition=100;job.done=true;r.action='idle';}
 return true;
}
export function upkeepText(s){const u=upkeep(s);return `${u.jobs.length} service jobs · R$${u.used.toFixed(2)} / R$${u.dailyBudget.toFixed(2)} daily materials allowance. Repairs use one tool pack, one fastener pack and 108 resident-minutes. Supplies must already be in stores. ${u.jobs.some(j=>j.status?.startsWith('Needs'))?'Service is waiting for materials or budget.':''}`;}
export function validUpkeep(s){if(!s.projects.every(p=>(p.animalHealth===undefined||(Number.isFinite(p.animalHealth)&&p.animalHealth>=0&&p.animalHealth<=100))&&(p.careUntil===undefined||(Number.isFinite(p.careUntil)&&p.careUntil>=0))&&(p.condition===undefined||(Number.isFinite(p.condition)&&p.condition>=0&&p.condition<=100))))return false;
 const u=s.upkeep;if(u===undefined)return true;
 return u?.version===1&&typeof u.automatic==='boolean'&&Number.isFinite(u.dailyBudget)&&u.dailyBudget>=0&&u.dailyBudget<=100000&&Number.isFinite(u.used)&&u.used>=0&&Number.isInteger(u.day)&&Array.isArray(u.vehicles)&&u.vehicles.length===2&&u.vehicles.every(v=>Number.isFinite(v.condition)&&v.condition>=0&&v.condition<=100&&Number.isFinite(v.km)&&v.km>=0)&&Array.isArray(u.jobs)&&u.jobs.length<=514&&u.jobs.every(j=>Number.isFinite(j.work)&&j.work>=0&&j.work<=241&&typeof j.partsPaid==='boolean'&&typeof j.done==='boolean'&&(!j.care||!!ANIMAL_CARE[j.care])&&(j.vehicle===undefined?s.projects.some(p=>p.id===j.target):[0,1].includes(j.vehicle)))&&s.projects.every(p=>p.condition===undefined||(Number.isFinite(p.condition)&&p.condition>=0&&p.condition<=100));
}
