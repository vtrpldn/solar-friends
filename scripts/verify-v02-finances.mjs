import assert from 'node:assert/strict';
import {ensureFinances,recordMoney,financeSummary,financeTime} from '../web/v02/weekend/finances.js';
const s={time:0,money:220,mode:'story',infrastructure:{grid:{importing:.5}}};
ensureFinances(s);
recordMoney(s,-40,'construction','Materials for garden');s.money-=40;
recordMoney(s,24,'sales','Sold surplus');s.money+=24;
for(let i=0;i<100;i++){recordMoney(s,-.01,'electricity','Grid electricity');s.money-=.01;s.time+=.1;}
const f=financeSummary(s);
assert.equal(f.opening,220);assert.equal(f.income,24);assert(Math.abs(f.expenses-41)<1e-8);
assert(Math.abs(f.opening+f.net-f.balance)<1e-8);assert.equal(f.entries.length,3);assert.equal(f.gridRate,.6);
assert.equal(financeTime(0),'Day 1 · 09:00');assert.equal(financeTime(2000),'Day 2 · 00:00');
assert.deepEqual(financeSummary(JSON.parse(JSON.stringify(s))),f);
const old={time:900,money:52};assert.equal(ensureFinances(old).opening,52);assert.equal(old.finances.entries.length,0);
for(let i=0;i<110;i++)recordMoney(s,1,'sales','Surplus');assert.equal(s.finances.entries.length,100);assert.equal(s.finances.income,134);
console.log('PASS finance reconciliation, bounded ledger, aggregated grid charges, save persistence and old-save baseline');
