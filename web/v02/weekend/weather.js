import {CLIMATE_PROFILES} from './climate-profiles.js';
import {waterFactor} from './world-settings.js';
export const DAY=3200, HOUR=DAY/24;
const MONTH_DAYS=[31,28,31,30,31,30,31,31,30,31,30,31];
export function calendar(time){
 const absoluteDay=Math.floor((time+DAY*9/24)/DAY),yearDay=((304+absoluteDay)%365+365)%365;
 let month=0,day=yearDay;while(day>=MONTH_DAYS[month])day-=MONTH_DAYS[month++];
 return {absoluteDay,month,day,hour:((time/HOUR+9)%24+24)%24};
}
function random(seed,index,salt){let x=(seed|0)^Math.imul(index|0,0x45d9f3b)^salt;x=Math.imul(x^(x>>>16),0x45d9f3b);x=Math.imul(x^(x>>>16),0x45d9f3b);return ((x^(x>>>16))>>>0)/4294967296;}
export function weatherAt(s,time=s.time){
 const c=calendar(time),p=CLIMATE_PROFILES[s.worldSettings?.biome]||CLIMATE_PROFILES['mata-atlantica'];
 const seed=s.landSeed||0,monthDays=MONTH_DAYS[c.month];
 // The station normals describe an ordinary year. The world's water setting
 // makes it a drought year or a wet one by changing how often it rains.
 const year=waterFactor(s.worldSettings?.water);
 // Three-day shared draws create persistence without mutable RNG or forecast side effects.
 const wet=random(seed,Math.floor(c.absoluteDay/3),17)<Math.min(1,p.rainDays[c.month]/monthDays*year);
 const start=Math.floor(random(seed,c.absoluteDay,29)*19),hour=Math.floor(c.hour);
 const amount=p.rainDays[c.month]?p.rainMm[c.month]/p.rainDays[c.month]*(.5+random(seed,c.absoluteDay,47)):0;
 // Rounded zero rainy-day normals can still contain sub-1mm daily drizzle.
 const rainMmPerHour=p.rainDays[c.month]?(wet&&hour>=start&&hour<start+6?amount/6:0):p.rainMm[c.month]/monthDays/24*year;
 const cloudCover=rainMmPerHour>.05?.85:wet?.65:.15+.3*random(seed,Math.floor(c.absoluteDay/3),61);
 const temperatureC=p.temperatureC[c.month]+4*Math.sin((c.hour-9)*Math.PI/12)+(random(seed,c.absoluteDay,71)-.5)*4;
 return {version:1,hour:Math.floor(time/HOUR+9),rainMmPerHour,cloudCover,temperatureC};
}
export function weatherStep(s,dt=0){s.weather=weatherAt(s,Math.max(0,s.time-dt/2));s.rain=s.weather.rainMmPerHour>.05;s.rainResolved=true;if(s.rain)s.rainSeen=true;}
export const rainfallRate=s=>s.weather?.rainMmPerHour??(s.rain?.25:0);
export const solarFactor=s=>1-.75*(s.weather?.cloudCover??0);
export function forecast(s){
 const start=Math.floor(s.time/HOUR+9)/24|0;
 return Array.from({length:3},(_,i)=>{let rain=0,lo=Infinity,hi=-Infinity;for(let h=0;h<24;h++){const w=weatherAt(s,((start+i)*24+h-9+.5)*HOUR);rain+=w.rainMmPerHour;lo=Math.min(lo,w.temperatureC);hi=Math.max(hi,w.temperatureC);}return {day:start+i+1,rain:rain<1?'Dry / trace rain':rain<10?'Light rain':'Rainy',temperature:`${Math.floor(lo/5)*5}–${Math.ceil(hi/5)*5} °C`};});
}
export function weatherText(s){const w=s.weather||weatherAt(s);return `${s.rain?'Rain':w.cloudCover>.5?'Cloudy':'Fair'} · ${Math.round(w.temperatureC)} °C`;}
export function validWeather(s){const w=s.weather;return w===undefined||w?.version===1&&Number.isInteger(w.hour)&&['rainMmPerHour','cloudCover','temperatureC'].every(k=>Number.isFinite(w[k]))&&w.rainMmPerHour>=0&&w.rainMmPerHour<=200&&w.cloudCover>=0&&w.cloudCover<=1&&w.temperatureC>=-50&&w.temperatureC<=60;}
