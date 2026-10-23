// Exercise owned GPU/canvas backing stores, including late composition failures.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/artwork/character-body-lab.html`);await page.waitForFunction(()=>document.body.dataset.bodyReviewReady==='true');
 const result=await page.evaluate(async()=>{
  const {registeredEquipmentFrame}=await import('/character-equipment.js'),{loadEquipmentArt,paintEquipmentArt}=await import('/character-equipment-parts.js'),{loadCharacterImageSource}=await import('/character-image-source.js'),{createBodyForegroundLayers}=await import('/character-foreground.js');
  const {extractRegisteredAtlasPart}=await import('/character-atlas-part.js');
  const root='/art/characters/prototype-v1/',base=window.bodyAttachmentReview,created=[],read=async file=>(await fetch(root+file)).json(),load=file=>loadCharacterImageSource(root+file),check=(ok,message)=>{if(!ok)throw Error(message);},pixels=c=>c.getContext('2d').getImageData(0,0,256,256).data;
  const create=document.createElement.bind(document),draw=CanvasRenderingContext2D.prototype.drawImage,put=CanvasRenderingContext2D.prototype.putImageData,fill=CanvasRenderingContext2D.prototype.fill;
  let success=0,refused=0,borrowed=0;
  const track=async(fn,outputs=1,size=256)=>{
   created.length=0;document.createElement=function(name,...args){const value=create(name,...args);if(name==='canvas')created.push(value);return value;};
   try{const result=await fn(),kept=outputs===2?[result.front,result.back]:outputs===1?[result]:[];check(created.every(c=>kept.includes(c)?c.width===size&&c.height===size:c.width===0&&c.height===0),'Owned temporary backing store was retained');for(const c of kept)c.width=c.height=0;success++;}
   finally{document.createElement=create;}
  };
  const reject=async fn=>{
   created.length=0;document.createElement=function(name,...args){const value=create(name,...args);if(name==='canvas')created.push(value);return value;};let denied=false;
   try{await fn();}catch{denied=true;}finally{document.createElement=create;CanvasRenderingContext2D.prototype.drawImage=draw;CanvasRenderingContext2D.prototype.putImageData=put;}
   check(denied,'Expected failure did not occur');check(created.length>0&&created.every(c=>c.width===0&&c.height===0),'Failed composition retained an owned backing store');refused++;
  };
  let feed;
  for(let index=0;index<16;index++){
   const file=index<4?`cook-equipment-pose-${index}-v${index===0?3:2}.json`:index<8?`water-equipment-pose-${index}-v${index===7?3:1}.json`:index<12?`tend-equipment-pose-${index}-v${index===11?1:2}.json`:`feed-equipment-pose-${index}-v5.json`,registration=await read(file),equipment=await loadEquipmentArt(registration,load),body=base.frames.activities[index],before=pixels(body),args={body,binding:base.binding,equipment,registration,sheet:'activities',index};
   await track(()=>registeredEquipmentFrame(args));check(body.width===256&&body.height===256&&pixels(body).every((v,i)=>v===before[i]),'Borrowed body was changed/released');check(equipment.image.naturalWidth===registration.source.width,'Borrowed equipment source was released');borrowed++;
   if(index===13)feed=args;
  }
  // Both old polygon ownership and new disjoint pixel ownership release scratch buffers.
  for(const index of [0,13]){const registration=await read(index===0?'cook-equipment-pose-0-v3.json':'feed-equipment-pose-13-v5.json');await track(()=>createBodyForegroundLayers({body:base.frames.activities[index],binding:base.binding,mask:registration.foreground,sheet:'activities',index}),2);}
  await reject(()=>paintEquipmentArt(feed.equipment,{...feed.registration,parts:[]}));
  await reject(()=>paintEquipmentArt({...feed.equipment,parts:feed.equipment.parts.map((part,index)=>index===1?{...part,sourceHash:'0'.repeat(64)}:part)},feed.registration));
  await reject(()=>registeredEquipmentFrame({...feed,equipment:{...feed.equipment,parts:[]}}));
  const bad=create('canvas');bad.width=bad.height=256;bad.getContext('2d').drawImage(feed.body,0,0);const changed=bad.getContext('2d').getImageData(0,0,256,256);let marked=false;
  for(const [start,length]of feed.registration.foreground.runs){for(let p=start;p<start+length;p++)if(changed.data[p*4+3]){changed.data[p*4]=(changed.data[p*4]+71)%256;marked=true;break;}if(marked)break;}check(marked,'Missing real hand pixel for overlap refusal');bad.getContext('2d').putImageData(changed,0,0);
  await reject(()=>registeredEquipmentFrame({...feed,appearanceFrame:bad}));check(bad.width===256&&feed.body.width===256,'Failure released borrowed appearance/body');bad.width=bad.height=0;
  await reject(()=>{CanvasRenderingContext2D.prototype.drawImage=function(source,...args){if(source instanceof HTMLCanvasElement&&source.width===256)throw Error('Injected late result draw failure');return draw.call(this,source,...args);};return registeredEquipmentFrame(feed);});
  await reject(()=>{CanvasRenderingContext2D.prototype.putImageData=function(){throw Error('Injected foreground layer publication failure');};return registeredEquipmentFrame(feed);});
  const polygon=await read('cook-equipment-pose-0-v3.json');
  await reject(()=>{CanvasRenderingContext2D.prototype.fill=function(){throw Error('Injected polygon raster failure');};return createBodyForegroundLayers({body:base.frames.activities[0],binding:base.binding,mask:polygon.foreground,sheet:'activities',index:0});}).finally(()=>{CanvasRenderingContext2D.prototype.fill=fill;});
  const atlas=create('canvas');atlas.width=atlas.height=1254;atlas.getContext('2d').fillRect(10,10,50,50);atlas.getContext('2d').fillRect(10,700,50,50);
  const extract=(sourceRect,bounds)=>extractRegisteredAtlasPart({image:atlas,sourceHash:'a'.repeat(64),registration:{size:1254,sha256:'a'.repeat(64),sourceRect,bounds}});
  await track(()=>{const part=extract([0,0,1254,1254],[0,0,1254,1254]);check(part.frame===atlas,'Whole-frame source identity changed');},0);
  for(const [rect,bounds]of [[[0,0,1254,600],[10,10,50,50]],[[0,600,1254,654],[10,700,50,50]]])await track(()=>extract(rect,bounds).frame,1,1254);
  await reject(()=>extract([0,0,1254,1254],[200,200,10,10]));check(atlas.width===1254,'Atlas audit failure released borrowed source');atlas.width=atlas.height=0;
  return {success,refused,borrowed};
 });assert.deepEqual(result,{success:21,refused:8,borrowed:16});assert.deepEqual(errors,[]);console.log('PASS: 16 complete equipment frames, 2 foreground representations and 3 atlas paths release owned scratch buffers; 8 early/late failures release all allocations; all borrowed body/source pixels survive.',result);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
