import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:!process.argv.includes('--headed')});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/`);
 const result=await page.evaluate(async()=>{
  const {auditCharacterPartRegion}=await import('/character-parts.js');
  const source=document.createElement('canvas');source.width=source.height=1254;const context=source.getContext('2d');
  const pixels=context.createImageData(1254,1254);let seed=7321;
  for(let i=0;i<pixels.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;pixels.data.set([seed&255,(seed>>>8)&255,(seed>>>16)&255,[0,1,31,32,127,254,255][seed%7]],i);}
  context.putImageData(pixels,0,0);const blob=await new Promise(resolve=>source.toBlob(resolve)),url=URL.createObjectURL(blob),image=new Image();image.src=url;await image.decode();let checks=0;
  try{for(const rect of [[0,0,1254,1254],[0,0,313,313],[941,0,313,313],[0,941,313,313],[941,941,313,313],[313,313,627,627]]){
   const old=document.createElement('canvas'),crop=document.createElement('canvas');old.width=old.height=1254;crop.width=rect[2];crop.height=rect[3];
   try{const a=old.getContext('2d',{willReadFrequently:true}),b=crop.getContext('2d',{willReadFrequently:true});a.drawImage(image,0,0);b.drawImage(image,-rect[0],-rect[1]);const expected=a.getImageData(...rect),actual=b.getImageData(0,0,rect[2],rect[3]);
    if(expected.data.some((v,i)=>v!==actual.data[i]))throw Error('Registered cell pixels changed: '+rect);
    for(const bounds of [[0,0,rect[2],rect[3]],[1,1,rect[2]-2,rect[3]-2],[.5,.5,rect[2]-1,rect[3]-1]])if(JSON.stringify(auditCharacterPartRegion(expected,bounds))!==JSON.stringify(auditCharacterPartRegion(actual,bounds)))throw Error('Authored audit changed');checks++;
   }finally{old.width=old.height=crop.width=crop.height=0;}
  }}finally{URL.revokeObjectURL(url);source.width=source.height=0;}return {exactPixelRegions:checks,exactAuditComparisons:checks*3};
 });assert.equal(result.exactPixelRegions,6);console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
