import {hydrationStep,drinkWater} from './hydration.js';
import {gatheringFor,attend} from './village-life.js';
import {foodPortions,eatMeal} from './food-storage.js';
import {profileFor} from './resident-personality.js';
import {committed, conversationPartners, conversationFor, finishConversation, finishPersonalTime} from './resident-mind.js';
import { useWater } from './infrastructure.js';
export const NEED_KEYS=['hunger','bladder','bowels','hygiene','social','fun','hydration'];
// The clock starts at 09:00 and advances 0.45 game minutes per second.
export function mealTime(s,r) {
 const hour=(9+s.time*.45/60)%24;
 const window=(hour>=6.5&&hour<8.5)||(hour>=12&&hour<14)||(hour>=18&&hour<20);
 // A late meal or an emergency snack also counts: do not eat twice in quick succession.
 return window && (r.lastMealAt==null || (s.time-r.lastMealAt)*.45>=180);
}
const clamp=n=>Math.max(0,Math.min(100,n));
export function ensureNeeds(r,i=0) {
  if(!r.needs)r.needs={hunger:76+i*3,bladder:82-i*5,bowels:88-i*3,hygiene:90-i*2,social:78+i*3,fun:82-i*2};
  r.needs.hydration??=100;
  return r.needs;
}
export function needMeters(r) {
 const n=ensureNeeds(r);
 return [['Energy',r.energy],['Hydration',n.hydration],['Hunger',n.hunger],['Toilet',Math.min(n.bladder,n.bowels)],['Hygiene',n.hygiene],['Social',n.social],['Fun',n.fun]];
}
export function decayNeeds(s,r,i,dt) {
 const n=ensureNeeds(r,i), working=['build','produce','install','carry','collect'].includes(r.action);
 const rates={hunger:.055,bladder:.12,bowels:.047,hygiene:working?.075:.018,social:.035,fun:working?.055:.025};
 hydrationStep(s,r,dt);
 for(const key of NEED_KEYS.filter(k=>k!=='hydration'))n[key]=clamp(n[key]-rates[key]*dt*(r.tentPhase==='inside'?.35:1)*(profileFor(r).rates[key]||1));
 if(r.tentPhase==='inside') {n.fun=clamp(n.fun+dt*.04);return;}
}
const ACTION={hydration:'drink',hunger:'eat',bladder:'toilet',bowels:'toilet',hygiene:'wash',social:'chat',fun:'play',gather:'chat'};
// A stay at a gathering is renewed while the event lasts, so friends still break for needs.
const DURATIONS={hydration:2,hunger:12,bladder:6,bowels:10,hygiene:14,social:18,fun:22,gather:160};
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
 r.downtime=null;
 r.job=null;r.workSpot=null;r.linkJob=null;r.operation=null;r.supplyGoal=null;
 r.walk=[];r.target=null;r.idleGoal=null;r.idleUntil=0;
 r.needBlocked=null;r.action=ACTION[kind];r.needTask={kind,target:spot,elapsed:0,duration:DURATIONS[kind],created:s.time,...details};
 if(kind==='hygiene')r.washSite=details.site;
 if(kind==='bladder'||kind==='bowels')r.toiletSite=details.site;
}
// Called before movement so an unladen resident can stop heading to a job.
// A return-phase job can be between loads: only actual carried cargo defers
// a break. Otherwise urgent toilet needs and exhaustion can trap a worker in
// repeated sleep/exit loops while the uncollected goods remain safely at site.
export function chooseNeed(s,r,i,api) {
 const physical=['hunger','bladder','bowels','hydration'];
 if(r.needTask && !physical.includes(r.needTask.kind) && physical.some(k=>ensureNeeds(r)[k]<10&&(k!=='hunger'||foodPortions(s)>0)))cancelNeed(s,r);
 if(r.needTask && s.time-r.needTask.created>240){cancelNeed(s,r);r.needRetryAt=s.time+15;}
 if(r.needTask || r.tentPhase || r.cargo || r.action==='town' || s.stage!=='playing' || (r.energy<25 && Math.min(ensureNeeds(r).hunger,ensureNeeds(r).bladder,ensureNeeds(r).bowels,ensureNeeds(r).hydration)>=15) || (r.needRetryAt||0)>s.time)return;
 const n=ensureNeeds(r,i);
 const temperament=profileFor(r).temperament;
 // Start drinking before thirst becomes an alert, leaving time to reach a source.
 const threshold=k=>k==='hydration' ? 70 : k==='social' ? (committed(r)?35:temperament.socialAt) : k==='fun' ? temperament.breakAt : k==='hunger' && mealTime(s,r) ? 80 : 30;
 const pending=NEED_KEYS.filter(k=>(!r.outsideWork || physical.includes(k)) && (r.energy>=25 || physical.includes(k)) && n[k]<threshold(k) &&
   (k!=='social' || (r.mind?.quietUntil||0)<=s.time))
   .sort((a,b)=>(physical.includes(b)&&n[b]<15?1:0)-(physical.includes(a)&&n[a]<15?1:0)||n[a]/threshold(a)-n[b]/threshold(b));
 // A festa, the roda or a course to teach comes before work, after bodily needs.
 const gathering=gatheringFor(s,r);
 // Only a pressing bodily need keeps a friend away: wanting dinner or a drink soon does not.
 if(gathering && r.energy>=25 && !r.outsideWork && !physical.some(k=>n[k]<25)){
  const spot=api.groundSpot(r,gathering.centre,i+2);
  if(spot){assign(s,r,'gather',spot,{gathering:gathering.id,label:gathering.label,animation:gathering.animation,facing:{x:gathering.centre.x,z:gathering.centre.z}});return;}
 }
 if(!pending.length){r.needBlocked=null;return;}
 const nodes=Object.values(s.infrastructure.nodes);
 const free=node=>!s.people.some(p=>p!==r && p.needTask?.site===node.id);
 const choose=predicate=>{
   const candidates=nodes.filter(a=>a.enabled && predicate(a) && free(a)).sort((a,b)=>{
     const favorites=profileFor(r).favorites;
     const rank=node=>favorites.includes(node.kind)?favorites.indexOf(node.kind):favorites.length;
     return rank(a)-rank(b)||Math.hypot(a.x-r.x,a.z-r.z)-Math.hypot(b.x-r.x,b.z-r.z);
   });
   for(const node of candidates){const spot=api.serviceSpot(node,r);if(spot && api.route(r,spot))return {node,spot};}
   return null;
 };
 for(const kind of pending) {
  if(kind==='hydration'){
   const facility=choose(node=>node.water[0]>=.5&&!['coop','goat_pasture'].includes(node.kind));
   if(facility){assign(s,r,kind,facility.spot,{site:facility.node.id,label:'Drinking potable water',animation:'eat'});return;}
   continue;
  }
  if(kind==='hunger') {
   if(!(foodPortions(s)>0))continue;
   const spot=api.groundSpot(r,s.stock,i);
   if(spot){assign(s,r,kind,spot,{label:'Preparing and eating a camp meal',animation:'eat'});return;}
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
   const bank=api.river(r);
   const spot=bank && api.groundSpot(r,bank,i);
   if(spot){assign(s,r,kind,spot,{river:true,label:'Washing by the river',animation:'bathe'});return;}
  }
  if(kind==='social') {
   if(inviteConversation(s,r,i,api))return;
  }
  if(kind==='fun') {
   const facility=choose(node=>['square','reading-room','outdoor-classroom','exercise-garden','volleyball-court','community-hall','picnic-table','garden-bench','fire-circle','hammock'].includes(node.kind));
   const spot=facility?.spot || api.groundSpot(r,api.camp(),i+3);
   if(spot){
    const place=facility?.node.kind,fire=place==='fire-circle',reading=['reading-room','outdoor-classroom','community-hall'].includes(place);
    assign(s,r,kind,spot,{site:facility?.node.id,label:fire?'Sitting by the fire':reading?'Reading for a while':'Taking a stretching break',animation:fire?'fire-sit':reading?'read':'stretch',facing:fire?{x:facility.node.x,z:facility.node.z}:null});return;
   }
  }
 }
 r.needBlocked=pending.includes("hydration") ? "Needs reachable potable water; fetch and filter water" : pending.includes("hunger") && !(foodPortions(s)>0) ? "Hungry: no food in stores" : pending[0]==="social" ? "Waiting for a friend to have a break" : "Looking for somewhere to meet this need";
 r.needRetryAt=s.time+12;
}
// Both needed and spontaneous conversations share the same consent, travel,
// completion, and cancellation rules. Fireside invitations stay local.
export function inviteConversation(s,r,i,api,{center=api.camp(),near=null,idleOnly=false}={}) {
 if(r.needTask || r.cargo || r.tentPhase || r.sleepUntil || r.action==='town' || r.outsideWork || r.energy<35 || (r.mind?.quietUntil||0)>s.time)return false;
 for(const partner of conversationPartners(s,r)) {
  if(idleOnly && (committed(partner) || (partner.walk.length && !partner.downtime)))continue;
  if(near && Math.hypot(partner.x-near.x,partner.z-near.z)>4)continue;
  const spot=api.groundSpot(r,center,i),other=spot && api.groundSpot(partner,spot,i+1);
  if(spot&&other&&Math.hypot(spot.x-other.x,spot.z-other.z)<=2.5){
   const conversation=conversationFor(s,r,partner);
   assign(s,r,'social',spot,{partner:partner.id,conversation,label:`Talking with ${partner.name} about ${conversation.topic}`,animation:'chat'});
   assign(s,partner,'social',other,{partner:r.id,conversation,label:`Talking with ${r.name} about ${conversation.topic}`,animation:'chat'});
   r.lookAt=partner.id;partner.lookAt=r.id;return true;
  }
 }
 return false;
}
// A task owns its route until completion. Needs improve through actions, never
// merely because a destination was selected. Food and water settle exactly once.
export function advanceNeed(s,r,dt,api) {
 const task=r.needTask;if(!task)return false;
 if(s.time-task.created>240 || (r.energy<12 && !['hunger','bladder','bowels','hydration'].includes(task.kind))) {cancelNeed(s,r);r.needRetryAt=s.time+15;return false;}
 const node=task.site==null?null:s.infrastructure.nodes[task.site];
 if(task.site!=null && !node?.enabled){cancelNeed(s,r);r.needRetryAt=s.time+5;return false;}
 r.action=ACTION[task.kind];
 if(!api.go(r,task.target))return true;
 if(task.partner) {
  const partner=s.people.find(p=>p.id===task.partner);
  if(!partner?.needTask || partner.needTask.partner!==r.id){release(r);return false;}
  if(Math.hypot(partner.x-task.target.x,partner.z-task.target.z)>2.5 || partner.walk.length)return true;
 }
 if(task.kind==='gather' && !attend(s,r,task.gathering,dt)){release(r);r.needRetryAt=s.time+3;return false;}
 // Company and enjoyment build while they are there, not only when they leave.
 if(task.kind==='gather'){r.needs.social=clamp(r.needs.social+dt*.5);r.needs.fun=clamp(r.needs.fun+dt*.4);}
 task.elapsed+=dt;
 if(r.action==='toilet')r.toiletTime=task.elapsed;
 if(r.action==='wash')r.washTime=task.elapsed;
 if(task.elapsed<task.duration)return true;
 const n=r.needs;
 if(task.kind==='hydration'){
  if(drinkWater(s,task.site,.5))n.hydration=Math.min(100,n.hydration+20);
  else r.needBlocked='Drinking source emptied; fetch and filter water';
 } else if(task.kind==='hunger') {
  if(eatMeal(s)){r.lastMealAt=s.time;n.hunger=90;n.bladder=clamp(n.bladder-5);n.bowels=clamp(n.bowels-4);}
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
  if(partner?.needTask?.partner===r.id){finishConversation(s,r,partner,task.conversation);partner.needs.social=95;partner.needs.fun=clamp(partner.needs.fun+15);release(partner);partner.needRetryAt=s.time+3;}
 } else if(task.kind==='gather') {n.social=Math.max(n.social,90);n.fun=Math.max(n.fun,85);
 } else {n.fun=95;finishPersonalTime(s,r,task.label || 'Taking a break');}
 if(task.kind!=='social'){r.needHistory??={};r.needHistory[task.kind]=(r.needHistory[task.kind]||0)+1;}
 release(r);r.needRetryAt=s.time+3;
 return true;
}
export function validNeeds(r) {
 return r.needs===undefined || (r.needs && NEED_KEYS.filter(k=>k!=='hydration'||r.needs.hydration!==undefined).every(k=>Number.isFinite(r.needs[k])&&r.needs[k]>=0&&r.needs[k]<=100));
}
