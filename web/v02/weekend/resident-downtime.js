import {profileFor} from './resident-personality.js';
import {leisurePreference} from './resident-mind.js';
import {inviteConversation} from './resident-needs.js';

const ACTIVITIES = {
  'fire-circle': {kind:'fire', animation:'fire-sit', label:'Sitting by the fire', duration:32},
  'reading-room': {kind:'reading', animation:'read', label:'Reading a book', duration:48},
  'outdoor-classroom': {kind:'reading', animation:'read', label:'Reading in the shade', duration:42},
  'exercise-garden': {kind:'stretching', animation:'stretch', label:'Stretching in the exercise garden', duration:24},
  'volleyball-court': {kind:'stretching', animation:'stretch', label:'Warming up at the court', duration:24},
  'community-hall': {kind:'reading', animation:'read', label:'Reading in the community hall', duration:38},
  'shed': {kind:'stretching', animation:'stretch', label:'Stretching under cover', duration:24},
  'rain-shelter': {kind:'stretching', animation:'stretch', label:'Stretching under cover', duration:24},
};

export function clearDowntime(r) {
  r.downtime=null;
  r.idleGoal=null;
  r.idleUntil=0;
}

export function downtimeMotion(r) {
  if(r.action!=='relax' || !r.downtime?.arrived || r.walk.length)return null;
  const {kind,elapsed,animation}=r.downtime;
  if(kind==='breather')return elapsed<3?'yawn':'breathe';
  if(kind==='stretching' || kind==='walk')return elapsed<7?'neck-stretch':elapsed<14?'shoulder-roll':'stretch';
  if(kind==='fire' && elapsed>=10 && elapsed<22)return 'ground-relax';
  return animation;
}

export function downtimeLabel(r) {
  const activity=r.action==='relax' && r.downtime;
  return activity ? activity.arrived ? activity.label : activity.kind==='walk' ? 'Taking a walk around the village' : `On the way: ${activity.label.toLowerCase()}` : null;
}

export function downtimeInvalid(s,r,catalog) {
 const activity=r.downtime;if(!activity)return false;
 const site=activity.site==null?null:s.projects.find(p=>p.id===activity.site);
 return (activity.site!=null && (!site || site.work<catalog[site.key].work || s.infrastructure.nodes[site.id]?.enabled===false ||
   activity.sitePosition!==`${site.x},${site.z},${site.rotation||0}`)) ||
   (s.rain && !activity.sheltered) || s.time-activity.created>180;
}

// Downtime is a visit with a destination and a duration, not a standing animation
// selected by a repeating timer. Only time actually spent there restores fun.
export function idleActivity(s,r,i,dt,api) {
  let activity=r.downtime;
  if(activity) {
    if(downtimeInvalid(s,r,api.catalog)){clearDowntime(r);r.walk=[];r.target=null;activity=null;}
  }
  if(activity) {
    r.action='relax';
    if(!api.go(r,activity.target))return;
    // go() can report a nearby fallback for an unreachable goal. Never play a
    // destination-specific pose or grant recovery from that fallback.
    if(Math.hypot(r.x-activity.target.x,r.z-activity.target.z)>.15){clearDowntime(r);r.target=null;return;}
    activity.arrived=true;
    if(activity.kind==='walk' && activity.next){
      activity.target=activity.next;activity.next=null;activity.arrived=false;r.idleGoal=activity.target;r.target=null;
      api.go(r,activity.target);return;
    }
    activity.elapsed+=dt;
    if(activity.kind!=='walk')r.needs.fun=Math.min(100,r.needs.fun+dt*.18);
    if(activity.kind==='fire' && activity.elapsed>6 && r.needs.social<profileFor(r).temperament.acceptsAt &&
       s.time>=(activity.nextInvitation||0)) {
      activity.nextInvitation=s.time+12;
      const center=activity.facing;
      if(inviteConversation(s,r,i,api,{center,near:center,idleOnly:true}))return;
    }
    if(activity.elapsed<activity.duration)return;
    clearDowntime(r);r.target=null;
  }

  const profile=profileFor(r),cycle=r.idleCycle||0;
  r.idleCycle=cycle+1;r.lookAt=null;
  const hour=(9+s.time*.45/60)%24;
  const penalty=key=>{const index=(r.leisureRecent||[]).indexOf(key);return index<0?0:10-index*3;};
  const candidates=[];
  for(const site of s.projects) {
    const def=api.catalog[site.key],kind=def.kind,choice=ACTIVITIES[kind];
    if(!choice || site.work<def.work || s.infrastructure.nodes[site.id]?.enabled===false)continue;
    const sheltered=api.sheltered(kind);
    if(s.rain && !sheltered)continue;
    const key=`site:${site.id}`;
    const score=3+leisurePreference(r,kind)+(choice.kind==='fire'?(hour>=17||hour<7?4:-2):0)
      -(Math.hypot(site.x-r.x,site.z-r.z)/30)-penalty(key);
    candidates.push({...choice,key,site:site.id,sheltered,score,building:site});
  }
  if(r.energy<50 && !s.rain)candidates.push({kind:'breather',animation:'breathe',label:'Taking a breather',duration:12,key:'breather',score:7-penalty('breather')});
  if(!s.rain){
    if(hour>=6 && hour<19)candidates.push({kind:'reading',animation:'ground-read',label:'Reading outdoors',duration:42,key:'reading-outdoors',score:(profile.interests.includes('books')?5:1)-penalty('reading-outdoors')});
    candidates.push({kind:'stretching',animation:'stretch',label:'Taking a stretching break',duration:22,key:'stretching-outdoors',score:(profile.hobby==='Outdoor exercise'?5:2)-penalty('stretching-outdoors')});
    candidates.push({kind:'walk',animation:'stretch',label:'Stretching after a walk',duration:8,key:'walk',score:4-penalty('walk')});
  }
  for(const candidate of candidates.sort((a,b)=>b.score-a.score)){
    const target=candidate.building ? api.projectSpot(candidate.building,r) : api.groundSpot(r,api.camp(),i+cycle*2);
    if(!target)continue;
    // Reserve a real free spot, including people still on the way there.
    if(s.people.some(p=>p!==r && p.downtime && Math.hypot(p.downtime.target.x-target.x,p.downtime.target.z-target.z)<.8))continue;
    let next=null;
    if(candidate.kind==='walk'){
      const center=api.camp();
      next=api.groundSpot(r,{x:center.x+(cycle%2?4:-4),z:center.z+3},i+cycle);
      if(!next || Math.hypot(next.x-target.x,next.z-target.z)<2 || !api.route(target,next))continue;
    }
    const facing=candidate.kind==='fire'?api.center(candidate.building):null;
    const {building,score,...chosen}=candidate;
    r.downtime={...chosen,target,next,facing,sitePosition:building?`${building.x},${building.z},${building.rotation||0}`:null,created:s.time,elapsed:0,arrived:false};
    r.leisureRecent=[candidate.key,...(r.leisureRecent||[]).filter(key=>key!==candidate.key)].slice(0,3);
    r.idleGoal=target;r.action='relax';r.target=null;r.leisureKind=building?api.catalog[building.key].kind:null;
    api.go(r,target);return;
  }
  // A crowded or inaccessible village still permits a short, visible stretch.
  // Reconsider destinations afterward instead of standing indefinitely.
  r.downtime={kind:'stretching',animation:'stretch',label:'Stretching while waiting for a free spot',target:{x:r.x,z:r.z},created:s.time,elapsed:0,duration:12,arrived:true,sheltered:true};
  r.action='relax';
}
