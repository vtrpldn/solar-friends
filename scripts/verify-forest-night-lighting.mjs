import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const server=await serve(0);let browser;
try{browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/forest-light-test`);const result=await page.evaluate(async()=>{
 const {paintWorldTree,paintContactShadow,forestSpecies}=await import('/world-renderer.js'),forest=new Image();forest.src='/art/mata-atlantica-atlas.png';await forest.decode();const make=()=>{const c=document.createElement('canvas');c.width=c.height=512;return c;},day=make(),old=make(),night=make(),checks=[];
 try{for(let species=0;species<4;species++){
  const options={project:()=>({x:256,y:420}),scale:2,width:512,height:512,forest},tree={x:0,y:0,species};for(const c of [day,old,night])c.getContext('2d').clearRect(0,0,512,512);paintWorldTree(day.getContext('2d'),tree,options);paintWorldTree(night.getContext('2d'),tree,{...options,night:1});
  const ctx=old.getContext('2d'),w=forestSpecies[species].width*2,cell=forest.width/2;paintContactShadow(ctx,256,424,46,23,.16);ctx.drawImage(forest,(species%2)*cell,Math.floor(species/2)*cell,cell,cell,256-w/2,420-w*.85,w,w);if(day.toDataURL()!==old.toDataURL())throw Error('Daytime forest pixels changed');
  const a=day.getContext('2d').getImageData(0,0,512,512).data,b=night.getContext('2d').getImageData(0,0,512,512).data;let count=0,dayLight=0,nightLight=0;for(let i=0;i<a.length;i+=4)if(a[i+3]>250&&b[i+3]>250){count++;dayLight+=a[i]+a[i+1]+a[i+2];nightLight+=b[i]+b[i+1]+b[i+2];}if(count<100||nightLight/dayLight>=.85||nightLight/dayLight<=.1)throw Error('Forest night tint missing or excessively dark');
  const nctx=night.getContext('2d');nctx.filter='contrast(0.9)';paintWorldTree(nctx,tree,{...options,night:.5});if(nctx.filter!=='contrast(0.9)')throw Error('Tree painting changed caller filter');nctx.filter='none';checks.push({species,opaqueCompared:count,nightToDayBrightness:nightLight/dayLight});
 }return {daytimeExact:true,nightSpecies:checks.length,callerFilterPreserved:true,checks};}finally{for(const c of [day,old,night])c.width=c.height=0;}
});assert.equal(result.nightSpecies,4);console.log(JSON.stringify(result));}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
