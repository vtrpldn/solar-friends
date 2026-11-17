import {PROJECTS,plan,planField,queueProduction,repeatProduction,queueWater,queuePurification,queueSanitation,supplyRun,sellMaterial,queueBedJob,configureBed} from './simulation.js';
import {setOutsideWork} from './outside-work.js';
import {harvestExpired,harvestYield} from './cultivation.js';
export const SAMPLE_LIMIT=2160;
export const STOP_CONDITIONS=['none','harvest','crop-failed','hydration','water','blocked'];
// Every mutation goes through the same orders as the game. No diagnostic supplies.
export function labCommand(s,m){
 switch(m.type){
 case 'build':return m.key==='field'?planField(s,m.x,m.z,m.size,m.rotation):plan(s,m.key,m.x,m.z,m.rotation);
 case 'bed':case 'bed-config':{
  const p=s.projects.find(p=>p.id===m.site),beds=p?.cultivation?.beds;
  if(!beds)return 'Choose a completed cultivation site.';
  const chosen=m.bed==='all'?beds:beds.filter(b=>b.id===m.bed);if(!chosen.length)return 'Choose a bed.';
  return chosen.map(b=>{const error=m.type==='bed'?queueBedJob(s,m.site,b.id,m.action):configureBed(s,m.site,b.id,m.settings||{});return `Bed ${b.id+1}: ${error||'accepted'}`;}).join(' · ');
 }
 case 'outside':{const r=s.people.find(r=>r.id===m.resident);if(!r||typeof m.enabled!=='boolean')return 'Choose a resident and employment setting.';setOutsideWork(s,r,m.enabled);return '';}
 case 'produce':return queueProduction(s,m.site,m.recipe);
 case 'repeat':return repeatProduction(s,m.site,m.recipe)?'':'Cannot repeat this job.';
 case 'buy':return supplyRun(s,m.material)?'':'No resident, car, storage or savings available.';
 case 'sell':return sellMaterial(s,m.material)?'':'Not enough surplus for one sale batch.';
 case 'haul':return queueWater(s,-1,m.site,'irrigation');
 case 'purify':return queuePurification(s,m.site);
 case 'service':return queueSanitation(s,m.site);
 case 'maintain':{const n=s.infrastructure.nodes[m.site];if(!n||!['maintainFresh','maintainSanitation'].includes(m.field))return 'Choose a water facility and supported care setting.';n[m.field]=!n[m.field];return '';}
 case 'food-policy':s.emergencyFood=s.emergencyFood===false;return '';
 case 'grid':s.infrastructure.grid.enabled=!s.infrastructure.grid.enabled;return '';
 default:throw Error('Unknown lab action');
 }
}
export function labSample(s){
 const nodes=Object.values(s.infrastructure.nodes),residents=s.people.map(r=>({id:r.id,name:r.name,action:r.action,energy:r.energy,needs:{...r.needs},outside:!!r.outsideJobEnabled,blocker:r.needBlocked||r.outsideWorkBlocked||'',operation:r.operation}));
 return {time:s.time,day:1+Math.floor((540+s.time*.45)/1440),money:s.money,wood:s.wood,food:s.materials.food,meals:s.materials.meals,water:nodes.reduce((n,a)=>n+a.water[0],0),gridSpent:s.infrastructure.grid.spent,
  energy:residents.map(r=>r.energy),needs:Object.fromEntries(['hunger','hydration','bladder','bowels','hygiene','social','fun'].map(k=>[k,Math.min(...residents.map(r=>r.needs[k]))])),actions:residents.map(r=>r.action),residents,
  inventory:{wood:s.wood,...s.materials},spoiled:{...s.foodStorage?.spoiled},finance:{income:s.finances?.income||0,expenses:s.finances?.expenses||0,categories:{...s.finances?.categories}},weather:{...s.weather},hydrology:s.hydrology?structuredClone(s.hydrology):null,
  projects:s.projects.filter(p=>!p.natural).map(p=>({id:p.id,key:p.key,work:p.work,required:PROJECTS[p.key].work,beds:p.cultivation?.beds.map(b=>({id:b.id,crop:b.crop,stage:harvestExpired(b,s.time)?'expired':b.stage,growth:b.growth,moisture:b.moisture,damage:b.droughtDamage||0,yieldKg:harvestYield(b,s.time),irrigated:b.irrigated,rain:b.rainLiters,exportedKg:b.exportedKg,fieldLossKg:b.fieldLossKg})),animalHealth:p.animalHealth,animalCare:p.animalCare?structuredClone(p.animalCare):undefined})),
  jobs:(s.operations||[]).filter(o=>!o.done).map(o=>({id:o.id,site:o.site,recipe:o.recipe,phase:o.phase,work:o.work,status:o.status||o.phase,workers:s.people.filter(r=>r.operation===o.id).map(r=>r.name),retryAt:o.accessRetryAt?{...o.accessRetryAt}:undefined}))};
}
export function stopReason(s,condition){
 const beds=s.projects.flatMap(p=>p.cultivation?.beds||[]);
 if(condition==='harvest'&&beds.some(b=>b.stage==='harvestable'&&!harvestExpired(b,s.time)))return 'A crop is ready to harvest.';
 if(condition==='crop-failed'&&beds.some(b=>b.stage==='failed'||harvestExpired(b,s.time)))return 'A crop has failed or expired.';
 if(condition==='hydration'&&s.people.some(r=>r.needs.hydration<20))return 'A resident has urgent thirst.';
 if(condition==='water'&&Object.values(s.infrastructure.nodes).reduce((n,a)=>n+a.water[0],0)<.5)return 'Less than 0.5 L of potable water remains.';
 if(condition==='blocked'&&(s.operations||[]).some(o=>!o.done&&o.accessRetryAt&&Object.values(o.accessRetryAt).some(t=>t>s.time)))return 'A job is waiting for access.';
 return '';
}
export function sameLabState(a,b){
 const stable=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
 return stable(a)===stable(b);
}
