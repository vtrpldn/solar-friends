import {DAY} from './weather.js';
export function hydrationDemand(s,r){
 const working=['build','produce','install','carry','collect','service'].includes(r.action);
 const heat=Math.max(0,Math.min(.5,((s.weather?.temperatureC??25)-25)/20));
 return 2.5*Math.min(2,1+(working?.5:0)+heat);
}
export function drinkWater(s,nodeId,liters){
 const node=s.infrastructure?.nodes[nodeId];if(!node?.enabled||node.water[0]+1e-8<liters)return false;
 node.water[0]=Math.max(0,node.water[0]-liters);s.infrastructure.account.waterUsed+=liters;return true;
}
export function hydrationStep(s,r,dt){
 r.needs.hydration??=100;
 if(s.mode==='sandbox'){r.needs.hydration=100;return;}
 r.needs.hydration=Math.max(0,r.needs.hydration-hydrationDemand(s,r)*40*dt/DAY);
 if(r.needs.hydration<=70&&(r.drinkingWater||0)>0){
  const n=Math.min(.5,r.drinkingWater,(100-r.needs.hydration)/40);r.drinkingWater=Math.max(0,r.drinkingWater-n);r.needs.hydration+=n*40;s.infrastructure.account.waterUsed+=n;
 }
}
export function packDrinkingWater(s,r,liters,source=s.infrastructure.nodes[0]){
 const n=Math.max(0,liters-(r.drinkingWater||0)),camp=source;
 if(camp.water[0]+1e-8<n)return false;
 camp.water[0]=Math.max(0,camp.water[0]-n);r.drinkingWater=(r.drinkingWater||0)+n;return true;
}
export function hydrationWorkFactor(r){return .5+.5*Math.min(1,(r.needs?.hydration??100)/30);}
export function hydrationWarning(s){return s.people.filter(r=>r.outsideWork?.phase!=='away'&&(r.needs?.hydration??100)<30).map(r=>`${r.name}: ${r.needBlocked||'needs drinking water'}`).join('; ');}
