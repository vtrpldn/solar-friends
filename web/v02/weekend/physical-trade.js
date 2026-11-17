// Trade quantities remain the existing authored packs. Their cargo measurements
// are explicit approximations, not a silent conversion of existing save stock.
export const TRADE_RULES={version:1,cargoKg:350,cargoM3:1.2,batchesPerBuyerDay:8,dispatchAfter:40};
const weights={wood:[4,.012],logs:[20,.04],planks:[3,.01],bamboo:[3,.018],earth:[20,.015],stone:[20,.012],frames:[18,.12],walls:[20,.025],tiles:[12,.012],roofing:[8,.035],tank:[12,.35],batteries:[30,.05],panels:[20,.12],goats:[40,.4],hens:[2,.025],bees:[15,.08]};
export function cargoUnit(id){const [kg,m3]=weights[id]||(['food','meals','eggs','milk','honey','fodder','compost'].includes(id)?[1,.002]:[2,.01]);return {kg,m3};}
export function cargoSize(items){return Object.entries(items).reduce((a,[id,n])=>{const u=cargoUnit(id);a.kg+=n*u.kg;a.m3+=n*u.m3;return a;},{kg:0,m3:0});}
export function fitsCargo(items){const c=cargoSize(items);return c.kg<=TRADE_RULES.cargoKg+1e-8&&c.m3<=TRADE_RULES.cargoM3+1e-8;}
export function tradeDay(s){return Math.floor((540+s.time*.45)/1440);}
export function transportCost(s){return s.worldSettings?.town==='remote'?12:s.worldSettings?.town==='nearby'?4:6;}
export function ensureTrade(s){return s.trade??={version:1,nextId:1,orders:[],market:{},dispatchAt:0};}
export function pendingExports(s){return (s.trade?.orders||[]).filter(o=>o.status==='queued');}
export function tradeQuote(s,id,materials,count,protect=0){
 const item=materials[id],t=ensureTrade(s),day=tradeDay(s),market=t.market[id],sold=market?.day===day?market.units:0;
 if(!item?.quantity||!item.price)return {error:'This resource cannot be traded.'};
 if(count(s,id)-protect<item.quantity)return {error:'Not enough unreserved stock for a whole sale batch.'};
 if(sold+item.quantity>item.quantity*TRADE_RULES.batchesPerBuyerDay)return {error:'The local buyer has enough for today. Demand returns tomorrow.'};
 if(!fitsCargo({[id]:item.quantity}))return {error:'This batch needs a larger delivery vehicle.'};
 if(t.orders.filter(o=>o.status==='queued').length>=32)return {error:'The sale queue is full.'};
 return {quantity:item.quantity,cents:Math.floor(item.price*.5)*100,day,error:''};
}
export function reserveExport(s,id,materials,count,change,protect=0){
 const quote=tradeQuote(s,id,materials,count,protect);if(quote.error)return false;
 const t=ensureTrade(s);change(s,id,-quote.quantity);
 if(t.market[id]?.day!==quote.day)t.market[id]={day:quote.day,units:0};
 t.market[id].units+=quote.quantity;
 t.orders.push({id:t.nextId++,material:id,quantity:quote.quantity,cents:quote.cents,status:'queued',created:s.time,marketDay:quote.day});
 const active=t.orders.filter(o=>['queued','loaded'].includes(o.status));
 t.orders=[...t.orders.filter(o=>['sold','cancelled'].includes(o.status)).slice(-(100-active.length)),...active];
 if(!t.dispatchAt)t.dispatchAt=s.time+TRADE_RULES.dispatchAfter;
 return true;
}
export function cancelExport(s,id,change){
 const t=ensureTrade(s),o=t.orders.find(o=>o.id===id&&o.status==='queued');if(!o)return false;
 change(s,o.material,o.quantity);o.status='cancelled';
 const m=t.market[o.material];if(m?.day===o.marketDay)m.units=Math.max(0,m.units-o.quantity);
 return true;
}
export function loadExports(s,trip,base={}){
 const t=ensureTrade(s),cargo={...base};trip.exports??=[];
 for(const o of pendingExports(s)){
  const next={...cargo,[o.material]:(cargo[o.material]||0)+o.quantity};if(!fitsCargo(next))continue;
  Object.assign(cargo,next);o.status='loaded';trip.exports.push(o.id);
 }
 if(!pendingExports(s).length)t.dispatchAt=0;
 return cargo;
}
export function settleExports(s,trip,transact){
 if(trip.tradeSettled)return;
 for(const id of trip.exports||[]){const o=s.trade?.orders.find(o=>o.id===id);if(o?.status!=='loaded')continue;transact(s,o.cents/100,'sales',`Sold ${o.quantity} ${o.material} in town`);o.status='sold';o.settled=s.time;}
 trip.tradeSettled=true;
}
export function validTrade(s,materials){
 const t=s.trade;if(t===undefined)return true;
 if(!t||t.version!==1||!Number.isInteger(t.nextId)||t.nextId<1||!Array.isArray(t.orders)||t.orders.length>100||!t.market||!Number.isFinite(t.dispatchAt)||t.dispatchAt<0)return false;
 const ids=new Set();for(const o of t.orders){if(!o||!Number.isInteger(o.id)||o.id<1||o.id>=t.nextId||ids.has(o.id)||!materials[o.material]?.quantity||o.quantity!==materials[o.material].quantity||!Number.isSafeInteger(o.cents)||o.cents<0||!['queued','loaded','sold','cancelled'].includes(o.status)||!Number.isFinite(o.created)||o.created<0||!Number.isInteger(o.marketDay)||o.marketDay<0)return false;ids.add(o.id);}
 for(const [id,m]of Object.entries(t.market))if(!materials[id]?.quantity||!m||!Number.isInteger(m.day)||m.day<0||!Number.isInteger(m.units)||m.units<0)return false;
 if(s.trip?.shipments!==undefined){
 const list=s.trip.shipments;if(!Array.isArray(list)||list.length>512)return false;
 const cargo={},seen=new Set();for(const part of list){const p=s.projects.find(p=>p.id===part.project);if(!p?.pendingMaterials||seen.has(part.project)||!part.items||!Object.keys(part.items).length)return false;seen.add(part.project);
 for(const [id,n]of Object.entries(part.items)){if(!materials[id]||!Number.isFinite(n)||n<=0||n>(p.pendingMaterials[id]||0))return false;cargo[id]=(cargo[id]||0)+n;}}
 if(!fitsCargo(cargo))return false;
 }
 const exports=s.trip?.exports||[];if(!Array.isArray(exports)||new Set(exports).size!==exports.length)return false;
 if(exports.some(id=>!t.orders.some(o=>o.id===id&&['loaded','sold'].includes(o.status))))return false;
 if(t.orders.some(o=>o.status==='loaded'&&!exports.includes(o.id)))return false;
 const outbound={};for(const id of exports){const o=t.orders.find(o=>o.id===id);outbound[o.material]=(outbound[o.material]||0)+o.quantity;}
 if(!fitsCargo(outbound))return false;
 if(s.trip?.tradeSettled&&exports.some(id=>t.orders.find(o=>o.id===id).status!=='sold'))return false;
 if(s.trip?.saleOnly!==undefined&&typeof s.trip.saleOnly!=='boolean')return false;
 if(s.trip?.tradeSettled!==undefined&&typeof s.trip.tradeSettled!=='boolean')return false;
 return true;
}

export function blueprintManifest(projects){
 const cargo={},shipments=[];
 for(const p of projects){const items={};for(const [id,amount]of Object.entries(p.pendingMaterials||{})){
   const u=cargoUnit(id),used=cargoSize(cargo);
   const take=Math.min(amount,Math.floor(Math.min((TRADE_RULES.cargoKg-used.kg)/u.kg,(TRADE_RULES.cargoM3-used.m3)/u.m3)+1e-8));
   if(take>0){items[id]=take;cargo[id]=(cargo[id]||0)+take;}
 }if(Object.keys(items).length)shipments.push({project:p.id,items});}
 return shipments;
}
export function receiveBlueprintShipment(s,trip){
 for(const shipment of trip.shipments||[]){const p=s.projects.find(p=>p.id===shipment.project);if(!p?.pendingMaterials)continue;
 for(const [id,n]of Object.entries(shipment.items)){p.pendingMaterials[id]-=n;if(p.pendingMaterials[id]<=0)delete p.pendingMaterials[id];}
 if(!Object.keys(p.pendingMaterials).length)delete p.pendingMaterials;
 }
}
