import assert from 'node:assert/strict';
import {tintHairPixels,hairColourPalettes} from '../web/character-hair-colours.js';
import {residentPartRecipe,validateResidentPartRecipe} from '../web/resident-part-recipe.js';
const data=new Uint8ClampedArray(16*16*4);for(let p=0;p<data.length;p++)data[p]=(p*67+31)%256;const original=data.slice(),pixels={width:16,height:16,data};assert.equal(tintHairPixels(pixels,'chestnut'),pixels);
for(const key of Object.keys(hairColourPalettes)){const result=tintHairPixels(pixels,key);for(let p=0;p<data.length;p+=4){assert.equal(result.data[p+3],data[p+3]);if(!data[p+3])assert.deepEqual(result.data.slice(p,p+4),data.slice(p,p+4));}assert.deepEqual(data,original);}
for(const value of ['unknown','__proto__',null])assert.throws(()=>tintHairPixels(pixels,value),/colour/);for(const value of [{...pixels,width:0},{...pixels,height:1255},{...pixels,data:[]}])assert.throws(()=>tintHairPixels(value,'silver'),/registered/);
const chestnut=residentPartRecipe();assert.deepEqual(validateResidentPartRecipe({...chestnut,hairColour:'chestnut'}),chestnut);assert(!Object.hasOwn(chestnut,'hairColour'));for(const colour of ['espresso','black','silver'])assert.equal(residentPartRecipe({hairColour:colour}).hairColour,colour);for(const value of ['unknown',null,42])assert.throws(()=>validateResidentPartRecipe({...chestnut,hairColour:value}),/colour/);
console.log('PASS: hair-only material changes preserve source/alpha/transparent pixels, reuse the unchanged chestnut source, canonicalize defaults and refuse invalid colours or image dimensions.');
