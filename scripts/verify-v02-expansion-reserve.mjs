import assert from 'node:assert/strict';
import {blueprintPurchase,save,restore} from '../web/v02/weekend/simulation.js';
import {village} from './fixtures.mjs';
const s=village({fast:false}).s;assert.equal(s.expansionReserve,100);s.money=0;
assert.equal(blueprintPurchase(s,'gathering').error,'','own supplies remain usable with no cash');
s.materials.tank=0;s.money=100000;const quote=blueprintPurchase(s,'water');s.money=quote.cost+quote.transport+99;
assert.match(blueprintPurchase(s,'water').error,/kept in reserve/);s.money+=1;assert.equal(blueprintPurchase(s,'water').error,'');
s.expansionReserve=0;s.money-=100;assert.equal(blueprintPurchase(s,'water').error,'','player can explicitly release the planning reserve');assert(restore(save(s)));
console.log('PASS expansion cash buffer, exact boundary, player override and cash-free use of owned materials');
