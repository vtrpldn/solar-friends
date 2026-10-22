import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {auditCharacterPart} from '../web/character-parts.js';
const pixels={width:320,height:320,data:new Uint8ClampedArray(320*320*4)},regions=[];
for(let i=0;i<16;i++){const x=i%4*80+20,y=Math.floor(i/4)*80+8;regions.push([x,y,24,24]);for(let yy=y;yy<y+20;yy++)for(let xx=x;xx<x+20;xx++)pixels.data[(yy*320+xx)*4+3]=255;}
assert(auditCharacterPart(pixels,regions).ok);
const bad={...pixels,data:pixels.data.slice()};for(let y=40;y<60;y++)for(let x=20;x<40;x++)bad.data[(y*320+x)*4+3]=255;assert(!auditCharacterPart(bad,regions).ok);
assert(!auditCharacterPart({...pixels,data:new Uint8ClampedArray(pixels.data.length)},regions).ok);
for(const threshold of [NaN,0,-1,2])assert.throws(()=>auditCharacterPart(pixels,regions,{minimumCoverage:threshold}));
const server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:1200}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/artwork/character-prototype.html`);await page.waitForFunction(()=>document.body.dataset.prototypeReady==='true');
 const report=JSON.parse(await page.locator('#prototype-report').textContent());
 assert.equal(report.body.frames,16);assert(report.audits.every(a=>!a.ok));assert.equal(await page.locator('.prototype-poses canvas').count(),48);
 await page.screenshot({path:'/private/tmp/solar-character-prototype-board.png',fullPage:true});
 const guard=await page.evaluate(async()=>{
  const {characterBodyLayout,drawRegisteredCharacterFrame,auditCharacterPart}=await import('/character-parts.js');
  const image=async name=>{const i=new Image();i.src='/art/characters/prototype-v1/'+name;await i.decode();return i;};
  const body=await image('body-neutral-base.png'),part=await image('hair-curls-rejected-v2.png'),c=document.createElement('canvas');c.width=body.width;c.height=body.height;const ctx=c.getContext('2d');ctx.drawImage(body,0,0);const layout=characterBodyLayout(ctx.getImageData(0,0,c.width,c.height));
  let rejected=false;try{drawRegisteredCharacterFrame(ctx,{body,layout,index:0,parts:[{image:part,audit:{ok:false}}]});}catch{rejected=true;}
  let missing=false;try{drawRegisteredCharacterFrame(ctx,{body,layout,index:0,parts:[{image:part}]});}catch{missing=true;}
  let bounds=false;try{drawRegisteredCharacterFrame(ctx,{body,layout,index:16});}catch{bounds=true;}
  return {rejected,missing,bounds};
 });
 assert.deepEqual(guard,{rejected:true,missing:true,bounds:true});assert.deepEqual(errors,[]);
 await writeFile('assets/art-direction/character-prototype-v1/registration-report.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({result:'PASS',bodyPoses:16,rejectedParts:report.audits.map(a=>({passingPoses:a.poses.filter(p=>p.ok).length,minimumCoverage:Math.min(...a.poses.map(p=>p.coverage)),maximumCoverage:Math.max(...a.poses.map(p=>p.coverage))})),note:'Body and parts remain prototypes. Coverage checks do not prove art style, anatomy or occlusion approval.'},null,2));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
