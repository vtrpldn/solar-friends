import {DAY} from './weather.js';
export const ANIMAL_RATIONS={coop:{days:3,fodder:1,water:2,work:25,product:'eggs',dailyOutput:2,batch:6,shelfDays:7},goat_pasture:{days:1,fodder:3,water:16,work:35,product:'milk',dailyOutput:4,batch:4,shelfDays:1}};
export function ensureAnimalCare(s,p,kind){
 const ration=ANIMAL_RATIONS[kind];if(!ration||p.key==='goat-pasture-empty'&&!p.stocked)return null;
 if(p.animalCare)return p.animalCare;
 const days=Math.max(0,Math.min(ration.days,((p.careUntil||0)-s.time)/DAY));
 const a=p.animalCare={version:1,feed:days*ration.fodder/ration.days,water:days*ration.water/ration.days,pending:0,lots:[],produced:0,spoiled:0,collected:0};
 // Convert only uncollected old batches. Cargo already returning remains owned by its job.
 for(const op of s.operations||[])if(!op.done&&op.site===p.id&&op.recipe===ration.product&&op.phase!=='return'){
  const progress=op.phase==='growing'?1-(op.growthRemaining||0)/(ration.days*DAY):op.ripeAt!==undefined?1:0;
  a.pending+=ration.batch*Math.max(0,Math.min(1,progress));a.produced=a.pending;
  if(op.phase==='growing')op.phase='process';
  delete op.growthRemaining;delete op.ripeAt;delete op.planted;
 }
 return a;
}
export function animalStep(s,p,kind,dt){
 const r=ANIMAL_RATIONS[kind],a=ensureAnimalCare(s,p,kind);if(!a)return;
 const days=dt/DAY,feedRate=r.fodder/r.days,waterRate=r.water/r.days;
 const fedDays=Math.min(days,a.feed/feedRate,a.water/waterRate),oldHealth=p.animalHealth??100;
 a.feed=Math.max(0,a.feed-days*feedRate);a.water=Math.max(0,a.water-days*waterRate);
 const healthy=Math.min(100,oldHealth+5*fedDays);
 p.animalHealth=Math.max(0,healthy-15*(days-fedDays));
 const generated=r.dailyOutput*fedDays*(oldHealth+healthy)/200;
 a.pending+=generated;a.produced+=generated;
 const good=a.lots.filter(l=>l.expires>s.time);a.spoiled+=a.lots.filter(l=>l.expires<=s.time).reduce((n,l)=>n+l.n,0);a.lots=good;
 const whole=Math.floor(a.pending+1e-9),room=Math.max(0,r.batch*2-a.lots.reduce((n,l)=>n+l.n,0));
 const stored=Math.min(whole,room);a.pending=Math.max(0,a.pending-whole);a.spoiled+=whole-stored;
 if(stored){const expires=s.time+r.shelfDays*DAY,last=a.lots.at(-1);if(last&&expires-last.expires<DAY/24)last.n+=stored;else a.lots.push({n:stored,expires});}
 p.careUntil=s.time+Math.min(a.feed/feedRate,a.water/waterRate)*DAY;
}
export function animalAvailable(p){return p.animalCare?.lots.reduce((n,l)=>n+l.n,0)||0;}
// Says whether an empty nest or udder is ordinary waiting or a missed ration.
export function animalWaitText(p,product){
 const a=p.animalCare,short=[a&&a.feed<=0&&'feed',a&&a.water<=0&&'drinking water'].filter(Boolean);
 return short.length?`No ${product} today: the animals are out of ${short.join(' and ')}`:`Fed and watered; the next ${product} are not ready to collect yet`;
}
export function collectAnimal(s,p,recipe,limit){
 const a=p.animalCare;if(!a)return null;let left=Math.min(limit,Math.floor(animalAvailable(p))),quantity=left,lots=[];
 for(const l of a.lots){const n=Math.min(left,l.n);if(n){lots.push({...l,n});l.n-=n;left-=n;}}
 a.lots=a.lots.filter(l=>l.n>0);a.collected+=quantity;return {output:{[recipe]:quantity},lots};
}
export function animalCareText(p){const a=p.animalCare;return a?`Health ${Math.round(p.animalHealth??100)}% · feed ${a.feed.toFixed(2)} kg · drinking water ${a.water.toFixed(1)} L · ${animalAvailable(p)} ready to collect. Health recovers gradually with daily care.`:'';}
export function validAnimalCare(s,defs){return s.projects.every(p=>{const a=p.animalCare,r=ANIMAL_RATIONS[defs?.[p.key]?.kind||p.key];return a===undefined||!!r&&a?.version===1&&['feed','water','pending','produced','spoiled','collected'].every(k=>Number.isFinite(a[k])&&a[k]>=0)&&a.feed<=r.fodder*2&&a.water<=r.water*2&&a.pending<=r.batch&&Array.isArray(a.lots)&&a.lots.length<=400&&a.lots.every(l=>Number.isInteger(l.n)&&l.n>0&&l.n<=r.batch*2&&Number.isFinite(l.expires)&&l.expires>=0&&l.expires<=s.time+r.shelfDays*DAY+1)&&animalAvailable(p)<=r.batch*2;});}
