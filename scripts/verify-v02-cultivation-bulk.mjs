import assert from 'node:assert/strict';
import {configureCultivation,queueCultivation} from '../web/v02/weekend/cultivation-overview.js';
import {ensureCultivation,finishFarmJob} from '../web/v02/weekend/cultivation.js';
const p={id:1,key:'field',fieldSize:[9,9],work:1};
const s={time:0,autoBuy:false,mode:'story',projects:[p],people:[],operations:[],materials:{beans_seed:3,greens_seed:0,compost:0}};
ensureCultivation(s,p);assert.equal(p.cultivation.beds.length,72);
assert.deepEqual(configureCultivation(s,p,{crop:'beans'}),{updated:72,skipped:0});
assert.equal(queueCultivation(s,p,'prepare').queued,72);
assert.equal(queueCultivation(s,p,'prepare').queued,0,'repeat clicks cannot duplicate work');
assert.equal(configureCultivation(s,p,{crop:'corn'}).updated,0,'queued work locks planting settings');
for(const o of s.operations){finishFarmJob(s,p,o);o.done=true;}
let result=queueCultivation(s,p,'plant');
assert.equal(result.queued,3);assert.equal(result.skipped,69);assert.equal(s.materials.beans_seed,0);assert.equal(result.errors.size,1,'shortages are reported once');
s.materials.beans_seed=69;result=queueCultivation(s,p,'plant');assert.equal(result.queued,69);assert.equal(s.materials.beans_seed,0);
for(const o of s.operations.filter(o=>!o.done)){finishFarmJob(s,p,o);o.done=true;}
assert.equal(configureCultivation(s,p,{crop:'corn'}).updated,0,'standing crops are protected');
assert.equal(configureCultivation(s,p,{irrigation:false}).updated,72,'care settings apply to standing crops');
p.cultivation.beds[0].stage='harvestable';p.cultivation.beds[0].ripeAt=0;
assert.equal(queueCultivation(s,p,'harvest').queued,1,'mixed stages only queue ripe crops');
assert.equal(configureCultivation(s,p,{residues:'collect'}).updated,71,'busy beds keep settings used by their jobs');
assert.equal(p.cultivation.beds[0].residues,'leave');
assert.equal(p.cultivation.beds[1].residues,'collect');
console.log('PASS 72-bed settings and work orders; duplicate prevention, partial seed supply, retry, standing crop protection and mixed-stage harvest');
