import assert from 'node:assert/strict';
import {ensureHydrology,hydrologyStep,extractWater,hydroFactor,rainCatchments,captureRain,validHydrology} from '../web/v02/weekend/hydrology.js';
import {weatherStep,DAY} from '../web/v02/weekend/weather.js';
for(const biome of ['mata-atlantica','cerrado','caatinga'])for(const water of ['dry','seasonal','abundant']){
 const s={time:0,landSeed:15,worldSettings:{biome,water}},h=ensureHydrology(s);
 for(let hour=0;hour<365*24;hour++){s.time+=DAY/24;weatherStep(s,DAY/24);hydrologyStep(s,DAY/24);extractWater(s,'groundwater',8);extractWater(s,'groundwater',8);extractWater(s,'river',100);assert(validHydrology(s));}
 const a=h.account;assert(Math.abs(h.groundwater+h.river+h.runoff-(a.initial+a.rain+a.upstream-a.groundwaterExtracted-a.riverExtracted-a.outflow))<1e-5);
 const clone=JSON.parse(JSON.stringify(s));hydrologyStep(s,1);hydrologyStep(clone,1);assert.deepEqual(s,clone);
}
const s={time:0,weather:{rainMmPerHour:0}},h=ensureHydrology(s);h.groundwater=10;assert.equal(extractWater(s,'groundwater',8),8);assert.equal(extractWater(s,'groundwater',8),2);assert.equal(extractWater(s,'groundwater',8),0);
s.weather.rainMmPerHour=10;hydrologyStep(s,1);assert(h.runoff>0&&h.groundwater<h.runoff,'delayed recharge');
s.infrastructure={nodes:{1:{id:1,kind:'rain-barrel',x:0,z:0,enabled:true,water:[0,0],capacity:[0,1]},2:{id:2,kind:'rain-barrel',x:0,z:0,enabled:true,water:[0,0],capacity:[0,1]}},account:{waterReceived:0}};s.projects=[{id:3,key:'home',x:1,z:1,work:1}];const areas=rainCatchments(s,{home:{kind:'home',work:1,size:[2,2]}});assert.equal([...areas.values()].reduce((a,b)=>a+b),18);captureRain(s,s.infrastructure.nodes[1],areas.get(1),DAY/24);assert.equal(s.infrastructure.nodes[1].water[1],1);assert(h.account.catchmentOverflow>0);
h.flowLitersPerDay=0;assert.equal(hydroFactor(s),0);
console.log('PASS nine year-long watershed balances, shared extraction, delayed recharge, roof ownership, overflow and reload');
