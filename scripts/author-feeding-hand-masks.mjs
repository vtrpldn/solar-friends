import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const root='web/art/characters/prototype-v1',inputs=await Promise.all([12,13,14,15].map(async index=>({index,registration:JSON.parse(await readFile(`${root}/feed-equipment-pose-${index}-v3.json`,'utf8'))}))),server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/artwork/character-body-lab.html`);await page.waitForFunction(()=>document.body.dataset.bodyReviewReady==='true');
 const masks=await page.evaluate(async inputs=>{
  const {createBodyForegroundLayers}=await import('/character-foreground.js'),binding=window.bodyAttachmentReview.binding,result=[];
  for(const {index,registration}of inputs){
   const body=window.bodyAttachmentReview.frames.activities[index],{front}=await createBodyForegroundLayers({body,binding,mask:registration.foreground,sheet:'activities',index}),pixels=front.getContext('2d').getImageData(0,0,256,256).data,labels=window.bodyMaterialsReview.model.mask('activities',index).labels,selected=new Uint8Array(256*256);let excluded=0;
   for(let p=0;p<selected.length;p++){if(!pixels[p*4+3])continue;if([2,3].includes(labels[p]))excluded++;else selected[p]=1;}
   const runs=[];for(let p=0;p<selected.length;){if(!selected[p]){p++;continue;}const start=p;while(p<selected.length&&selected[p])p++;runs.push([start,p-start]);}
   result.push({index,excluded,mask:{schema:2,body:binding,sheet:'activities',index,size:256,runs}});
  }
  return result;
 },inputs);
 const report=[];
 for(const {index,excluded,mask}of masks){
  const source=inputs.find(r=>r.index===index).registration,registration={...source,reviewRevision:4,foreground:mask};await writeFile(`${root}/feed-equipment-pose-${index}-v4.json`,JSON.stringify(registration,null,2)+'\n');
  report.push({index,input:`${root}/feed-equipment-pose-${index}-v3.json`,inputSha256:createHash('sha256').update(JSON.stringify(source)).digest('hex'),excludedGarmentPixels:excluded,selectedBodyPixels:mask.runs.reduce((n,[,length])=>n+length,0),runs:mask.runs.length,maskSha256:createHash('sha256').update(JSON.stringify(mask)).digest('hex')});
 }
 await writeFile('assets/art-direction/character-prototype-v1/feed-foreground-authoring-v1.json',JSON.stringify({purpose:'Source-bound foreground ownership only; no body or equipment raster pixels edited',method:'Start with authored pose polygons. Keep original nontransparent body pixels, excluding the source-bound material model shirt/shorts labels. Store fixed prepared-frame runs; no runtime colour segmentation.',materialRegistrationSha256:createHash('sha256').update(await readFile(`${root}/body-materials-v1.json`)).digest('hex'),poses:report},null,2)+'\n');
 console.log('Authored four exact feeding hand masks from unchanged body pixels and registered material regions.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
