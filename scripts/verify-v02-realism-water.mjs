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
s.infrastructure={nodes:{1:{id:1,kind:'rain-barrel',x:0,z:0,enabled:true,water:[0,0],capacity:[1,0]},2:{id:2,kind:'rain-barrel',x:0,z:0,enabled:true,water:[0,0],capacity:[1,0]}},account:{waterReceived:0}};s.projects=[{id:3,key:'home',x:1,z:1,work:1}];const areas=rainCatchments(s,{home:{kind:'home',work:1,size:[2,2]}});assert.equal([...areas.values()].reduce((a,b)=>a+b),18);captureRain(s,s.infrastructure.nodes[1],areas.get(1),DAY/24);assert.equal(s.infrastructure.nodes[1].water[0],1);assert(h.account.catchmentOverflow>0);
h.flowLitersPerDay=0;assert.equal(hydroFactor(s),0);
console.log('PASS nine year-long watershed balances, shared extraction, delayed recharge, roof ownership, overflow and reload');
{
 // "Dry" is a drought year and Caatinga land yields little of its rain:
 // a dry Caatinga village must not sit on a full aquifer and a strong river.
 const {weatherAt,HOUR}=await import('../web/v02/weekend/weather.js');
 const year=(biome,water,seed)=>{
  const s={time:0,landSeed:seed,worldSettings:{biome,water}},h=ensureHydrology(s);let rain=0,flow=0,level=0;
  for(let hour=0;hour<365*24;hour++){s.time+=DAY/24;weatherStep(s,DAY/24);hydrologyStep(s,DAY/24);rain+=s.weather.rainMmPerHour;flow+=h.flowLitersPerDay/8760;level+=h.groundwater/h.capacity/8760;}
  return {rain,flow,level};
 };
 const mean=(biome,water,key)=>[3,7,15,42,99,123].reduce((n,seed)=>n+year(biome,water,seed)[key]/6,0);
 assert(mean('caatinga','dry','rain')<mean('caatinga','seasonal','rain')*.75,'a dry year brings less rain');
 assert(mean('mata-atlantica','abundant','rain')>mean('mata-atlantica','seasonal','rain')*1.2,'a wet year brings more');
 assert(mean('caatinga','dry','flow')<mean('mata-atlantica','seasonal','flow')*.25,'a Caatinga river runs thin');
 assert(mean('caatinga','dry','level')<.8,'a dry Caatinga aquifer is not kept full');
 assert(mean('mata-atlantica','seasonal','level')>.9,'a Mata Atlântica aquifer stays well supplied');
 const start=ensureHydrology({time:0,landSeed:7,worldSettings:{biome:'caatinga',water:'dry'}});
 assert(start.groundwater<start.capacity*.5,'a dry Caatinga village starts with a low aquifer');
 assert.deepEqual(weatherAt({landSeed:7,worldSettings:{biome:'cerrado'}},HOUR*500),weatherAt({landSeed:7,worldSettings:{biome:'cerrado',water:'seasonal'}},HOUR*500),'an ordinary year keeps the station normals');
 console.log('PASS drought and wet years change rainfall; arid land yields thin rivers and slow recharge');
}
