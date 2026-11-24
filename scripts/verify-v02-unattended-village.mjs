// check-tier: soak
import assert from 'node:assert/strict';
import {createWeekend, chooseCamp, enableFastNavigation, planField, tick, save, restore} from '../web/v02/weekend/simulation.js';
import {setOutsideWork} from '../web/v02/weekend/outside-work.js';
import {DAY} from '../web/v02/weekend/weather.js';

const village = createWeekend();
chooseCamp(village, 'clearing');
enableFastNavigation(village);
assert.equal(planField(village, 35, 24, [2, 2]), '');
for (const resident of village.people.slice(0, 3)) setOutsideWork(village, resident, true);
village.autoBuy = true;
village.foodPurchaseBudget = 150;
const startingCash = village.money;
let hungryHours = 0;
let thirstyHours = 0;
for (let day = 0; day < 14; day++) {
  let sampledHour = -1;
  for (let step = 0; step < DAY * 10; step++) {
    tick(village, .1);
    const hour = Math.floor(step * 24 / (DAY * 10));
    if (hour === sampledHour) continue;
    sampledHour = hour;
    if (village.people.some(r => r.needs.hunger < 10)) hungryHours++;
    if (village.people.some(r => r.needs.hydration < 10)) thirstyHours++;
  }
}
assert.equal(hungryHours, 0, 'residents avoid critical hunger at every hourly sample');
assert.equal(thirstyHours, 0, 'residents avoid critical thirst at every hourly sample');
assert(village.money >= startingCash, 'outside wages cover recurring costs over two full weeks');
assert(village.projects.find(p => p.key === 'field').cultivation.beds.every(b => b.stage === 'growing'));
assert(restore(save(village)), 'unattended village can be reloaded');
console.log('PASS two unattended weeks with paid food, growing crops, solvent finances and hourly hunger and hydration checks');
