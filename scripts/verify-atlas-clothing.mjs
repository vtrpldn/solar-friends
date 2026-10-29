import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const root='assets/art-direction/character-prototype-v1/body-broad-v1',source=await readFile(`${root}/shirt-standing-candidate-v2.png`),review=JSON.parse(await readFile(`${root}/shirt-standing-review-v2/registration-and-measurements.json`,'utf8'));
const server=await serve(0,{handle(_req,res,path){if(path!=='/garment.png')return false;res.writeHead(200,{'Content-Type':'image/png'}).end(source);return true;}});let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/atlas-clothing`);
 const result=await page.evaluate(async registration=>{
  const {prepareBodyFamily}=await import('/character-body-family.js'),{loadCharacterImageSource}=await import('/character-image-source.js'),{bindComposedRuntimeRaster}=await import('/character-runtime-binding.js'),{createFamilyBodyMaterialModel,tintBodyMaterials}=await import('/character-materials.js'),{composeClothingPose}=await import('/character-clothing.js');
  const d=await(await fetch('/art/characters/broad-v1/bundle-v1.json')).json(),sources={},loaded=[];let body,model,garment;const tint=document.createElement('canvas');tint.width=tint.height=256;const preview=document.createElement('canvas');preview.width=1280;preview.height=1152;const pc=preview.getContext('2d');pc.fillStyle='#dde5c6';pc.fillRect(0,0,1280,1152);pc.font='18px sans-serif';
  let colours=0,preservedComparisons=0,refusals=0,silhouetteChanges=0,inputSnapshots=0;const made=[],create=document.createElement.bind(document);let tracking=false;
  document.createElement=(tag,...args)=>{const c=create(tag,...args);if(tracking&&tag==='canvas')made.push(c);return c;};
  try{
   for(const [id,key]of Object.entries(d.bodySources)){const spec=d.sources[key],value=await loadCharacterImageSource(`/art/characters/broad-v1/source-${spec.sha256}.png`,{sha256:spec.sha256,decoder:'bitmap'});loaded.push(value);sources[id]=value;}
   body=await prepareBodyFamily({ownership:d.ownership,sources});bindComposedRuntimeRaster(d,body);model=await createFamilyBodyMaterialModel(body,d.materials,{maxFrames:1});garment=await loadCharacterImageSource('/garment.png',{sha256:registration.sources.shirt.sha256,decoder:'bitmap'});
   const runs=flags=>{const result=[];for(let i=0;i<flags.length;){if(!flags[i]){i++;continue;}const start=i;while(i<flags.length&&flags[i])i++;result.push([start,i-start]);}return result;};
   const expectRefusal=async fn=>{try{const value=await fn();value?.frame&&(value.frame.width=value.frame.height=0);}catch{refusals++;return;}throw Error('An invalid garment request was accepted.');};
   for(let index=8;index<12;index++){
    const raw=body.frameForPose('base',index),pixels=raw.getContext('2d').getImageData(0,0,256,256),mask=model.mask('base',index),paint=tintBodyMaterials(pixels,mask,{skin:'copper',shirt:'indigo',shorts:'sage',shoes:'graphite'});tint.getContext('2d').putImageData(new ImageData(paint.data,256,256),0,0);const original=tint.getContext('2d').getImageData(0,0,256,256).data;
    const bound=r=>({schema:2,body:body.binding,sheet:'base',index,size:256,runs:r}),foreground=new Uint8Array(65536),preserved=new Uint8Array(65536);
    for(let p=0;p<65536;p++){foreground[p]=Number(mask.labels[p]===1&&Math.floor(p/256)>=105);preserved[p]=Number(mask.labels[p]===3||mask.labels[p]===4||Math.floor(p/256)>=145);}
    const ownership={schema:1,body:body.binding,sheet:'base',index,bodyFrameSha256:body.binding.frames.base[index],foreground:bound(runs(foreground)),preservedBody:bound(runs(preserved))},args={body:raw,appearanceBody:tint,binding:body.binding,sheet:'base',index,atlas:{registration,sources:{shirt:garment}},ownership};let alpha=null,cream=null;
    for(const colour of ['cream','teal','terracotta','indigo']){
     tracking=true;let frame;try{({frame}=await composeClothingPose({...args,colour}));const data=frame.getContext('2d').getImageData(0,0,256,256).data;let changed=false;
      for(let p=0;p<65536;p++){
       if(foreground[p]||preserved[p])for(let c=0;c<4;c++){if(data[p*4+c]!==original[p*4+c])throw Error('Garment changed owned hand or lower-body RGBA');preservedComparisons++;}
       if(alpha&&data[p*4+3]!==alpha[p])throw Error('Shirt colour changed silhouette');
       if(data[p*4+3]!==pixels.data[p*4+3])changed=true;
      }
      if(!alpha){alpha=Uint8Array.from({length:65536},(_,p)=>data[p*4+3]);cream=data.slice();if(changed)silhouetteChanges++;}
      else if(!data.some((v,i)=>i%4!==3&&v!==cream[i]))throw Error('Selected shirt colour was ignored');
      const col=['cream','teal','terracotta','indigo'].indexOf(colour);pc.drawImage(frame,col*320+32,(index-8)*288+20);pc.fillStyle='#283e32';pc.fillText(`base ${index} / ${colour}`,col*320+20,(index-8)*288+22);
      colours++;
     }finally{if(frame)frame.width=frame.height=0;tracking=false;}
     if(made.some(c=>c.width||c.height))throw Error('Garment preparation retained a temporary canvas');
    }
    tracking=true;try{
     await expectRefusal(()=>composeClothingPose({...args,colour:'invalid'}));
     await expectRefusal(()=>composeClothingPose({...args,ownership:{...ownership,bodyFrameSha256:'0'.repeat(64)}}));
     await expectRefusal(()=>composeClothingPose({...args,ownership:{...ownership,index:0}}));
     await expectRefusal(()=>composeClothingPose({...args,atlas:{...args.atlas,sources:{shirt:{...garment,sourceHash:'0'.repeat(64)}}}}));
     await expectRefusal(()=>composeClothingPose({...args,ownership:{...ownership,preservedBody:{...ownership.preservedBody,runs:[[65535,2]]}}}));
     await expectRefusal(()=>composeClothingPose({...args,ownership:{...ownership,extra:true}}));
     const changed=create('canvas');changed.width=changed.height=256;try{changed.getContext('2d').drawImage(raw,0,0);const data=changed.getContext('2d').getImageData(0,0,256,256);const p=data.data.findIndex((v,i)=>i%4===3&&v>=128)-3;if(p<0)throw Error('Mutation needs a painted body pixel');data.data[p]^=64;changed.getContext('2d').putImageData(data,0,0);await expectRefusal(()=>composeClothingPose({...args,body:changed}));}finally{changed.width=changed.height=0;}
     const draw=CanvasRenderingContext2D.prototype.drawImage;let injected=false;
     try{CanvasRenderingContext2D.prototype.drawImage=function(image,...rest){if(this.canvas.width===256&&image instanceof HTMLCanvasElement&&image.width===256){injected=true;throw Error('Injected garment output failure');}return draw.call(this,image,...rest);};await expectRefusal(()=>composeClothingPose(args));}finally{CanvasRenderingContext2D.prototype.drawImage=draw;}if(!injected)throw Error('Late draw failure was not exercised');
     const mutable={...args,ownership:structuredClone(ownership),atlas:{...args.atlas,registration:structuredClone(registration)}},pending=composeClothingPose(mutable);mutable.ownership.index=0;mutable.atlas.registration.scale=0;tint.getContext('2d').clearRect(0,0,256,256);let snapshot;
     try{({frame:snapshot}=await pending);const actual=snapshot.getContext('2d').getImageData(0,0,256,256).data;if(actual.some((v,i)=>v!==cream[i]))throw Error('Garment preparation borrowed mutable input across digest verification');inputSnapshots++;}finally{if(snapshot)snapshot.width=snapshot.height=0;tint.getContext('2d').putImageData(new ImageData(original,256,256),0,0);}
    }finally{tracking=false;}
    if(made.some(c=>c.width||c.height))throw Error('Refused garment preparation retained a canvas');
   }
   return {poses:4,colours,preservedComparisons,refusals,silhouetteChanges,inputSnapshots,png:preview.toDataURL().split(',')[1],temporarySurfacesReleased:true,scope:'Actual standing prototype only; no complete wardrobe or visual acceptance claim'};
  }finally{document.createElement=create;tint.width=tint.height=preview.width=preview.height=0;model?.clear();body?.dispose();garment?.dispose();for(const value of loaded)value.dispose();}
 },review.registration);
 assert.equal(result.colours,16);assert.equal(result.refusals,32);assert.equal(result.inputSnapshots,4);assert.equal(result.silhouetteChanges,4);assert(result.preservedComparisons>0);await writeFile(`${root}/shirt-standing-review-v2/coloured-composition.png`,Buffer.from(result.png,'base64'));delete result.png;await writeFile(`${root}/shirt-standing-review-v2/composition-checks.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
