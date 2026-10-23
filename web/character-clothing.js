import {auditCharacterPartRegion} from './character-parts.js';
import {registeredBodyAppearance} from './character-body-appearance.js';
import {validateAttachmentBinding} from './character-attachments.js';
// Clothing changes the silhouette; colour-only body validation must stay strict.
// Every garment instead inherits a fixed source tile and native body-pose crop.
// This first source family remains internal until all animation poses exist.
export function composeClothingPose({body,appearanceBody,binding,image,sourceHash,registration,sheet,index}){
 validateAttachmentBinding(binding);
 const r=registration,crop=r?.crop,rect=r?.source?.rect;
 if(r?.reviewSchema!==1||r.part!=='short-sleeve-v1'||r.sheet!==sheet||r.index!==index||!['base','idle','activities'].includes(sheet)||!Number.isInteger(index)||index<0||index>15||r.bodyFrameSha256!==binding.frames[sheet][index])throw Error('Use the garment registered to this original body pose.');
 const square=(value,size)=>Array.isArray(value)&&value.length===4&&Array.from(value).every(Number.isSafeInteger)&&value[0]>=0&&value[1]>=0&&value[2]>0&&value[2]===value[3]&&value[0]+value[2]<=size&&value[1]+value[3]<=size;
 if(!square(crop,256)||!square(rect,1254))throw Error('Use the original fixed garment crop and source cell.');
 if(r.source.size!==1254||!/^[a-f0-9]{64}$/.test(sourceHash??'')||sourceHash!==r.source.sha256||image?.naturalWidth!==1254||image?.naturalHeight!==1254||body?.width!==256||body?.height!==256)throw Error('Use the exact registered garment source and complete body frame.');
 const painted=registeredBodyAppearance(body,appearanceBody),probe=document.createElement('canvas');probe.width=probe.height=1254;
 try{
  const context=probe.getContext('2d');context.drawImage(image,0,0);
  const audit=auditCharacterPartRegion(context.getImageData(...rect),r.bounds);if(!audit.ok)throw Error('Garment paint leaves its authored region.');
  const frame=document.createElement('canvas');frame.width=frame.height=256;const ctx=frame.getContext('2d');
  try{ctx.drawImage(painted,0,0);ctx.drawImage(image,...rect,...crop);return {frame,audit};}
  catch(error){frame.width=frame.height=0;throw error;}
 }finally{probe.width=probe.height=0;}
}
