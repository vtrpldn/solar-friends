import {GRID_TARIFF} from "./economy-reference.js";
import {collectionBudget,spendableMoney} from './procurement-budget.js';
// Record actual cash movements; old saves start a ledger at their current balance.
export function ensureFinances(s) {
  return s.finances ??= {since:s.time || 0, opening:s.money, income:0, expenses:0, categories:{}, entries:[]};
}
export function recordMoney(s, amount, category, description) {
  if (!Number.isFinite(amount) || amount === 0 || s.mode === 'sandbox') return;
  const f=ensureFinances(s);
  f.incomeCents??=Math.round(f.income*100);f.expenseCents??=Math.round(f.expenses*100);
  if(amount>0)f.incomeCents+=Math.round(amount*100);else f.expenseCents-=Math.round(amount*100);
  f.income=f.incomeCents/100;f.expenses=f.expenseCents/100;
  f.categories[category]=(f.categories[category]||0)+amount;
  const hour=Math.floor((s.time||0)*.45/60);
  const previous=f.entries[0];
  if(category==='electricity' && previous?.category===category && previous.hour===hour)previous.amount+=amount;
  else f.entries.unshift({time:s.time||0,hour,amount,category,description});
  f.entries.length=Math.min(f.entries.length,100);
}
export function financeTime(time) {
  const minutes=Math.floor(9*60+time*.45);
  return `Day ${Math.floor(minutes/1440)+1} · ${String(Math.floor(minutes/60)%24).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
}
export function financeSummary(s) {
  const f=ensureFinances(s);
  return {...f,balance:s.money,committed:collectionBudget(s).cost,available:spendableMoney(s),net:f.income-f.expenses,gridRate:(s.infrastructure?.grid?.importing||0)*GRID_TARIFF};
}

// Whole centavos are posted; sub-cent utility consumption accumulates rather
// than being rounded away on every small simulation step.
export function transact(s,amount,category,description){
 if(!Number.isFinite(amount)||s.mode==='sandbox')return 0;
 const f=ensureFinances(s);f.fractions??={};
 const raw=amount*100+(f.fractions[category]||0);
 const cents=Math.trunc(raw+(raw<0?-1:1)*1e-8);
 const opening=Math.round(s.money*100);
 if(opening+cents<0)return 0;
 if(cents<0&&!['construction','transport'].includes(category)&&-cents>Math.round(spendableMoney(s)*100))return 0;
 f.fractions[category]=raw-cents;
 recordMoney(s,cents/100,category,description);
 s.money=(opening+cents)/100;
 return cents/100;
}

export function validFinances(s){
 const f=s.finances;if(f===undefined)return true;
 if(!f||!['since','opening','income','expenses'].every(k=>Number.isFinite(f[k])&&f[k]>=0)||!f.categories||!Array.isArray(f.entries)||f.entries.length>100)return false;
 if(f.fractions && Object.values(f.fractions).some(n=>!Number.isFinite(n)||Math.abs(n)>1.000001))return false;
 if(['incomeCents','expenseCents'].some(k=>f[k]!==undefined&&(!Number.isSafeInteger(f[k])||f[k]<0)))return false;
 return f.entries.every(e=>e&&Number.isFinite(e.time)&&Number.isFinite(e.amount)&&typeof e.category==='string'&&typeof e.description==='string');
}
