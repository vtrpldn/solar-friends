import {quantityText} from './material-measures.js';
import {buyerFor,supplierFor} from './local-market.js';
// Public daily supplier allocations. Paid orders own their goods even when
// collection takes several days; pickup never reserves them a second time.
export function supplierLimit(id,item){const type=buyerFor(id).id;return item.quantity*(type==='equipment'?(['panels','batteries'].includes(id)?4:16):type==='livestock'?8:type==='produce'||type==='meals'?16:128);}
export function supplierAvailable(s,id,materials){const day=Math.floor((540+s.time*.45)/1440),entry=s.suppliers?.[id];return Math.max(0,supplierLimit(id,materials[id])-(entry?.day===day?entry.units:0));}
export function supplierError(s,items,materials){if(s.mode==='sandbox')return '';for(const [id,n]of Object.entries(items)){const left=supplierAvailable(s,id,materials);if(n>left)return `${supplierFor(id)} has ${quantityText(id,left)} ${materials[id].name} left for today. Stock renews tomorrow; already paid orders are unaffected.`;}return '';}
export function reserveSupplier(s,items,materials){if(supplierError(s,items,materials))return false;if(s.mode==='sandbox')return true;const day=Math.floor((540+s.time*.45)/1440);s.suppliers??={};for(const [id,n]of Object.entries(items))if(n){if(s.suppliers[id]?.day!==day)s.suppliers[id]={day,units:0};s.suppliers[id].units+=n;}return true;}
export function validSuppliers(s,materials){return s.suppliers===undefined||(s.suppliers&&typeof s.suppliers==='object'&&!Array.isArray(s.suppliers)&&Object.entries(s.suppliers).every(([id,v])=>materials[id]&&v&&Number.isInteger(v.day)&&v.day>=0&&Number.isInteger(v.units)&&v.units>=0&&v.units<=100000));}
export function purchaseCategory(id){return ['food','meals','eggs','milk','honey'].includes(id)?'household':'purchases';}
