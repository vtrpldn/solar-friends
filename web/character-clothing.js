import {auditCharacterPartRegion} from './character-parts.js';
import {registeredBodyAppearance} from './character-body-appearance.js';
import {validateAttachmentBinding} from './character-attachments.js';
import {validateBodyForegroundMask} from './character-foreground-mask.js';
import {clothingColourImage} from './character-clothing-colour.js';
import {composeAtlasClothingPose} from './character-atlas-clothing.js';
// Clothing changes the silhouette; colour-only body validation must stay strict.
// Every garment instead inherits a fixed source tile and native body-pose crop.
// This first source family remains internal until all animation poses exist.
export function composeClothingPose({body,appearanceBody,binding,image,sourceHash,registration,sheet,index,colourSource,atlas,ownership,colour}){
 if(atlas!==undefined)return composeAtlasClothingPose({body,appearanceBody,binding,atlas,ownership,sheet,index,colour});
 validateAttachmentBinding(binding);
 const r=registration,crop=r?.crop,rect=r?.source?.rect;
 if(r?.reviewSchema!==1||r.part!=='short-sleeve-v1'||r.sheet!==sheet||r.index!==index||!['base','idle','activities'].includes(sheet)||!Number.isInteger(index)||index<0||index>15||r.bodyFrameSha256!==binding.frames[sheet][index])throw Error('Use the garment registered to this original body pose.');
 const square=(value,size)=>Array.isArray(value)&&value.length===4&&Array.from(value).every(Number.isSafeInteger)&&value[0]>=0&&value[1]>=0&&value[2]>0&&value[2]===value[3]&&value[0]+value[2]<=size&&value[1]+value[3]<=size;
 if(!square(crop,256)||!square(rect,1254))throw Error('Use the original fixed garment crop and source cell.');
 if(r.source.size!==1254||!/^[a-f0-9]{64}$/.test(sourceHash??'')||sourceHash!==r.source.sha256||image?.naturalWidth!==1254||image?.naturalHeight!==1254||body?.width!==256||body?.height!==256)throw Error('Use the exact registered garment source and complete body frame.');
 const garmentImage=clothingColourImage(colourSource,image,sourceHash);
 const foreground=r.foreground===undefined?null:validateBodyForegroundMask(r.foreground,binding,sheet,index);
 if(foreground&&foreground.schema!==2)throw Error('Garment foreground requires registered native pixel ownership.');
 const preserved=r.preservedBody===undefined?null:validateBodyForegroundMask(r.preservedBody,binding,sheet,index);
 if(preserved&&preserved.schema!==2)throw Error('Preserved body parts require registered native pixel ownership.');
 // Audit exactly the registered source cell; painting the unused atlas
 // area only increases temporary allocation and CPU raster work.
 const painted=registeredBodyAppearance(body,appearanceBody),probe=document.createElement('canvas');probe.width=rect[2];probe.height=rect[3];
 try{
  const context=probe.getContext('2d',{willReadFrequently:true});context.drawImage(image,-rect[0],-rect[1]);
  const audit=auditCharacterPartRegion(context.getImageData(0,0,rect[2],rect[3]),r.bounds);if(!audit.ok)throw Error('Garment paint leaves its authored region.');
  const frame=document.createElement('canvas');frame.width=frame.height=256;const ctx=frame.getContext('2d');
  let front=null;
  try{
   if(foreground){
    const original=painted.getContext('2d').getImageData(0,0,256,256),backPixels=new ImageData(original.data.slice(),256,256),frontPixels=new ImageData(256,256);
    for(const [start,length]of foreground.runs)for(let p=start;p<start+length;p++)for(let k=0;k<4;k++){frontPixels.data[p*4+k]=original.data[p*4+k];backPixels.data[p*4+k]=0;}
    ctx.putImageData(backPixels,0,0);front=document.createElement('canvas');front.width=front.height=256;front.getContext('2d').putImageData(frontPixels,0,0);
   }else ctx.drawImage(painted,0,0);
   ctx.drawImage(garmentImage,...rect,...crop);
   if(front)ctx.drawImage(front,0,0);
   // A registered top may not recolour owned trousers/shoes through a faint
   // antialiased fringe. Restore exact appearance pixels, including edge alpha;
   // source-over would blend those partial-alpha boundary pixels a second time.
   if(preserved){
    const original=painted.getContext('2d').getImageData(0,0,256,256),result=ctx.getImageData(0,0,256,256);
    for(const [start,length]of preserved.runs)for(let p=start;p<start+length;p++)for(let k=0;k<4;k++)result.data[p*4+k]=original.data[p*4+k];
    ctx.putImageData(result,0,0);
   }
   return {frame,audit};
  }
  catch(error){frame.width=frame.height=0;throw error;}
  finally{if(front)front.width=front.height=0;}
 }finally{probe.width=probe.height=0;}
}
