import fs from 'node:fs';
import {PROCESSES,MATERIALS} from '../web/v02/weekend/simulation.js';
import {BIOLOGY} from '../web/v02/weekend/biological-production.js';
import {ANIMAL_CARE} from '../web/v02/weekend/asset-upkeep.js';
import {buyerQuote} from '../web/v02/weekend/local-market.js';
import {transportCost} from '../web/v02/weekend/physical-trade.js';
const value=items=>Object.entries(items).reduce((n,[id,q])=>n+q*MATERIALS[id].price/MATERIALS[id].quantity,0);
const round=n=>Math.round(n*100)/100;
const rows=['vegetables','greenhouse','bamboo','wood','honey','eggs','milk'].map(id=>{
 const r=PROCESSES[id],days=BIOLOGY[id].days,care=ANIMAL_CARE[r.kind],inputs={...r.input,...(id==='wood'?{tree_starts:2}:{})};
 if(care)inputs.fodder=(inputs.fodder||0)+care.fodder*days/care.days;
 const outputs=Object.entries(r.output).filter(([id])=>id!=='scraps');
 const gross=outputs.reduce((n,[id,q])=>n+q*buyerQuote(id,MATERIALS[id],0).cents/100/MATERIALS[id].quantity,0),cost=value(inputs);
 return {recipe:id,favorableGrowthDays:days,inputReplacementCost:round(cost),healthyOutput:r.output,proRataFirstBandGross:round(gross),contributionBeforeCapitalWaterUtilitiesFreightAndLabor:round(gross-cost),residentHoursBeforeHauling:round((r.work+(care?care.work*days/care.days:0))*.45/60),roundTripFuel:transportCost({worldSettings:{town:'normal'}}),notes:id==='wood'?'Renewable stand only; wild starting trees are finite.':id==='honey'?'Three kg output may need aggregation into the retail sale batch.':id==='eggs'||id==='milk'?'Recurring feed included; health and spoilage can reduce output.':'First planting may already be paid in the blueprint; recurring input shown.'};
});
fs.writeFileSync(process.argv[2]||'docs/balance/2026-11-17-income-opportunities.json',JSON.stringify({kind:'Analytical marginal comparison, not a playthrough or whole-village profit forecast',assumptions:'Healthy output, favorable growth, first buyer band pro-rated for comparison. Actual sales require whole batches, buyer capacity and physical trips. Shared logistics, household food, capital, electricity, water labor, depreciation and seasonal delays are not allocated; therefore these figures are not net profit. Ordinary command continuations separately measure whole-village cash.',rows},null,2));
console.log('Wrote seven comparable production opportunities with explicit exclusions');
