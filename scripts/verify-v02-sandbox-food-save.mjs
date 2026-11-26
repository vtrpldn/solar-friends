import assert from 'node:assert/strict';
import {tick,save,restore} from '../web/v02/weekend/simulation.js';
import {village} from './fixtures.mjs';
import {addOrganicWaste,foodChange,validFoodStorage} from '../web/v02/weekend/food-storage.js';
const {s}=village({sandbox:true});
foodChange(s,'meals',-1);addOrganicWaste(s,.2); // Eating can initialize the waste ledger after consuming food.
tick(s,.1);assert(validFoodStorage(s),'unlimited stock refill keeps food lots consistent');
foodChange(s,'meals',-1);assert(validFoodStorage(s));assert(restore(save(s)));
s.foodStorage.lots.meals[0].n--;assert(restore(save(s)),'old sandbox stock/lot mismatch is normalized without changing finite story saves');
console.log('PASS sandbox food consumption, waste, replenishment and save restoration remain consistent');
