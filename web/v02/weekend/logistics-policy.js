import {cargoSize,TRADE_RULES,pendingExports} from './physical-trade.js';
import {uncollectedProjects} from './trip-state.js';
export function logisticsPolicy(s){return s.logisticsPolicy??={minimumLoad:0,maxWaitHours:2,urgent:false};}
export function dispatchReady(s){
 const policy=logisticsPolicy(s),items={};
 for(const p of uncollectedProjects(s))for(const [id,n]of Object.entries(p.pendingMaterials))items[id]=(items[id]||0)+n;
 for(const o of pendingExports(s))items[o.material]=(items[o.material]||0)+o.quantity;
 if(!Object.values(items).some(n=>n>0)){delete policy.waitingSince;policy.urgent=false;return false;}
 policy.waitingSince??=s.time;
 const load=cargoSize(items),limits=s.deliveryOnly?{cargoKg:5000,cargoM3:12}:TRADE_RULES;
 return policy.urgent||Math.max(load.kg/limits.cargoKg,load.m3/limits.cargoM3)>=policy.minimumLoad||s.time-policy.waitingSince>=policy.maxWaitHours*60/.45;
}
export function validLogisticsPolicy(s){const p=s.logisticsPolicy;return p===undefined||(p&&Number.isFinite(p.minimumLoad)&&p.minimumLoad>=0&&p.minimumLoad<=1&&Number.isFinite(p.maxWaitHours)&&p.maxWaitHours>=0&&p.maxWaitHours<=24&&typeof p.urgent==='boolean'&&(p.waitingSince===undefined||(Number.isFinite(p.waitingSince)&&p.waitingSince>=0&&p.waitingSince<=s.time)));}
