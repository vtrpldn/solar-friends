// check-tier: soak
import fs from 'node:fs';import assert from 'node:assert/strict';
import {restore,save,tick,enableFastNavigation} from '../web/v02/weekend/simulation.js';
const s=restore(fs.readFileSync('docs/balance/evidence/2026-11-17-starved-catalog-save.json','utf8'));assert(s);enableFastNavigation(s);
assert(s.money<10&&s.people.every(r=>r.needs.hunger===0),'recorded economic failure starts with starvation and little cash');
const start=s.money;for(let i=0;i<96000;i++){tick(s,.1);if((i+1)%32000===0)console.log(`Recovery day ${(i+1)/32000}: R$${s.money.toFixed(2)}, minimum hunger ${Math.min(...s.people.map(r=>r.needs.hunger)).toFixed(1)}`);}
assert(s.money>start+100,'existing outside jobs earn recovery income');assert(s.people.every(r=>r.needs.hunger>15&&r.energy>20),'every resident recovers without injected supplies');assert(restore(save(s)));
console.log('PASS recorded cash-poor, starving village recovers through movement, care, outside jobs and ordinary food purchasing');
