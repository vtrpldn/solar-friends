import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {familyWalkClothingFixture} from './family-walk-clothing-fixture.mjs';
import {tintClothingPixels} from '../web/character-clothing-colour.js';
const input={width:4,height:1,data:new Uint8ClampedArray([238,218,180,255,119,109,90,128,250,245,240,1,7,8,9,0])},original=input.data.slice();
for(const colour of ['cream','teal','terracotta','indigo']){
 const result=tintClothingPixels(input,colour);assert.notEqual(result.data,input.data);assert.deepEqual(input.data,original);
 for(let p=0;p<4;p++)assert.equal(result.data[p*4+3],original[p*4+3]);assert.deepEqual(result.data.slice(12),original.slice(12));
 if(colour==='cream')assert.deepEqual(result.data,original);
 else for(let c=0;c<3;c++)assert(Math.abs(result.data[c]/2-result.data[4+c])<=1);
}
for(const colour of ['reference','constructor','',null,{},'pink'])assert.throws(()=>tintClothingPixels(input,colour));
for(const bad of [{...input,width:0},{...input,width:1255},{...input,data:new Uint8Array(16)},{...input,height:2}])assert.throws(()=>tintClothingPixels(bad));
const fixture=await familyWalkClothingFixture(),server=await serve(0,{handle(req,res,path){if(!fixture.served.has(path))return false;res.writeHead(200,{'Content-Type':'image/png'}).end(fixture.served.get(path));return true;}});let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/clothing-colour-verification`);
 const result=await page.evaluate(async data=>{
  const {loadCharacterImageSource}=await import('/character-image-source.js'),{tintClothingPixels}=await import('/character-clothing-colour.js');
  const check=(v,m)=>{if(!v)throw Error(m);};let transformed=0,alphaChecks=0;
  for(const garment of data.garments){const source=await loadCharacterImageSource('/family-source/'+garment.file),canvas=document.createElement('canvas');canvas.width=canvas.height=1254;
   try{const ctx=canvas.getContext('2d');ctx.drawImage(source.image,0,0);const original=ctx.getImageData(0,0,1254,1254),before=original.data.slice();
    for(const colour of ['cream','teal','terracotta','indigo']){const result=tintClothingPixels(original,colour);let changed=0;
     for(let p=0;p<1254*1254;p++){check(result.data[p*4+3]===before[p*4+3],'Colour changed source alpha');alphaChecks++;for(let c=0;c<4;c++){check(original.data[p*4+c]===before[p*4+c],'Borrowed source changed');if(colour==='cream'||before[p*4+3]===0)check(result.data[p*4+c]===before[p*4+c],'Default or transparent RGB changed');}if(result.data[p*4]!==before[p*4])changed++;}
     check(colour==='cream'||changed>500,'Colour failed to reach cloth');transformed++;
    }
   }finally{canvas.width=canvas.height=0;}
  }return {transformed,alphaChecks,sourcePreserved:true,scope:'Raw garment material transform only; canvas resampling integration and visual colour review remain open.'};
 },fixture.data);assert.deepEqual(errors,[]);assert.equal(result.transformed,16);console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
