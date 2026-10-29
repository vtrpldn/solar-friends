import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';

// Diagnostic only: four standing poses do not constitute a playable wardrobe.
const root='assets/art-direction/character-prototype-v1/body-broad-v1',sourcePath=`${root}/shirt-standing-candidate-v1.png`,out=`${root}/shirt-standing-review-v1`,bytes=await readFile(sourcePath),sha256=createHash('sha256').update(bytes).digest('hex');
const server=await serve(0,{handle(_req,res,path){if(path!=='/shirt-candidate.png')return false;res.writeHead(200,{'Content-Type':'image/png'}).end(bytes);return true;}});let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/shirt-review`);
 const result=await page.evaluate(async sha256=>{
  const {prepareBodyFamily}=await import('/character-body-family.js'),{loadCharacterImageSource}=await import('/character-image-source.js'),{paintRegisteredEquipmentAtlas}=await import('/character-equipment-atlas.js'),{createFamilyBodyMaterialModel,tintBodyMaterials}=await import('/character-materials.js');
  const d=await(await fetch('/art/characters/broad-v1/bundle-v1.json')).json(),sources={},loaded=[];let body,shirt,model;
  try{
   for(const [id,key]of Object.entries(d.bodySources)){const spec=d.sources[key],value=await loadCharacterImageSource(`/art/characters/broad-v1/source-${spec.sha256}.png`,{sha256:spec.sha256,decoder:'bitmap'});loaded.push(value);sources[id]=value;}
   body=await prepareBodyFamily({ownership:d.ownership,sources});const {bindComposedRuntimeRaster}=await import('/character-runtime-binding.js');bindComposedRuntimeRaster(d,body);model=await createFamilyBodyMaterialModel(body,d.materials,{maxFrames:1});shirt=await loadCharacterImageSource('/shirt-candidate.png',{sha256,width:1254,height:1254,decoder:'bitmap'});
   const poses=[{sheet:'base',index:8,parts:[{source:'shirt',rect:[0,0,627,627],offset:[49.25,16.725]}]},{sheet:'base',index:9,parts:[{source:'shirt',rect:[627,0,627,627],offset:[57.575,16.725]}]},{sheet:'base',index:10,parts:[{source:'shirt',rect:[0,627,627,627],offset:[48.125,24.5]}]},{sheet:'base',index:11,parts:[{source:'shirt',rect:[627,627,627,627],offset:[54.2,22.7]}]}];
   const registration={schema:1,body:body.binding,scale:.225,sources:{shirt:{sha256,width:1254,height:1254}},poses},board=document.createElement('canvas');board.width=2048;board.height=1152;const ctx=board.getContext('2d');ctx.fillStyle='#dde5c6';ctx.fillRect(0,0,board.width,board.height);ctx.font='20px sans-serif';
   const metadata=[];
   for(let row=0;row<4;row++){
    const index=8+row,raw=body.frameForPose('base',index),overlay=paintRegisteredEquipmentAtlas({binding:body.binding,registration,sources:{shirt},sheet:'base',index}),composed=document.createElement('canvas');composed.width=composed.height=256;const c=composed.getContext('2d');c.drawImage(raw,0,0);c.drawImage(overlay,0,0);
    const diagnostic=document.createElement('canvas');diagnostic.width=diagnostic.height=256;
    try{const pixels=raw.getContext('2d').getImageData(0,0,256,256),paint=tintBodyMaterials(pixels,model.mask('base',index),{skin:'warm',shirt:'indigo',shorts:'sage',shoes:'brown'}),dc=diagnostic.getContext('2d');dc.putImageData(new ImageData(paint.data,256,256),0,0);dc.drawImage(overlay,0,0);for(const [col,image,label]of [[0,raw,'Existing body'],[1,composed,'Shirt composition'],[2,overlay,'Garment only'],[3,diagnostic,'Exposed tank diagnostic']]){ctx.drawImage(image,col*512+128,row*288+20,256,256);ctx.fillStyle='#283e32';ctx.fillText(`base ${index}: ${label}`,col*512+22,row*288+24);}const a=pixels.data,b=c.getImageData(0,0,256,256).data;let changed=0,lowerBodyChanged=0;for(let p=0;p<65536;p++)if(a.slice(p*4,p*4+4).some((v,i)=>v!==b[p*4+i])){changed++;if(Math.floor(p/256)>=145)lowerBodyChanged++;}metadata.push({sheet:'base',index,changed,lowerBodyChanged,contact:body.contactForPose('base',index)});}finally{overlay.width=overlay.height=composed.width=composed.height=diagnostic.width=diagnostic.height=0;}
   }
   let unavailableRejected=false;try{paintRegisteredEquipmentAtlas({binding:body.binding,registration,sources:{shirt},sheet:'activities',index:0});}catch{unavailableRejected=true;}
   return {png:board.toDataURL().split(',')[1],registration,metadata,unavailableRejected};
  }finally{model?.clear();body?.dispose();shirt?.dispose();for(const value of loaded)value.dispose();}
 },sha256);
 assert(result.unavailableRejected);assert(result.metadata.every(p=>p.changed>0));await mkdir(out,{recursive:true});await writeFile(`${out}/standing-fit.png`,Buffer.from(result.png,'base64'));delete result.png;await writeFile(`${out}/registration-and-measurements.json`,JSON.stringify({status:'diagnostic-only-not-player-eligible',source:sourcePath,...result},null,2)+'\n');console.log(JSON.stringify({out,metadata:result.metadata,unavailableRejected:result.unavailableRejected}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
