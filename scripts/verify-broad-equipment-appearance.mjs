import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const root='assets/art-direction/character-prototype-v1/body-broad-v1';
const hash=b=>createHash('sha256').update(b).digest('hex');
const read=async n=>JSON.parse(await readFile(`${root}/${n}`));
const definition=await read('composed-family-draft-v2.json'),binding=await read('body-binding-v1.json'),registration=await read('cooking-equipment-atlas-draft-v1.json'),masks=await read('cooking-hand-masks-draft-v1.json'),sources={};
for(const [id,s]of Object.entries(definition.sources)){const bytes=await readFile(s.path);assert.equal(hash(bytes),s.sha256);sources[id]={data:bytes.toString('base64'),sourceHash:s.sha256};}
const tools={};for(const [id,file]of [['pot','cooking-parts-candidate-v1.png'],['spoon','cooking-spoon-angles-candidate-v1.png']]){const b=await readFile(`${root}/${file}`);assert.equal(hash(b),registration.sources[id].sha256);tools[id]={data:b.toString('base64'),sourceHash:hash(b)};}
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/equipment-appearance`);
 const result=await page.evaluate(async({definition,binding,registration,masks,sources,tools})=>{
  const {prepareComposedResidentFamily}=await import('/character-composed-family.js'),{prepareBodyFamily}=await import('/character-body-family.js'),{paintRegisteredEquipmentAtlas}=await import('/character-equipment-atlas.js'),{composeEquipmentAppearance}=await import('/character-equipment-appearance.js'),{drawResidentAnimation}=await import('/resident-animation.js');
  const decode=async map=>{const out={};for(const [id,s]of Object.entries(map)){const image=new Image();image.src='data:image/png;base64,'+s.data;await image.decode();out[id]={image,sourceHash:s.sourceHash};}return out;};
  const checkedCompose=async args=>{const made=[],create=document.createElement.bind(document);document.createElement=(tag,...rest)=>{const value=create(tag,...rest);if(tag==='canvas')made.push(value);return value;};let result;try{result=await composeEquipmentAppearance(args);if(made.some(c=>c!==result.frame&&(c.width||c.height)))throw Error('Equipment composition retained scratch canvases');return result;}catch(error){if(made.some(c=>c.width||c.height))throw Error('Failed equipment composition retained canvases');throw error;}finally{document.createElement=create;}};
  const loaded=await decode(sources),equipmentSources=await decode(tools),body=await prepareBodyFamily({ownership:definition.ownership,sources:Object.fromEntries(Object.entries(definition.bodySources).map(([id,key])=>[id,loaded[key]]))});
  const board=document.createElement('canvas');board.width=1024;board.height=640;const ctx=board.getContext('2d');ctx.fillStyle='#e3d8b6';ctx.fillRect(0,0,board.width,board.height);const scratch=document.createElement('canvas');scratch.width=scratch.height=256;let poses=0,refusals=0;
  try{
   for(const [row,hair]of ['side-part-v1','short-curls-v1'].entries()){
    const recipe={schema:2,family:definition.id,hair,hairColour:'silver',hat:'straw-v1',materials:{skin:'copper',shirt:'teal',shorts:'sage',shoes:'graphite'}},bundle=await prepareComposedResidentFamily({definition,sources:loaded,recipe});
    try{for(let i=0;i<4;i++){
     const appearance=bundle.provider.frameForPose('activities',i),origin=bundle.provider.frameOriginForPose('activities',i),original=appearance.toDataURL(),raw=body.frameForPose('activities',i),originalBody=raw.toDataURL(),tool=paintRegisteredEquipmentAtlas({binding,registration,sources:equipmentSources,sheet:'activities',index:i}),mask={schema:1,body:binding,sheet:'activities',index:i,size:masks.size,polygons:masks.poses[i].polygons};let composed=null;
     try{
      composed=await checkedCompose({body:raw,binding,mask,sheet:'activities',index:i,appearance,origin,equipment:tool});
      if(appearance.toDataURL()!==original||raw.toDataURL()!==originalBody)throw Error('Equipment changed borrowed appearance/body');
      if(composed.origin.join(',')!==origin.join(',')||composed.frame.width!==appearance.width||composed.frame.height!==appearance.height)throw Error('Equipment changed accessory framing');
      const before=appearance.getContext('2d').getImageData(0,0,appearance.width,appearance.height).data,after=composed.frame.getContext('2d').getImageData(0,0,appearance.width,appearance.height).data;
      // Equipment must leave the hat/hair margin above native y=0 unchanged.
      for(let y=0;y< -origin[1];y++)for(let x=0;x<appearance.width;x++)for(let c=0;c<4;c++)if(before[(y*appearance.width+x)*4+c]!==after[(y*appearance.width+x)*4+c])throw Error('Equipment repainted accessory margin');
      const region=document.createElement('canvas');region.width=region.height=256;try{const r=region.getContext('2d');r.scale(256/masks.size,256/masks.size);r.beginPath();for(const polygon of mask.polygons){r.moveTo(...polygon[0]);for(const p of polygon.slice(1))r.lineTo(...p);r.closePath();}r.fill();const cover=r.getImageData(0,0,256,256).data,rawPixels=raw.getContext('2d').getImageData(0,0,256,256).data;for(let y=0;y<256;y++)for(let x=0;x<256;x++){const at=(y*256+x)*4;if(cover[at+3]<128||rawPixels[at+3]!==255)continue;const target=((y-origin[1])*appearance.width+x-origin[0])*4;for(let c=0;c<4;c++)if(before[target+c]!==after[target+c])throw Error('Equipment changed a registered colored hand pixel');}}finally{region.width=region.height=0;}
      drawResidentAnimation(ctx,scratch,{frameForPose:()=>composed.frame,frameOriginForPose:()=>composed.origin,contactForPose:()=>body.contactForPose('activities',i)},{layers:[{sheet:'activities',row:0,frame:i,weight:1}],facing:row?-1:1,breath:1},i*256+128,row*320+285,230);poses++;
      if(row===0&&i===0){for(const change of [a=>a.origin=[1,0],a=>a.equipment=board,a=>a.mask={...mask,index:1},a=>a.binding={...binding,size:255}]){const args={body:raw,binding,mask,sheet:'activities',index:i,appearance,origin,equipment:tool};change(args);let rejected=false,value=null;try{value=await checkedCompose(args);}catch{rejected=true;}finally{if(value)value.frame.width=value.frame.height=0;}if(!rejected)throw Error('Invalid equipment appearance accepted');refusals++;}}
     }finally{tool.width=tool.height=0;if(composed)composed.frame.width=composed.frame.height=0;}
    }}finally{bundle.dispose();}
   }
   return {poses,refusals,borrowedFramesUnchanged:true,framingUnchanged:true,accessoryMarginsUnchanged:true,opaqueColoredHandPixelsUnchanged:true,scratchReleased:true,image:board.toDataURL('image/png').split(',')[1]};
  }finally{body.dispose();board.width=board.height=scratch.width=scratch.height=0;}
 },{definition,binding,registration,masks,sources,tools});
 assert.equal(result.poses,8);assert.equal(result.refusals,4);await writeFile(`${root}/cooking-composed-appearance-v1.png`,Buffer.from(result.image,'base64'));delete result.image;
 const inputs={};for(const p of ['web/character-equipment-appearance.js','web/character-equipment-atlas.js','scripts/verify-broad-equipment-appearance.mjs',`${root}/cooking-hand-masks-draft-v1.json`,`${root}/cooking-equipment-atlas-draft-v1.json`,`${root}/composed-family-draft-v2.json`])inputs[p]=hash(await readFile(p));
 await writeFile(`${root}/cooking-composed-appearance-v1.json`,JSON.stringify({status:'Internal static composed equipment inspected; motion, lighting and public integration pending',...result,inputs},null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
