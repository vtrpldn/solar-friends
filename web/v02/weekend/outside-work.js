import {activeTrips} from "./trip-state.js";
import {transact} from './finances.js';
import {spendableMoney} from './procurement-budget.js';
import {tripEstimate} from './economy-reference.js';
import {CELL_MIN} from './map-size.js';
// Part-time contracts, not compulsory village working hours. Wages are authored
// scenarios pending local occupation-specific quotes; employers provide breaks.
export const OUTSIDE_JOBS={
 iara:{name:'Plant nursery assistant',hours:4,pay:80},
 bento:{name:'Carpentry repairs',hours:4,pay:100},
 luz:{name:'Community café cook',hours:4,pay:80},
 caua:{name:'Solar installation assistant',hours:4,pay:100},
 nina:{name:'Environmental education tutor',hours:4,pay:90},
};
export const COMMUTE_FARE=8;
export function setOutsideWork(s,r,enabled){r.outsideJobEnabled=!!enabled;return true;}
export function outsideWorkText(r){const j=OUTSIDE_JOBS[r.id];return `${j.name}: ${j.hours} hours, R$${j.pay} gross per completed shift; R$${COMMUTE_FARE} return bus fare. Weekdays, one shift a day. Meals and toilet breaks provided at work. ${r.outsideWork?`${r.outsideWork.phase==='away'?'At work':'Commuting'}; finishes the current shift if disabled.`:r.outsideJobEnabled?'Will leave in the morning when rested and free.':'Optional; currently staying in the village.'}`;}
export function outsideWorkStep(s,r,dt,go,route){
 const j=OUTSIDE_JOBS[r.id];if(!j||s.mode==='sandbox')return false;
 const day=Math.floor((540+s.time*.45)/1440),hour=(9+s.time*.45/60)%24;
 if(!r.outsideWork){
  if(!r.outsideJobEnabled||day%7>=5||r.lastOutsideDay===day||hour<8||hour>=11||r.energy<65||r.cargo||r.needTask||r.tentPhase||r.sleepUntil||r.action==='town'||Object.values(r.needs).some(n=>n<35)||spendableMoney(s)<COMMUTE_FARE)return false;
  const exit={x:29,z:CELL_MIN+1};if(!route(s,r,exit)){r.outsideWorkBlocked='No walking route to the entrance';return false;}
  transact(s,-COMMUTE_FARE,'commuting',`${r.name}: return bus fare`);
  r.outsideWork={phase:'outbound',day,exit};r.lastOutsideDay=day;r.outsideWorkBlocked=null;
  r.job=null;r.operation=null;r.target=null;r.walk=[];
 }
 const work=r.outsideWork;
 if(work.phase==='outbound'){
  r.action='walk';if(!go(s,r,work.exit))return true;
  work.phase='away';work.until=s.time+(j.hours*60+tripEstimate(s.worldSettings?.town).minutes)/.45;
  r.action='outside';r.walk=[];r.target=null;
 }else if(work.phase==='away'){
  r.action='outside';r.energy=Math.max(25,r.energy-dt*.06);
  for(const k of ['hunger','bladder','bowels'])r.needs[k]=Math.max(55,r.needs[k]);
  if(s.time>=work.until){work.phase='inbound';r.action='walk';}
 }else{
  r.action='walk';if(!go(s,r,s.stock))return true;
  transact(s,j.pay,'outsideWork',`${r.name}: ${j.name}`);
  r.outsideWork=null;r.action='idle';
 }
 return true;
}
export function validOutsideWork(s){return s.people.every(r=>{
 if(r.outsideJobEnabled!==undefined&&typeof r.outsideJobEnabled!=='boolean')return false;
 if(r.lastOutsideDay!==undefined&&(!Number.isInteger(r.lastOutsideDay)||r.lastOutsideDay<0))return false;
 const w=r.outsideWork;if(!w)return true;if(activeTrips(s).some(t=>t.person===r.id))return false;
 return ['outbound','away','inbound'].includes(w.phase)&&Number.isInteger(w.day)&&w.day>=0&&w.day===r.lastOutsideDay&&w.exit?.x===29&&w.exit?.z===CELL_MIN+1&&(!['away','inbound'].includes(w.phase)||(Number.isFinite(w.until)&&w.until>=0&&w.until<=s.time+1200));
});}
