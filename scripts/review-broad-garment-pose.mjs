import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const name=process.argv[2];assert(/^short-sleeve-broad-[a-z0-9-]+$/.test(name??''));const root='assets/art-direction/character-prototype-v1/'+name,intent=JSON.parse(await readFile(root+'/registration-intent.json','utf8')),source=await readFile(root+'/candidate-v1.png'),sha=b=>createHash('sha256').update(b).digest('hex'),hash=sha(source),audit=JSON.parse(await readFile(root+'/candidate-v1-audit.json','utf8'));
assert(audit.ok&&audit.sha256===hash);assert.equal(intent.poses.length,1);for(const [file,hash]of Object.entries(intent.guideHashes))assert.equal(sha(await readFile(root+'/'+file)),hash);
const server=await serve(0,{handle(_req,res,path){if(path!=='/pose-shirt.png')return false;res.writeHead(200,{'Content-Type':'image/png'}).end(source);return true;}});let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/broad-garment-pose`);
 const result=await page.evaluate(async({intent,hash})=>{
  const {prepareBodyFamily}=await import('/character-body-family.js'),{loadCharacterImageSource}=await import('/character-image-source.js'),{bindComposedRuntimeRaster}=await import('/character-runtime-binding.js'),{createFamilyBodyMaterialModel,tintBodyMaterials}=await import('/character-materials.js'),{composeClothingPose}=await import('/character-clothing.js'),{canonical}=await import('/editor/journal.js');
  const d=await(await fetch('/art/characters/broad-v1/bundle-v1.json')).json(),loaded=[],sources={},pose=intent.poses[0],{sheet,index,crop,tile}=pose;let body,model,shirt;const tint=document.createElement('canvas'),board=document.createElement('canvas');tint.width=tint.height=256;board.width=1600;board.height=660;const ctx=board.getContext('2d');ctx.fillStyle='#dde5c6';ctx.fillRect(0,0,1600,660);ctx.font='18px sans-serif';
  try{
   for(const [id,key]of Object.entries(d.bodySources)){const spec=d.sources[key],value=await loadCharacterImageSource(`/art/characters/broad-v1/source-${spec.sha256}.png`,{sha256:spec.sha256,decoder:'bitmap'});loaded.push(value);sources[id]=value;}
   body=await prepareBodyFamily({ownership:d.ownership,sources});if(canonical(body.binding)!==canonical(intent.body))throw Error('The current body differs from the frozen garment guide');bindComposedRuntimeRaster(d,body);model=await createFamilyBodyMaterialModel(body,d.materials,{maxFrames:1});shirt=await loadCharacterImageSource('/pose-shirt.png',{sha256:hash,decoder:'bitmap'});
   const raw=body.frameForPose(sheet,index),original=raw.getContext('2d').getImageData(0,0,256,256),mask=model.mask(sheet,index),paint=tintBodyMaterials(original,mask,{skin:'warm',shirt:'indigo',shorts:'sage',shoes:'brown'});tint.getContext('2d').putImageData(new ImageData(paint.data,256,256),0,0);const baseline=tint.getContext('2d').getImageData(0,0,256,256).data,runs=[];
   const protectedPixel=p=>mask.labels[p]===3||mask.labels[p]===4||Math.floor(p/256)>=140;
   for(let p=0;p<65536;){if(!protectedPixel(p)){p++;continue;}const start=p;while(p<65536&&protectedPixel(p))p++;runs.push([start,p-start]);}
   const ownership={schema:1,body:body.binding,sheet,index,bodyFrameSha256:body.binding.frames[sheet][index],foreground:null,preservedBody:{schema:2,body:body.binding,sheet,index,size:256,runs}},registration={schema:1,body:body.binding,scale:crop[2]/tile[2],sources:{shirt:{sha256:hash,width:1254,height:1254}},poses:[{sheet,index,parts:[{source:'shirt',rect:tile,offset:crop.slice(0,2)}]}]};
   const draw=(frame,col,label)=>{ctx.drawImage(frame,col*320+32,28);ctx.drawImage(frame,70,45,120,100,col*320+32,340,256,213);ctx.fillStyle='#283e32';ctx.fillText(label,col*320+20,22);ctx.fillText('Collar / shoulder detail',col*320+20,590);};draw(tint,0,'Underlying indigo tank');let restoredChannels=0;
   for(const [col,colour]of ['cream','teal','terracotta','indigo'].entries()){
    let frame;try{({frame}=await composeClothingPose({body:raw,appearanceBody:tint,binding:body.binding,sheet,index,atlas:{registration,sources:{shirt}},ownership,colour}));const pixels=frame.getContext('2d').getImageData(0,0,256,256).data;for(const [start,length]of runs)for(let p=start;p<start+length;p++)for(let c=0;c<4;c++){if(pixels[p*4+c]!==baseline[p*4+c])throw Error('Walking shirt altered protected lower-body pixels');restoredChannels++;}draw(frame,col+1,colour);}finally{if(frame)frame.width=frame.height=0;}
   }
   return {sheet,index,sourceHash:hash,registration,ownership,restoredChannels,contact:body.contactForPose(sheet,index),png:board.toDataURL().split(',')[1],scope:'One internal walking pose, four shirt palettes, no hair/accessory or animation acceptance'};
  }finally{tint.width=tint.height=board.width=board.height=0;model?.clear();body?.dispose();shirt?.dispose();for(const value of loaded)value.dispose();}
 },{intent,hash});assert(result.restoredChannels>0);await writeFile(root+'/coloured-body-review-v1.png',Buffer.from(result.png,'base64'));delete result.png;await writeFile(root+'/body-review-v1.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({sheet:result.sheet,index:result.index,restoredChannels:result.restoredChannels,contact:result.contact}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
