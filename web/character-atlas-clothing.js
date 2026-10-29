import {canonical} from './editor/journal.js';
import {validateAttachmentBinding} from './character-attachments.js';
import {registeredBodyAppearance} from './character-body-appearance.js';
import {validateBodyForegroundMask} from './character-foreground-mask.js';
import {paintRegisteredEquipmentAtlas} from './character-equipment-atlas.js';
import {tintClothingPixels,validateClothingColour} from './character-clothing-colour.js';

// Garments may change the silhouette. Source placement stays registered; hands,
// neck and lower garments retain explicitly owned appearance pixels exactly.
export async function composeAtlasClothingPose({body,appearanceBody,binding,atlas,ownership,sheet,index,colour='cream'}){
 binding=structuredClone(binding);ownership=structuredClone(ownership);
 atlas={registration:structuredClone(atlas?.registration),sources:Object.fromEntries(Object.entries(atlas?.sources??{}).map(([id,source])=>[id,{sourceHash:source?.sourceHash,image:source?.image}]))};
 validateAttachmentBinding(binding);
 validateClothingColour(colour);
 if(body?.width!==256||body?.height!==256||ownership?.schema!==1||canonical(ownership.body)!==canonical(binding)||ownership.sheet!==sheet||ownership.index!==index||ownership.bodyFrameSha256!==binding?.frames?.[sheet]?.[index]||Object.keys(ownership).sort().join(',')!=='body,bodyFrameSha256,foreground,index,preservedBody,schema,sheet')throw Error('Use garment ownership bound to this exact body pose.');
 const masks=['foreground','preservedBody'].map(key=>{
  if(ownership[key]===null)return null;
  const mask=validateBodyForegroundMask(ownership[key],binding,sheet,index);
  if(mask.schema!==2)throw Error('Garments require exact native pixel ownership.');
  return mask;
 });
 const painted=registeredBodyAppearance(body,appearanceBody),original=painted.getContext('2d').getImageData(0,0,256,256);
 const raw=body.getContext('2d').getImageData(0,0,256,256),digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',raw.data))].map(n=>n.toString(16).padStart(2,'0')).join('');
 if(digest!==ownership.bodyFrameSha256)throw Error('The garment body pixels changed after registration.');
 let garment=null,frame=null;
 try{
  garment=paintRegisteredEquipmentAtlas({binding,registration:atlas?.registration,sources:atlas?.sources,sheet,index});
  const gc=garment.getContext('2d'),tinted=tintClothingPixels(gc.getImageData(0,0,256,256),colour);gc.putImageData(new ImageData(tinted.data,256,256),0,0);
  frame=document.createElement('canvas');frame.width=frame.height=256;const ctx=frame.getContext('2d');ctx.putImageData(original,0,0);ctx.drawImage(garment,0,0);
  const result=ctx.getImageData(0,0,256,256);
  // Restore RGBA rather than source-over: antialiased shoes, trouser hems and
  // crossing hands must not acquire the garment's colour or extra opacity.
  for(const mask of masks)if(mask)for(const [start,length]of mask.runs)for(let p=start;p<start+length;p++)for(let c=0;c<4;c++)result.data[p*4+c]=original.data[p*4+c];
  ctx.putImageData(result,0,0);return {frame};
 }catch(error){if(frame)frame.width=frame.height=0;throw error;}
 finally{if(garment)garment.width=garment.height=0;}
}
