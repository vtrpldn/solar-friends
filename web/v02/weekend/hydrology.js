import {DAY,rainfallRate,calendar} from './weather.js';
import {CLIMATE_PROFILES} from './climate-profiles.js';
import {waterFactor} from './world-settings.js';
// An off-map recharge catchment represents the watershed beyond the playable land.
// All coefficients below are disclosed game assumptions, not aquifer measurements.
export function ensureHydrology(s){
 if(s.hydrology)return s.hydrology;
 const f=waterFactor(s.worldSettings?.water),p=CLIMATE_PROFILES[s.worldSettings?.biome]||CLIMATE_PROFILES['mata-atlantica'];
 const season=p.rainMm[calendar(s.time).month]/Math.max(...p.rainMm),capacity=120000*f;
 const groundwater=capacity*(.35+.4*season),river=8000*f*(.15+.85*season);
 return s.hydrology={version:1,capacity,groundwater,river,runoff:0,flowLitersPerDay:river,account:{initial:groundwater+river,rain:0,upstream:0,recharged:0,baseflow:0,groundwaterExtracted:0,riverExtracted:0,outflow:0,catchmentRain:0,captured:0,catchmentOverflow:0}};
}
export function hydrologyStep(s,dt){
 const h=ensureHydrology(s),f=waterFactor(s.worldSettings?.water),p=CLIMATE_PROFILES[s.worldSettings?.biome]||CLIMATE_PROFILES['mata-atlantica'];
 const season=p.rainMm[calendar(s.time).month]/Math.max(...p.rainMm);
 for(let left=dt;left>1e-8;){const step=Math.min(left,DAY/24),days=step/DAY;left-=step;
  const rain=rainfallRate(s)*24*days*4000,upstream=8000*f*(.15+.85*season)*days;
  h.account.rain+=rain;h.account.upstream+=upstream;h.runoff+=rain;
  const released=h.runoff*(1-Math.exp(-days/2));h.runoff-=released;
  const recharge=Math.min(h.capacity-h.groundwater,released*.6);h.groundwater+=recharge;h.account.recharged+=recharge;
  const base=h.groundwater*(1-Math.exp(-days/180));h.groundwater-=base;h.account.baseflow+=base;
  h.river+=released-recharge+base+upstream;
  const out=h.river*(1-Math.exp(-days));h.river-=out;h.account.outflow+=out;
  h.flowLitersPerDay=days?out/days:h.flowLitersPerDay;
 }
}
export function extractWater(s,source,liters){
 const h=ensureHydrology(s),n=Math.max(0,Math.min(liters,h[source]));h[source]-=n;
 h.account[source==='river'?'riverExtracted':'groundwaterExtracted']+=n;return n;
}
export function hydroFactor(s){return Math.min(1,ensureHydrology(s).flowLitersPerDay/8000);}
export function rainCatchments(s,defs){
 const result=new Map(),nodes=Object.values(s.infrastructure.nodes).filter(n=>n.enabled&&['well','rain-barrel'].includes(n.kind)).sort((a,b)=>a.id-b.id),claimed=new Set();
 for(const n of nodes){let area=n.kind==='well'?16:1;
  const roof=s.projects.filter(p=>!claimed.has(p.id)&&p.work>=defs[p.key].work&&['home','shed','warehouse','kitchen','workshop'].includes(defs[p.key].kind)&&Math.hypot(p.x-n.x,p.z-n.z)<=6).sort((a,b)=>Math.hypot(a.x-n.x,a.z-n.z)-Math.hypot(b.x-n.x,b.z-n.z)||a.id-b.id)[0];
  if(roof){claimed.add(roof.id);const size=defs[roof.key].size||[2,2];area+=size[0]*size[1]*4;}
  result.set(n.id,area);
 }
 return result;
}
export function captureRain(s,n,area,dt){
 const h=ensureHydrology(s),rain=area*rainfallRate(s)*dt/DAY*24,amount=Math.min(n.capacity[1]-n.water[1],rain*.8),overflow=rain-amount;
 n.water[1]+=amount;h.runoff+=overflow;h.account.catchmentRain+=rain;h.account.captured+=amount;h.account.catchmentOverflow+=overflow;
 s.infrastructure.account.waterReceived+=amount;
}
export function hydrologyText(s){const h=ensureHydrology(s);return `Groundwater ${Math.round(h.groundwater).toLocaleString()} / ${Math.round(h.capacity).toLocaleString()} L · river reserve ${Math.round(h.river).toLocaleString()} L · flow ${Math.round(h.flowLitersPerDay).toLocaleString()} L/day. Wells share the aquifer; rainfall recharges it gradually.`;}
export function validHydrology(s){const h=s.hydrology;return h===undefined||h?.version===1&&['capacity','groundwater','river','runoff','flowLitersPerDay'].every(k=>Number.isFinite(h[k])&&h[k]>=0)&&h.capacity>0&&h.groundwater<=h.capacity+1e-6&&h.account&&['initial','rain','upstream','recharged','baseflow','groundwaterExtracted','riverExtracted','outflow','catchmentRain','captured','catchmentOverflow'].every(k=>Number.isFinite(h.account[k])&&h.account[k]>=0);}
