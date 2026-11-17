import fs from 'node:fs';import assert from 'node:assert/strict';
import {restore,save,tick,enableFastNavigation} from '../web/v02/weekend/simulation.js';
const s=restore(fs.readFileSync('docs/balance/evidence/2026-11-17-hauling-rest-deadlock-save.json','utf8'));assert(s);enableFastNavigation(s);
const trapped=s.people.filter(r=>r.energy<5&&r.needs.bladder<5).map(r=>r.id);assert(trapped.length>=3);
const recovered=new Set();
for(let i=0;i<5*32000;i++){tick(s,.1);for(const r of s.people)if(trapped.includes(r.id)&&r.energy>35&&r.needs.hunger>20&&r.needs.bladder>20&&r.needs.bowels>20)recovered.add(r.id);}
assert.deepEqual([...recovered].sort(),trapped.sort(),'every trapped resident must eat, toilet and recover through actual actions');assert(restore(save(s)));
console.log('PASS actual catalog save recovers empty-handed haulers from urgent-needs/rest loop without injected supplies or cash');
