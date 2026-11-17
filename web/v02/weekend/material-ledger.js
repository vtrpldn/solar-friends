// Available-store accounting. Reserved/installed/cargo locations are separately
// derived from their authoritative project and order records.
export function storedSnapshot(s){return {...s.materials,wood:s.wood||0};}
export function materialLedger(s){return s.materialLedger??={version:1,since:s.time||0,opening:storedSnapshot(s),net:{},entries:[],daily:[]};}
export function recordMaterial(s,id,quantity,reason='transfer'){
 if(!quantity||s.mode==='sandbox')return;
 const ledger=materialLedger(s),day=Math.floor((540+(s.time||0)*.45)/1440);
 ledger.net[id]=(ledger.net[id]||0)+quantity;
 let daily=ledger.daily.find(d=>d.day===day);if(!daily){daily={day,changes:{}};ledger.daily.push(daily);ledger.daily=ledger.daily.filter(d=>d.day>=day-90);}
 daily.changes[id]=(daily.changes[id]||0)+quantity;
 const last=ledger.entries.at(-1),hour=Math.floor((s.time||0)*.45/60);
 if(last?.id===id&&last.reason===reason&&Math.floor(last.time*.45/60)===hour)last.quantity+=quantity;
 else ledger.entries.push({time:s.time||0,id,quantity,reason});
 ledger.entries=ledger.entries.slice(-160);
}
export function materialReconciliation(s){
 const ledger=materialLedger(s),stock=storedSnapshot(s);
 return Object.fromEntries(Object.entries(stock).map(([id,n])=>[id,n-(ledger.opening[id]||0)-(ledger.net[id]||0)]).filter(([,n])=>Math.abs(n)>1e-6));
}
export function validMaterialLedger(s,materials){
 const l=s.materialLedger;if(l===undefined)return true;
 const amounts=a=>a&&typeof a==='object'&&!Array.isArray(a)&&Object.entries(a).every(([id,n])=>materials[id]&&Number.isFinite(n));
 return l.version===1&&Number.isFinite(l.since)&&l.since>=0&&l.since<=s.time&&amounts(l.opening)&&Object.values(l.opening).every(n=>n>=0)&&amounts(l.net)&&Array.isArray(l.entries)&&l.entries.length<=160&&l.entries.every(e=>materials[e.id]&&Number.isFinite(e.quantity)&&Number.isFinite(e.time)&&e.time>=l.since&&e.time<=s.time&&typeof e.reason==='string'&&e.reason.length<=100)&&Array.isArray(l.daily)&&l.daily.length<=91&&new Set(l.daily.map(d=>d.day)).size===l.daily.length&&l.daily.every(d=>Number.isInteger(d.day)&&d.day>=0&&amounts(d.changes));
}
