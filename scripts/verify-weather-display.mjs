import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {weatherDisplayValue} from '../web/editor/weather.js';
import init,{Game} from '../web/pkg/solar_friends.js';
assert.equal(weatherDisplayValue(Math.fround(.9)),.9);assert.equal(weatherDisplayValue(Math.fround(.831)),.831);assert.equal(weatherDisplayValue(Math.fround(.8333334)),.8333334);assert.equal(weatherDisplayValue(21),21);
for(const value of [NaN,Infinity,-Infinity,-0,1e100])assert.equal(weatherDisplayValue(value),value);
let seed=42;for(let i=0;i<20000;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const value=.5+seed/4294967296*1.5;assert.equal(Math.fround(weatherDisplayValue(value)),Math.fround(value));assert.equal(weatherDisplayValue(weatherDisplayValue(value)),weatherDisplayValue(value));}
await init({module_or_path:await readFile('web/pkg/solar_friends_bg.wasm')});const g=new Game();try{const catalog=JSON.parse(g.scenario_catalog());for(const biome of catalog.biomes)for(const value of Object.values(biome.weather)){if(typeof value==='number'){assert.equal(Math.fround(weatherDisplayValue(value)),Math.fround(value));assert(String(weatherDisplayValue(value)).length<=10);}}}finally{g.free();}console.log('PASS readable weather defaults, distinct fine values, all biome profiles and 20,000 native-equivalent formatting samples.');
