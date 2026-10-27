import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const root='assets/art-direction/character-prototype-v1',bundle=JSON.parse(await readFile('web/art/characters/relaxed-work-v1/bundle-v1.json')),masks=[];
for(const [index,collection]of [[5,'short-sleeve-relaxed-base-5-v2'],[6,'short-sleeve-relaxed-base-6-v2'],[7,'short-sleeve-relaxed-base-7-v3']])masks.push({index,shirt:JSON.parse(await readFile(root+'/'+collection+'/registrations-v1.json'))[0].foreground,tool:bundle.workEquipment[index-4].foreground});
const server=await serve(0);let browser;
try{browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);const result=await page.evaluate(async({binding,masks})=>{
 const {intersectBodyForegroundMasks:intersect,combineBodyForegroundMasks:union}=await import('/character-foreground.js'),check=(v,m)=>{if(!v)throw Error(m);},bits=mask=>{const a=new Uint8Array(65536);for(const [p,n]of mask.runs)a.fill(1,p,p+n);return a;};let pixelChecks=0,refused=0;
 for(const {index,shirt,tool}of masks){const args={binding,sheet:'base',index},a=bits(union({...args,masks:[shirt]})),b=bits(union({...args,masks:[tool]})),original=JSON.stringify([shirt,tool]),ab=intersect({...args,masks:[shirt,tool]}),ba=intersect({...args,masks:[tool,shirt]}),repeat=intersect({...args,masks:[shirt,tool,shirt]});check(JSON.stringify(ab)===JSON.stringify(ba)&&JSON.stringify(ab)===JSON.stringify(repeat),'Intersection ordering or repeated ownership changed output');const c=bits(ab);for(let p=0;p<65536;p++){check(c[p]===(a[p]&b[p]),'Mask intersection changed semantic ownership');pixelChecks++;}check(JSON.stringify([shirt,tool])===original,'Borrowed registration mutated');
 for(const invalid of [[],[shirt],Array(9).fill(shirt),[shirt,{...tool,index:(index+1)%16}],[shirt,{...shirt,runs:[[0,2],[1,2]]}],[shirt,null]]){let denied=false;try{intersect({...args,masks:invalid});}catch{denied=true;}check(denied,'Invalid ownership accepted');refused++;}}
 return {pixelChecks,refused,commutative:true,idempotent:true,borrowedInputsPreserved:true};
 },{binding:bundle.owners.curls.body,masks});assert.equal(result.pixelChecks,196608);assert.equal(result.refused,18);console.log(result);
}finally{await browser?.close();await new Promise(r=>server.close(r));}
