// Record actual cash movements; old saves start a ledger at their current balance.
export function ensureFinances(s) {
  return s.finances ??= {since:s.time || 0, opening:s.money, income:0, expenses:0, categories:{}, entries:[]};
}
export function recordMoney(s, amount, category, description) {
  if (!Number.isFinite(amount) || amount === 0 || s.mode === 'sandbox') return;
  const f=ensureFinances(s);
  if(amount>0)f.income+=amount;else f.expenses-=amount;
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
  return {...f,balance:s.money,net:f.income-f.expenses,gridRate:(s.infrastructure?.grid?.importing||0)*1.2};
}
