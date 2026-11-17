import assert from 'node:assert/strict';
import {weatherAt,weatherStep,forecast,DAY,HOUR,calendar,solarFactor} from '../web/v02/weekend/weather.js';
import {CLIMATE_PROFILES} from '../web/v02/weekend/climate-profiles.js';
for(const biome of Object.keys(CLIMATE_PROFILES)){
 const s={time:0,landSeed:42,worldSettings:{biome}},rain=Array(12).fill(0),wet=Array(12).fill(0),counts=Array(12).fill(0),temp=Array(12).fill(0);
 for(let d=0;d<365*1000;d++){let total=0;for(let h=0;h<24;h++){const time=(d*24+h-9+.5)*HOUR,w=weatherAt(s,time);total+=w.rainMmPerHour;temp[calendar(time).month]+=w.temperatureC/24;}const m=calendar((d*24-9+.5)*HOUR).month;rain[m]+=total;wet[m]+=total>=1?1:0;counts[m]++;}
 const p=CLIMATE_PROFILES[biome];for(let m=0;m<12;m++){assert(Math.abs(rain[m]/1000-p.rainMm[m])<Math.max(4,p.rainMm[m]*.25),`${biome} rainfall month ${m}`);assert(Math.abs(wet[m]/1000-p.rainDays[m])<2.5);assert(Math.abs(temp[m]/counts[m]-p.temperatureC[m])<.2);}
 weatherStep(s);const before=JSON.stringify(s);forecast(s);assert.equal(JSON.stringify(s),before);assert.deepEqual(weatherAt(s,DAY*500),weatherAt(JSON.parse(before),DAY*500));
}
assert(solarFactor({weather:{cloudCover:1}})<solarFactor({weather:{cloudCover:0}}));
console.log('PASS 1000-year monthly climate distributions, deterministic forecast and cloud attenuation');
