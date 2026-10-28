import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';

// Frozen pre-cleanup algorithm: compare actual resampled RGBA, not source bounds.
const baseline=execFileSync('git',['show','837c926:web/sprite-frames.js'],{encoding:'utf8'});
const server=await serve(0,{handle(_req,res,path){
 if(path==='/baseline-sprite-frames.js'){res.writeHead(200,{'Content-Type':'text/javascript'}).end(baseline);return true;}
 if(path==='/frame-disposal'){res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><title>Frame disposal verification</title>');return true;}
 return false;
}});let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/frame-disposal`);
 const result=await page.evaluate(async()=>{
  const current=await import('/sprite-frames.js'),old=await import('/baseline-sprite-frames.js');let poses=0,temporary=0;
  const create=document.createElement.bind(document),tracked=[];
  const load=async path=>{const image=new Image();image.src=path;await image.decode();return image;};
  const paths=['iara','bento'].flatMap(name=>['','-idle','-activities'].map(suffix=>`/art/animations/${name}${suffix}.png`));
  paths.push('/art/characters/prototype-v1/body-neutral-base.png',...['idle','activities'].map(kind=>`/art/characters/prototype-v1/body-neutral-${kind}-candidate-v1.png`));
  for(const path of paths){
   const image=await load(path),options={referenceRow:path.includes('-idle')||path.includes('-activities')?0:2},expected=old.preparedFrames(image,options);tracked.length=0;
   document.createElement=function(tag,...args){const node=create(tag,...args);if(tag==='canvas')tracked.push(node);return node;};let frames;
   try{frames=current.preparedFrames(image,options);}finally{document.createElement=create;}
   if(frames.length!==16)throw Error('Missing poses: '+path);
   for(let i=0;i<frames.length;i++){
    const a=frames[i].getContext('2d').getImageData(0,0,256,256).data,b=expected[i].getContext('2d').getImageData(0,0,256,256).data;
    if(a.some((value,index)=>value!==b[index]))throw Error(`Pixel mismatch ${path} pose ${i}`);poses++;
   }
   const cuts=tracked.filter(canvas=>!frames.includes(canvas));if(cuts.length!==17||cuts.some(c=>c.width||c.height))throw Error('Temporary canvas survived: '+path);temporary+=cuts.length;
   if(current.preparedFrames(image,options)!==frames||!image.naturalWidth)throw Error('Cache or borrowed image changed');
   for(const canvas of [...frames,...expected])canvas.width=canvas.height=0;
  }
  // Fail after completed output frames exist; every owned canvas must be zeroed.
  const image=await load(paths[0]),draw=CanvasRenderingContext2D.prototype.drawImage;tracked.length=0;let draws=0,refused=false;
  document.createElement=function(tag,...args){const node=create(tag,...args);if(tag==='canvas')tracked.push(node);return node;};
  CanvasRenderingContext2D.prototype.drawImage=function(...args){if(++draws===4)throw Error('injected draw failure');return draw.apply(this,args);};
  try{current.preparedFrames(image);}catch(error){refused=error.message==='injected draw failure';}finally{document.createElement=create;CanvasRenderingContext2D.prototype.drawImage=draw;}
  if(!refused||tracked.some(c=>c.width||c.height)||!image.naturalWidth)throw Error('Failure cleanup lost ownership');
  const retry=current.preparedFrames(image);if(retry.length!==16)throw Error('Failed work polluted cache');
  return {poses,temporary,failedCanvasesReleased:tracked.length,retry:true};
 });assert.equal(result.poses,144);assert.equal(result.temporary,153);assert.equal(result.retry,true);console.log('PASS: '+JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
