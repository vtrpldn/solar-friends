import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const baseline=execFileSync('git',['show','d4a8453:web/resident-animation.js'],{encoding:'utf8'});
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();
 await page.route('**/baseline-resident-animation.js',route=>route.fulfill({contentType:'text/javascript',body:baseline}));
 await page.goto(`http://127.0.0.1:${server.address().port}/pose-contact-check`);
 const result=await page.evaluate(async()=>{
  const {FRAME_ANCHOR}=await import('/sprite-frames.js');
  const {drawResidentAnimation:draw}=await import('/resident-animation.js'),{drawResidentAnimation:old}=await import('/baseline-resident-animation.js');
  const canvas=(w=256,h=w)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
  const check=(value,label)=>{if(!value)throw Error(label);};
  const equal=(a,b,label)=>{const x=a.getContext('2d').getImageData(0,0,a.width,a.height).data,y=b.getContext('2d').getImageData(0,0,b.width,b.height).data;check(x.length===y.length&&x.every((n,i)=>n===y[i]),label);};
  const frames=[canvas(),canvas()];frames.forEach((frame,i)=>{const c=frame.getContext('2d');c.fillStyle=i?'#3d874dcc':'#d77b32';c.fillRect(0,0,256,256);c.clearRect(20,20,200,200);c.fillRect(110,100,30,50);});
  const provider={frameForPose:(_sheet,index)=>frames[index]},scratch=canvas();let legacy=0,custom=0;
  for(const facing of [-1,1])for(const breath of [1,1.006])for(const interpolation of ['crossfade','keyframes'])for(const weight of [.25,1]){
   const animation={facing,breath,layers:[{sheet:'base',row:0,frame:0,weight},{sheet:'base',row:0,frame:1,weight:1-weight}]};
   const a=canvas(768),b=canvas(768),c=canvas(768);old(a.getContext('2d'),canvas(),{...provider,interpolation},animation,384,384,128);draw(b.getContext('2d'),scratch,{...provider,interpolation},animation,384,384,128);draw(c.getContext('2d'),scratch,{...provider,interpolation,contactForPose:()=>[128,FRAME_ANCHOR*256]},animation,384,384,128);equal(a,b,'Legacy changed');equal(a,c,'Default contact changed');legacy+=2;
  }
  for(const contacts of [[[128,180],[128,180]],[[32,240],[224,16]]])for(const facing of [-1,1]){
   const animation={facing,breath:1,layers:[{sheet:'base',row:0,frame:0,weight:.5},{sheet:'base',row:0,frame:1,weight:.5}]},actual=canvas(1024),expected=canvas(1024),reference=canvas(768),ctx=reference.getContext('2d');ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.5;
   contacts.forEach((anchor,i)=>ctx.drawImage(frames[i],384-anchor[0],384-anchor[1]));
   const ec=expected.getContext('2d');ec.translate(512,512);ec.scale(facing,1);ec.drawImage(reference,-384,-384);
   draw(actual.getContext('2d'),scratch,{...provider,contactForPose:(_s,i)=>contacts[i]},animation,512,512,256);equal(actual,expected,'Contact blend clips or shifts a frame');custom++;
  }
  const animation={facing:1,breath:1,layers:[{sheet:'base',row:0,frame:0,weight:1}]};draw(canvas(768).getContext('2d'),scratch,provider,animation,384,384,128);check(scratch.width===256&&scratch.height===256,'Scratch did not restore');
  let rejected=0;for(const value of [null,[],[128],[-1,180],[128,257],[NaN,180],[128,Infinity],Array(2)]){try{draw(canvas().getContext('2d'),scratch,{...provider,contactForPose:()=>value},animation,128,128,128);}catch{rejected++;}}check(rejected===8,'Invalid contact accepted');
  draw(canvas().getContext('2d'),scratch,{...provider,contactForPose:(_s,i)=>{check(i===0,'Invisible pose requested metadata');return [128,180];}},{...animation,layers:[...animation.layers,{sheet:'base',row:0,frame:1,weight:0}]},128,128,128);
  return {legacyExactComparisons:legacy,wholeFrameContactComparisons:custom,invalidContactsRejected:rejected,invisibleLayersSkipped:true,scratchRestored:true};
 });assert.equal(result.wholeFrameContactComparisons,4);console.log('PASS',JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
