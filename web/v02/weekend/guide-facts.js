import { brl } from "./money.js";
import {CROPS} from './cultivation.js';
import {PROCESSES} from './catalog-rules.js';
import {FOOD_DAYS} from './food-storage.js';
import {GRID_POWER} from './infrastructure.js';
// Read the same definitions as the simulation. Do not copy coefficients here.
export function guideFacts(kind,{crops=CROPS,recipes=PROCESSES,foodDays=FOOD_DAYS,grid=GRID_POWER}={}) {
 if(kind==='crops')return Object.values(crops).map(c=>`${c.name}: ${c.days} favorable growth days`);
 if(kind==='food')return Object.entries(crops).map(([id,c])=>`${c.name}: ${foodDays[id]} days before ordinary spoilage`);
 if(kind==='grid')return [`Grid backup: up to ${grid.capacity} kW · ${brl(grid.tariff)}/kWh`];
 if(kind==='compost')return [`Composting: ${recipes.compost.input.scraps} kg residues → ${recipes.compost.output.compost} kg mature compost`];
 return [];
}
