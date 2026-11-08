import { useWater } from './infrastructure.js';
export const NEED_KEYS=['hunger','bladder','bowels','hygiene','social','fun'];
const clamp=n=>Math.max(0,Math.min(100,n));
export function ensureNeeds(r,i=0) {
  if(!r.needs)r.needs={hunger:76+i*3,bladder:82-i*5,bowels:88-i*3,hygiene:90-i*2,social:78+i*3,fun:82-i*2};
  return r.needs;
}
export function needMeters(r) {
 const n=ensureNeeds(r);
 return [['Energy',r.energy],['Hunger',n.hunger],['Toilet',Math.min(n.bladder,n.bowels)],['Hygiene',n.hygiene],['Social',n.social],['Fun',n.fun]];
}
export function decayNeeds(s,r,i,dt) {
 const n=ensureNeeds(r,i), working=['build','produce','install','carry','collect'].includes(r.action);
 const rates={hunger:.055,bladder:.12,bowels:.047,hygiene:working?.075:.018,social:.035,fun:working?.055:.025};
 for(const key of NEED_KEYS)n[key]=clamp(n[key]-rates[key]*dt*(.9+i*.05));
 if(r.tentPhase==='inside') {n.fun=clamp(n.fun+dt*.04);return;}
 // Friendly conversation during leisure also helps, but only with someone nearby.
 if(r.action==='chat' && !r.needTask && s.people.some(p=>p!==r && p.action==='chat' && Math.hypot(p.x-r.x,p.z-r.z)<2))n.social=clamp(n.social+dt*.7);
}
const ACTION={hunger:'eat',bladder:'toilet',bowels:'toilet',hygiene:'wash',social:'chat',fun:'play'};
const DURATIONS={hunger:12,bladder:6,bowels:10,hygiene:14,social:18,fun:22};
function release(r) {
 r.needTask=null;r.walk=[];r.target=null;r.lookAt=null;
 r.toiletSite=null;r.washSite=null;r.toiletTime=0;r.washTime=0;r.action='idle';
}
export function cancelNeed(s,r) {
 const partner=s.people.find(p=>p.id===r.needTask?.partner);
 if(partner?.needTask?.partner===r.id)release(partner);
 release(r);
}
function assign(s,r,kind,spot,details={}) {
 r.job=null;r.workSpot=null;r.linkJob=null;r.operation=null;r.supplyGoal=null;
 r.walk=[];r.target=null;r.idleGoal=null;r.idleUntil=0;
 r.needBlocked=null;r.action=ACTION[kind];r.needTask={kind,target:spot,elapsed:0,duration:DURATIONS[kind],created:s.time,...details};
 if(kind==='hygiene')r.washSite=details.site;
 if(kind==='bladder'||kind==='bowels')r.toiletSite=details.site;
}
// Called before movement so an unladen resident can stop heading to a job.
export function chooseNeed(s,r,i,api) {
 if(r.needTask && s.time-r.needTask.created>240){cancelNeed(s,r);r.needRetryAt=s.time+15;}
 if(r.needTask || r.tentPhase || r.cargo || (r.operation && ['return','deliver'].includes(s.operations?.find(o=>o.id===r.operation)?.phase)) || r.action==='town' || s.stage!=='playing' || r.energy<25 || (r.needRetryAt||0)>s.time)return;
 const n=ensureNeeds(r,i);
 const pending=NEED_KEYS.filter(k=>n[k]<(k==='social'||k==='fun'?35:30)).sort((a,b)=>n[a]-n[b]);
 if(!pending.length){r.needBlocked=null;return;}
 const nodes=Object.values(s.infrastructure.nodes);
 const free=node=>!s.people.some(p=>p!==r && p.needTask?.site===node.id);
 const choose=predicate=>nodes.filter(a=>a.enabled && predicate(a) && free(a)).sort((a,b)=>Math.hypot(a.x-r.x,a.z-r.z)-Math.hypot(b.x-r.x,b.z-r.z)).map(node=>({node,spot:api.serviceSpot(node,r)})).find(v=>v.spot && api.route(r,v.spot));
 for(const kind of pending) {
  if(kind==='hunger') {
   if(!(s.materials.meals>0 || s.materials.food>0))continue;
   const spot=api.groundSpot(r,s.stock,i);
   if(spot){assign(s,r,kind,spot,{label:'Eating a meal',animation:'eat'});return;}
  }
  if(kind==='bladder'||kind==='bowels') {
   const waste=kind==='bowels'?1.5:.5;
   const facility=choose(node=>['eco_toilet','home'].includes(node.kind) && node.capacity[3]-node.water[3]>=waste);
   if(facility) {assign(s,r,kind,facility.spot,{site:facility.node.id,private:true,label:kind==='bowels'?'Using the toilet':'Taking a pee break',animation:kind==='bowels'?'toilet':'pee',waste});return;}
   // A discreet land-side camp latrine fallback; never use the river as a toilet.
   const spot=api.groundSpot(r,api.camp(),i+8,true);
   if(spot) {assign(s,r,kind,spot,{label:'Using the temporary camp latrine',animation:kind==='bowels'?'toilet':'pee',waste});return;}
  }
  if(kind==='hygiene') {
   const facility=choose(node=>['home','wash-station','eco_toilet','camp'].includes(node.kind) && node.water[0]>=1 && node.capacity[2]-node.water[2]>=.8);
   if(facility) {assign(s,r,kind,facility.spot,{site:facility.node.id,private:facility.node.kind==='home',label:facility.node.kind==='home'?'Bathing at home':'Washing up',animation:facility.node.kind==='home'?'bathe':'wash'});return;}
   const spot=api.groundSpot(r,api.river(),i);
   if(spot){assign(s,r,kind,spot,{river:true,label:'Washing by the river',animation:'bathe'});return;}
  }
  if(kind==='social') {
   const partner=s.people.filter(p=>p!==r && !p.tentPhase && !p.needTask && !p.cargo && !p.operation && p.action!=='town' && p.energy>=35 && Math.min(...Object.values(ensureNeeds(p)))>20)
    .sort((a,b)=>Math.hypot(a.x-r.x,a.z-r.z)-Math.hypot(b.x-r.x,b.z-r.z))[0];
   if(partner) {
    const spot=api.groundSpot(r,api.camp(),i), other=spot && api.groundSpot(partner,spot,i+1);
    if(spot&&other&&Math.hypot(spot.x-other.x,spot.z-other.z)<=2.5){
     assign(s,r,kind,spot,{partner:partner.id,label:`Chatting with ${partner.name}`,animation:'chat'});
     assign(s,partner,kind,other,{partner:r.id,label:`Chatting with ${r.name}`,animation:'chat'});
     r.lookAt=partner.id;partner.lookAt=r.id;return;
    }
   }
  }
  if(kind==='fun') {
   const facility=choose(node=>['square','reading-room','outdoor-classroom','exercise-garden','volleyball-court','community-hall','picnic-table','garden-bench','fire-circle','hammock'].includes(node.kind));
   const spot=facility?.spot || api.groundSpot(r,api.camp(),i+3);
   if(spot){const reading=facility?.node.kind==='reading-room';assign(s,r,kind,spot,{site:facility?.node.id,label:reading?'Reading for a while':facility?'Enjoying the community space':'Taking a stretching break',animation:reading?'read':facility?'play':'stretch'});return;}
  }
 }
 r.needBlocked=pending.includes("hunger") && !(s.materials.meals>0 || s.materials.food>0) ? "Hungry: no food in stores" : pending[0]==="social" ? "Waiting for a friend to have a break" : "Looking for somewhere to meet this need";
 r.needRetryAt=s.time+12;
}
// A task owns its route until completion. Needs improve through actions, never
// merely because a destination was selected. Food and water settle exactly once.
export function advanceNeed(s,r,dt,api) {
 const task=r.needTask;if(!task)return false;
 if(s.time-task.created>240 || (r.energy<12 && task.kind!=='hunger')) {cancelNeed(s,r);r.needRetryAt=s.time+15;return false;}
 const node=task.site==null?null:s.infrastructure.nodes[task.site];
 if(task.site!=null && !node?.enabled){cancelNeed(s,r);r.needRetryAt=s.time+5;return false;}
 r.action=ACTION[task.kind];
 if(!api.go(r,task.target))return true;
 if(task.partner) {
  const partner=s.people.find(p=>p.id===task.partner);
  if(!partner?.needTask || partner.needTask.partner!==r.id){release(r);return false;}
  if(Math.hypot(partner.x-task.target.x,partner.z-task.target.z)>2.5 || partner.walk.length)return true;
 }
 task.elapsed+=dt;
 if(r.action==='toilet')r.toiletTime=task.elapsed;
 if(r.action==='wash')r.washTime=task.elapsed;
 if(task.elapsed<task.duration)return true;
 const n=r.needs;
 if(task.kind==='hunger') {
  const food=s.materials.meals>=1?'meals':s.materials.food>=1?'food':null;
  if(food){s.materials[food]--;s.materials.scraps=(s.materials.scraps||0)+1;n.hunger=90;n.bladder=clamp(n.bladder-5);n.bowels=clamp(n.bowels-4);}
 } else if(task.kind==='hygiene') {
  if(task.river || (node && useWater(s,node.id,1))){n.hygiene=task.river?78:95;r.cleanedAtWork=r.work;}
 } else if(task.kind==='bladder'||task.kind==='bowels') {
  if(node) {
   if(node.capacity[3]-node.water[3]<task.waste){release(r);return true;}
   node.water[3]+=task.waste;s.infrastructure.account.waterReceived+=task.waste;
  }
  else s.latrineWaste=(s.latrineWaste||0)+task.waste;
  n[task.kind]=95;n.hygiene=clamp(n.hygiene-8);r.toiletAt=s.time;
 } else if(task.kind==='social') {
  n.social=95;n.fun=clamp(n.fun+15);
  const partner=s.people.find(p=>p.id===task.partner);
  if(partner?.needTask?.partner===r.id){partner.needs.social=95;partner.needs.fun=clamp(partner.needs.fun+15);release(partner);partner.needRetryAt=s.time+3;}
 } else n.fun=95;
 r.needHistory??={};r.needHistory[task.kind]=(r.needHistory[task.kind]||0)+1;
 release(r);r.needRetryAt=s.time+3;
 return true;
}
export function validNeeds(r) {
 return r.needs===undefined || (r.needs && NEED_KEYS.every(k=>Number.isFinite(r.needs[k])&&r.needs[k]>=0&&r.needs[k]<=100));
}
