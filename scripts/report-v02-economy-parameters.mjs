import fs from 'node:fs';
import {MATERIALS,PROJECTS,PROCESSES} from '../web/v02/weekend/simulation.js';
import {physicalUnit,materialMeasure} from '../web/v02/weekend/material-measures.js';
import {BIOLOGY,CROP_CARE} from '../web/v02/weekend/biological-production.js';
import {ANIMAL_CARE} from '../web/v02/weekend/asset-upkeep.js';
import {ECONOMY_REFERENCE,STARTING_CAPITAL,STARTING_ENDOWMENT} from '../web/v02/weekend/economy-reference.js';
const referenced={wood:'Campinas 2026 procurement plan and treated-rafter retail volume comparison',tank:'Telhanorte 500 L retail listing',panels:'Minha Casa Solar 600 W retail listing',batteries:'Buyers Solar lithium battery retail listings'};
const report={date:'2026-11-17',reference:ECONOMY_REFERENCE,startingCapital:STARTING_CAPITAL,startingEndowment:STARTING_ENDOWMENT,sourceDetails:'economy-calibration.md',quantitiesAreNotCertifiedConstructionDesigns:true,
 materials:Object.fromEntries(Object.entries(MATERIALS).map(([id,m])=>[id,{name:m.name,canonicalUnit:physicalUnit(id).unit,canonicalPerSavedUnit:physicalUnit(id).factor,retailPackSavedUnits:m.quantity||null,retailPackPriceReais:m.price||0,...materialMeasure(id),priceBasis:referenced[id]||'Authored engineering/scenario estimate; no matching local quote verified',physicalBasis:'Engineering pack estimate; equipment specifications vary'}])),
 biology:{parameters:BIOLOGY,carePerGrowingArea:CROP_CARE,animalCare:ANIMAL_CARE,basis:'Mixed published cycle/yield references and engineering assumptions, documented in economy-biology.md; not species-specific yield forecasts'},
 recipes:Object.fromEntries(Object.entries(PROCESSES).map(([id,r])=>[id,{input:r.input,output:r.output,residentHours:r.work*.45/60,growthDays:BIOLOGY[id]?.days||0,basis:'Authored aggregate transformation; named mass losses tracked separately'}])),
 buildings:Object.fromEntries(Object.entries(PROJECTS).filter(([,d])=>!d.natural).map(([id,d])=>[id,{footprint:d.size,materials:d.materials,residentHours:d.work*.45/60,economicSpec:d.construction||null}]))};
fs.writeFileSync('docs/economy-parameter-register.json',JSON.stringify(report,null,2)+'\n');
console.log(`Recorded ${Object.keys(report.materials).length} materials, ${Object.keys(report.recipes).length} processes and ${Object.keys(report.buildings).length} buildings with explicit units and provenance categories`);
