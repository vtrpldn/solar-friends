import assert from 'node:assert/strict';
import {ensureCultivation,cultivationStep,finishFarmJob,farmJobError} from '../web/v02/weekend/cultivation.js';
import {DAY} from '../web/v02/weekend/weather.js';
const make=()=>{const s={time:0,mode:'story',projects:[{id:1,key:'garden',work:1}],operations:[],weather:{rainMmPerHour:0}};const b=ensureCultivation(s,s.projects[0]).beds[0];Object.assign(b,{stage:'growing',growth:.5,moisture:0,irrigation:false,standingBiomassKg:4});return [s,b];};
const step=(s,n,water=()=>false)=>{for(let d=0;d<n;d++){s.time+=DAY;cultivationStep(s,DAY,water,{garden:{work:1}});}};
let [s,b]=make();step(s,365);assert.equal(b.stage,'failed');assert.equal(b.droughtDamage,1);assert.equal(farmJobError(s,s.projects[0],b,'clear'),'');finishFarmJob(s,s.projects[0],{farm:{bed:0,action:'clear'}});assert.equal(b.stage,'harvested');assert.equal(b.fieldLossKg+b.residueKg,4);
[s,b]=make();step(s,2);const damage=b.droughtDamage;assert(damage>0);b.moisture=1;b.irrigation=true;step(s,1,()=>true);assert.equal(b.droughtDamage,damage);assert.notEqual(b.stage,'failed');
[s,b]=make();Object.assign(b,{stage:'harvestable',growth:1,ripeAt:0,irrigation:true});let calls=0;step(s,1,()=>{calls++;return true;});assert(calls>0);assert.equal(b.droughtDamage,0);
[s,b]=make();s.weather.rainMmPerHour=1;step(s,1);assert(Math.abs(b.rainLiters-b.w*b.d*24)<1e-8);
console.log('PASS drought failure, irreversible damage, rescue, ripe irrigation, physical rainfall and cleared biomass');
// Current yield and expiry must agree with actual settlement, including late harvest.
const {harvestYield,harvestExpired}=await import('../web/v02/weekend/cultivation.js');
for(const [days,expected]of [[0,9],[4,9],[6,4],[8,0],[11,0]]){
 [s,b]=make();Object.assign(b,{stage:'harvestable',growth:1,ripeAt:0,moisture:1,standingBiomassKg:11.08});s.time=days*DAY;
 assert.equal(harvestYield(b,s.time),expected);assert.equal(harvestExpired(b,s.time),days>=8);
 const op={farm:{bed:0,action:'harvest'}};finishFarmJob(s,s.projects[0],op);assert.equal(op.harvestOutput.greens||0,expected);
 assert(Math.abs(b.exportedKg+b.fieldLossKg+b.residueKg-11.08)<1e-9);
}
[s,b]=make();Object.assign(b,{stage:'harvestable',growth:1,ripeAt:0,irrigation:true});s.time=8*DAY;
assert.match(farmJobError(s,s.projects[0],b,'harvest'),/expired/);assert.equal(farmJobError(s,s.projects[0],b,'clear'),'');calls=0;step(s,1,()=>{calls++;return true;});assert.equal(calls,0,'expired harvest stops automatic irrigation');
console.log('PASS late-harvest estimate agrees with settlement, expiry directs clearing and stops irrigation');
