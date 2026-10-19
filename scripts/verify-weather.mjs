import {MAP_SIZE} from '../web/terrain.js';
import assert from 'node:assert/strict';
import { weatherConditions, weatherSites, drawGroundWeather, drawWeatherAir } from '../web/weather.js';
import { occupies } from '../web/building-footprints.js';
import { project } from '../web/projection.js';

const rain={raining:true,dry_day:false},clear={raining:false,dry_day:false},dry={raining:false,dry_day:true};
assert.equal(weatherConditions(clear,900).rain,0,'A forecast must not invent rain');
assert.equal(weatherConditions(dry,900).wet,0);
assert.equal(weatherConditions(rain,900).rain,1);
assert(weatherConditions(rain,840).rain<weatherConditions(rain,855).rain);
assert(weatherConditions(rain,1019).rain<weatherConditions(rain,990).rain);
assert.equal(weatherConditions(clear,810).wet,0);
assert.equal(weatherConditions(clear,1020).wet,1);
assert.equal(weatherConditions(clear,1080).wet,.5);
assert.equal(weatherConditions(clear,1140).wet,0);
assert.equal(weatherConditions(clear,0).wet,0);
assert.deepEqual(weatherConditions(rain,900),weatherConditions(rain,2340));
const seasonal={raining:true,dry_day:false,weather:{enabled:true,current:{rain:.8,wet:.7,clouds:.9},forecast:[{rain_start:720,rain_end:900}]}};
assert.equal(weatherConditions(seasonal,750).rain,.8,'Seasonal rain follows its actual intensity and earlier window');
assert.equal(weatherConditions({...seasonal,raining:false},750).rain,0,'Seasonal forecasts cannot invent actual rain');
assert.equal(weatherConditions(seasonal,750).clouds,.9);
assert.equal(weatherConditions(seasonal,750).wet,.7);
const buildings=[{kind:'home',x:10,y:13},{kind:'solar_farm',x:18,y:19},{kind:'garden',x:6,y:5}];
const points=weatherSites(buildings);
const density=(MAP_SIZE/28)**2;
assert(points.length>400*density&&points.length<480*density);
assert(points.some(p=>p.x>50)&&points.some(p=>p.y>50),'Weather covers the expanded property');
assert(points.every(p=>!buildings.some(b=>occupies(b,p.x,p.y))),'Pools and impacts must avoid foundations');
assert.deepEqual(weatherSites(buildings),points,'World sites must be deterministic');

let trace=[];
const ctx=new Proxy({}, {get:(_,key)=>{
  if(key==='createRadialGradient'||key==='createLinearGradient')return()=>({addColorStop(){}});
  return (...args)=>{trace.push([key,...args]);};
},set:()=>true});
for(const scale of [.18,.45,1,1.8]) {
  const view={conditions:weatherConditions(rain,900),buildings,project:(x,y)=>project(x,y,{x:800,y:20},scale),scale,width:1600,height:1000,time:2,reducedMotion:false};
  trace=[];const ground=drawGroundWeather(ctx,view),air=drawWeatherAir(ctx,view);
  assert(ground.puddles>0&&ground.splashes>0&&ground.ripples>0&&air.streaks>0);
  assert(trace.filter(t=>t[0]==='ellipse').every(t=>t.slice(1).every(Number.isFinite)));
  trace=[];drawWeatherAir(ctx,view);const original=JSON.stringify(trace);
  trace=[];drawWeatherAir(ctx,view);assert.equal(JSON.stringify(trace),original,'A paused scene must stay fixed');
  trace=[];drawWeatherAir(ctx,{...view,time:3});assert.notEqual(JSON.stringify(trace),original,'Running weather must animate');
  const calm={...view,reducedMotion:true};
  const stillGround=drawGroundWeather(ctx,calm),stillAir=drawWeatherAir(ctx,calm);
  assert(stillGround.puddles>0&&stillAir.clouds>0);
  assert.equal(stillGround.splashes+stillGround.ripples+stillAir.streaks,0,'Reduced motion keeps weather cues without particles');
  const dryGround=drawGroundWeather(ctx,{...view,conditions:weatherConditions(dry,900)});
  assert.equal(dryGround.puddles+dryGround.splashes+dryGround.ripples,0);
}
console.log('PASS: authoritative rain, storm buildup, two-hour drying, stable world positions, foundation exclusion, pause, animation and reduced motion at four zooms, including the property overview.');
