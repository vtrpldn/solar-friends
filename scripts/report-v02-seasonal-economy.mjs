import fs from 'node:fs';
import assert from 'node:assert/strict';
import {BIOLOGY,GAME_DAY,beginBiology,biologicalStep,harvestOutput} from '../web/v02/weekend/biological-production.js';
import {PROCESSES,MATERIALS} from '../web/v02/weekend/simulation.js';
import {ANIMAL_CARE} from '../web/v02/weekend/asset-upkeep.js';
import {tripEstimate} from '../web/v02/weekend/economy-reference.js';
const rows=[];
for(const biome of ['mata-atlantica','cerrado','caatinga'])for(const recipe of Object.keys(BIOLOGY)){
 const site={id:1,soilMoisture:.75,soilFertility:1,animalHealth:100},op={site:1,recipe};
 const s={time:0,worldSettings:{biome},projects:[site],operations:[op],rain:false};
 assert(beginBiology(s,op,{}));let irrigation=0,steps=0;
 while(op.phase==='growing'&&steps++<40000){s.time+=GAME_DAY/4;biologicalStep(s,GAME_DAY/4,(_s,_id,n)=>{irrigation+=n;return true;});}
 assert.equal(op.phase,'process',`${biome}/${recipe} completes a full cycle`);
 const output=harvestOutput(s,op,PROCESSES[recipe]);
 const price=(id,n)=>n*MATERIALS[id].price/MATERIALS[id].quantity;
 const retailInputs=Object.entries(PROCESSES[recipe].input).reduce((n,[id,q])=>n+price(id,q),0);
 const care=ANIMAL_CARE[PROCESSES[recipe].kind];
 const feedCost=care?price('fodder',care.fodder)*s.time/GAME_DAY/care.days:0;
 const hypotheticalGross=Object.entries(output).reduce((n,[id,q])=>n+price(id,q)*.5,0);
 rows.push({biome,recipe,elapsedDays:s.time/GAME_DAY,irrigationLiters:+irrigation.toFixed(2),output,retailInputs,feedCost:+feedCost.toFixed(2),firstBandOutputValue:+hypotheticalGross.toFixed(2),marginBeforeLaborCapitalWaterWearSpoilageAndMarketConstraints:+(hypotheticalGross-retailInputs-feedCost-tripEstimate().cost).toFixed(2)});
}
const report={kind:'Diagnostic biological cycles and hypothetical single-trip unit economics; not a normal-game income playthrough',assumptions:['Healthy animals; irrigation supplied by fixture, not free in actual play','First-band buyer prices for all output; actual daily limits, batch sizes and spoilage can prevent this sale','No capital, unpaid resident labor, upkeep, crop water energy or established-orchard repeat-cycle profit included','First orchard cycle includes juvenile establishment; all six timber growth years actually advanced through seasonal model'],rows};
fs.writeFileSync('docs/balance/2026-11-17-seasonal-cycles.json',JSON.stringify(report,null,2)+'\n');
assert(rows.every(r=>r.elapsedDays>0));
console.log(`PASS ${rows.length} complete biological cycles across three biomes; explicitly conditional margins written`);
