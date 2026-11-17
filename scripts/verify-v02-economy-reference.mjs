import assert from 'node:assert/strict';
import {tripEstimate,GRID_TARIFF} from '../web/v02/weekend/economy-reference.js';
import {townDuration} from '../web/v02/weekend/world-settings.js';
import {transportCost} from '../web/v02/weekend/physical-trade.js';
import {financeSummary} from '../web/v02/weekend/finances.js';
import {GRID_POWER} from '../web/v02/weekend/infrastructure.js';
for(const [town,km,cost,minutes]of [['nearby',8,4.89,24],['drive',12,7.33,30],['remote',36,22,66]]){
 const q=tripEstimate(town);assert.equal(q.km,km);assert.equal(q.cost,cost);assert.equal(q.minutes,minutes);
 assert.equal(transportCost({worldSettings:{town}}),cost);assert(Math.abs(townDuration(town)*.45-minutes)<1e-9);
}
assert.equal(GRID_TARIFF,.95);assert.equal(GRID_POWER.tariff,GRID_TARIFF);
assert.equal(financeSummary({time:0,money:100,projects:[],infrastructure:{grid:{importing:2}}}).gridRate,1.9);
console.log('PASS distance/fuel/travel quotes and consistent electricity forecasts');
