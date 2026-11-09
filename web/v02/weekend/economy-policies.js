// Shared by the simulation and the resource dialog; policies never create stock.
export const WORK_GROUPS={food:'Food & water',maintenance:'Sanitation & maintenance',production:'Production & harvesting',construction:'Construction'};
export function economyPolicies(s){
 s.economyPolicies??={sales:{},work:{food:3,maintenance:3,production:2,construction:2,essentialWorkers:1,productionWorkers:1}};
 return s.economyPolicies;
}
export function productionTarget(p){return Number.isFinite(p.stockTarget)?Math.max(0,Math.min(10000,Math.floor(p.stockTarget))):24;}
export function workGroup(op,recipes){return op.water?(op.water.service?'maintenance':'food'):(recipes[op.recipe]?.output.food||recipes[op.recipe]?.output.meals?'food':'production');}
export function protectedStock(s,id,recipes){
 const policy=economyPolicies(s).sales[id];let reserve=policy?.keep||0;
 if(id==='food'||id==='meals')reserve=Math.max(reserve,s.people.length*4);
 // Construction and queued inputs have already left available stock. Protect the
 // next two batches at repeating sites as well, without double-counting reservations.
 let inputs=0;
 for(const p of s.projects)if(p.repeat&&productionTarget(p)>0)inputs+=(recipes[p.repeat]?.input[id]||0)*2;
 return Math.max(reserve,inputs);
}
export function salePreview(s,id,materials,recipes,count){
 const item=materials[id],p=economyPolicies(s).sales[id],stock=count(s,id);
 if(!item?.quantity||!item.price||!p)return {quantity:0,revenue:0,reserve:0,reason:'No sale policy'};
 const reserve=protectedStock(s,id,recipes),day=Math.floor((540+s.time*.45)/1440);
 const sold=p.day===day?p.sold||0:0,limit=p.daily>0?Math.max(0,p.daily-sold):Infinity;
 const quantity=stock>Math.max(p.above,reserve)?Math.floor(Math.min(Math.max(0,stock-reserve),limit)/item.quantity)*item.quantity:0;
 return {quantity,revenue:quantity/item.quantity*Math.floor(item.price*.5),reserve,day,reason:quantity?'Ready to sell':stock<=Math.max(p.above,reserve)?'Reserve protected':'Daily limit or batch size'};
}
export function validatePolicies(s,materials){
 if(!s.projects.every(p=>p.stockTarget===undefined||(Number.isInteger(p.stockTarget)&&p.stockTarget>=0&&p.stockTarget<=10000)))return false;
 if(s.economyPolicies===undefined)return true;
 const p=s.economyPolicies;if(!p||!p.sales||!p.work||![...Object.keys(WORK_GROUPS),'essentialWorkers','productionWorkers'].every(k=>Number.isInteger(p.work[k])))return false;
 if(p.work.essentialWorkers+p.work.productionWorkers>s.people.length)return false;
 for(const [key,n]of Object.entries(p.work))if(![...Object.keys(WORK_GROUPS),'essentialWorkers','productionWorkers'].includes(key)||!Number.isInteger(n)||n<0||n>(key.endsWith('Workers')?s.people.length:3))return false;
 for(const [id,v]of Object.entries(p.sales))if(!materials[id]?.quantity||!v||typeof v.enabled!=='boolean'||!['keep','above','daily'].every(k=>Number.isInteger(v[k])&&v[k]>=0&&v[k]<=100000)||v.above<v.keep||['day','sold'].some(k=>v[k]!==undefined&&(!Number.isInteger(v[k])||v[k]<0)))return false;
 return s.projects.every(p=>p.stockTarget===undefined||(Number.isInteger(p.stockTarget)&&p.stockTarget>=0&&p.stockTarget<=10000));
}
