import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const server=await serve(0);let browser;
try{browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/margin-check`);const result=await page.evaluate(async()=>{
 const {composeResidentFrame}=await import('/character-frame-composition.js');
 const {drawResidentAnimation}=await import('/resident-animation.js');
 const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;},frame=canvas(320,320),f=frame.getContext('2d');f.fillStyle='#bc5319';f.fillRect(110,90,80,200);f.fillStyle='#ecd138';f.fillRect(95,10,110,40);
 let comparisons=0,refusals=0;
 for(const facing of [-1,1])for(const breath of [1,.98])for(const width of [128,256]){const actual=canvas(640,640),expected=canvas(640,640),scratch=canvas(256,256),animation={layers:[{sheet:'base',row:0,frame:0,weight:1}],facing,breath};drawResidentAnimation(actual.getContext('2d'),scratch,{frameForPose:()=>frame,contactForPose:()=>[128,228],frameOriginForPose:()=>[-32,-64]},animation,320,400,width);const e=expected.getContext('2d');e.translate(320,400);e.scale(facing,breath);e.drawImage(frame,(-32-128)*width/256,(-64-228)*width/256,320*width/256,320*width/256);const a=actual.getContext('2d').getImageData(0,0,640,640).data,b=e.getImageData(0,0,640,640).data;if(a.some((n,i)=>n!==b[i]))throw Error('Extended frame shifted native geometry');comparisons++;}
 for(const origin of [[1,0],[-129,0],[0],[-.5,0],null]){try{drawResidentAnimation(canvas(640,640).getContext('2d'),canvas(256,256),{frameForPose:()=>frame,contactForPose:()=>[128,228],frameOriginForPose:()=>origin},{layers:[{sheet:'base',row:0,frame:0,weight:1}],facing:1,breath:1},320,400,256);}catch{refusals++;}}
 const body=canvas(256,256),accessory=canvas(256,256);body.getContext('2d').fillRect(80,80,40,80);accessory.getContext('2d').fillRect(10,10,25,25);let compositions=0;
 for(const offset of [[-32,-64],[0,0],[128,128],[-128,-128]]){const result=composeResidentFrame(body,[{frame:accessory,offset}]),expected=canvas(result.frame.width,result.frame.height),e=expected.getContext('2d');e.drawImage(body,-result.origin[0],-result.origin[1]);e.drawImage(accessory,offset[0]-result.origin[0],offset[1]-result.origin[1]);const a=result.frame.getContext('2d').getImageData(0,0,result.frame.width,result.frame.height).data,b=e.getImageData(0,0,result.frame.width,result.frame.height).data;if(a.some((n,i)=>n!==b[i]))throw Error('Composition changed translated paint');compositions++;}
 for(const offset of [[129,0],[0,-129],[.1,0],null]){try{composeResidentFrame(body,[{frame:accessory,offset}]);}catch{refusals++;}}
 return {comparisons,refusals,compositions};});assert.deepEqual(result,{comparisons:8,refusals:9,compositions:4});console.log(JSON.stringify(result));}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
