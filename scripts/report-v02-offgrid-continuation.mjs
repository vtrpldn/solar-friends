import fs from 'node:fs';import assert from 'node:assert/strict';
import {restore,save,tick,enableFastNavigation,PROJECTS} from '../web/v02/weekend/simulation.js';
const source=process.argv[2]||'docs/balance/evidence/2026-11-17-final-catalog-save.json',output=process.argv[3]||'docs/balance/2026-11-17-offgrid-continuation.json';
const s=restore(fs.readFileSync(source,'utf8'));assert(s);enableFastNavigation(s);
const keys=Object.keys(PROJECTS).filter(k=>!PROJECTS[k].natural);assert(keys.every(k=>s.projects.some(p=>p.key===k&&p.work>=PROJECTS[k].work)),'start from the actual completed catalog');
const opening={time:s.time,money:s.money,imported:s.infrastructure.grid.imported,electricity:s.finances.categories.electricity,water:s.infrastructure.account.waterReceived};
s.infrastructure.grid.enabled=false; // Same switch exposed in Power.
let outageSteps=0;
for(let i=0;i<3*32000;i++){tick(s,.1);if(Object.values(s.infrastructure.nodes).some(n=>n.enabled&&n.demand>0&&n.power<1))outageSteps++;}
const report={kind:'Three-day normal fixed-step continuation of actual paid catalog village; grid switch off, no resource injections',source,days:3,opening,closing:{time:s.time,money:s.money,imported:s.infrastructure.grid.imported,electricity:s.finances.categories.electricity,food:s.materials.food,meals:s.materials.meals,waterReceived:s.infrastructure.account.waterReceived},outageSteps,steps:3*32000,minimumClosingHunger:Math.min(...s.people.map(r=>r.needs.hunger)),restores:!!restore(save(s)),limitation:'Electrical independence for this layout and weather period, not year-round independence or economic self-sufficiency. Food, transport fuel and outside work remain external.'};
fs.writeFileSync(output,JSON.stringify(report,null,2));
assert.equal(report.closing.imported,opening.imported);assert.equal(report.closing.electricity,opening.electricity);assert.equal(outageSteps,0);assert(report.restores);assert(report.closing.food+report.closing.meals>0);assert(report.minimumClosingHunger>20);
console.log('PASS actual completed village operates three days without grid imports or powered-load outages, with food and valid save');
