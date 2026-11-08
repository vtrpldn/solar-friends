import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS,OPTIONS,PRESETS,applySettings,settingsFor,registerWorld} from '../web/v02/weekend/world-settings.js';
import {createWeekend,chooseCamp,supplyRun,save,restore} from '../web/v02/weekend/simulation.js';
import {elevationVertex} from '../web/v02/weekend/elevation.js';
import {resourceRichness} from '../web/v02/weekend/land-layout.js';
let seed=100;
for(const biome of OPTIONS.biome)for(const preset of Object.values(PRESETS)){
 const settings={...DEFAULT_SETTINGS,...preset,biome},s=applySettings(createWeekend(seed++),settings);
 assert(restore(save(s)));assert.deepEqual(settingsFor(s.landSeed),settings);chooseCamp(s,'clearing');s.money=1000;
 assert(supplyRun(s,'wood'));assert([45,55,110].includes(s.trip.duration));assert(restore(save(s)));
}
const tight=applySettings(createWeekend(55),{...DEFAULT_SETTINGS,savings:'tight',supplies:'essentials'});assert.equal(tight.money,100);assert.equal(tight.wood,22);
const rich=applySettings(createWeekend(56),{...DEFAULT_SETTINGS,savings:'comfortable',supplies:'prepared'});assert.equal(rich.money,600);assert.equal(rich.wood,61);
registerWorld(777,{...DEFAULT_SETTINGS,landscape:'gentle',resources:'sparse'});const low=elevationVertex(80,50,777),sparse=resourceRichness(777,40,40);
registerWorld(777,{...DEFAULT_SETTINGS,landscape:'rugged',resources:'rich'});assert(elevationVertex(80,50,777)>low);assert(resourceRichness(777,40,40)>sparse);
console.log('PASS: all biome/preset combinations persist; savings/supplies, terrain, resource richness and configured trips');
