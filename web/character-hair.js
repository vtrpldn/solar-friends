import {registeredBodyAppearance} from './character-body-appearance.js';
import {canonical} from './editor/journal.js';
import {auditCharacterPartRegion} from './character-parts.js';
import {createBodyForegroundLayers} from './character-foreground.js';
import {validateHairColour,tintHairPixels} from './character-hair-colours.js';
import {composeClothingPose} from './character-clothing.js';
import {registeredHairPlacement,verifyHairPlacementBodies} from './character-hair-placement.js';
// Capture one validated source at the shared sprite resolution. The private
// normalized canvas and copied registration cannot be changed by callers.
// Bodies/coloured bodies are still validated on every composition.
export function prepareRegisteredHair({registration,image,sourceHash}){
 if(registration.schema!==1||!['base','idle','activities'].includes(registration.sheet)||!Number.isInteger(registration.index)||registration.index<0||registration.index>15||registration.size!==1254||!/^[a-f0-9]{64}$/.test(sourceHash??'')||registration.partSha256!==sourceHash||image.width!==1254||image.height!==1254)throw Error('Review the changed hair/body registration before composing this pose.');
 const checked=structuredClone(registration),placement=registeredHairPlacement(checked),raw=document.createElement('canvas');raw.width=raw.height=1254;let audit;
 try{const context=raw.getContext('2d');context.drawImage(image,0,0);audit=auditCharacterPartRegion(context.getImageData(0,0,1254,1254),checked.bounds);}finally{raw.width=raw.height=0;}
 if(!audit.ok)throw Error('This hair layer fails its authored pose bounds.');
 const normalized=document.createElement('canvas');normalized.width=normalized.height=256;let disposed=false;
 try{normalized.getContext('2d').drawImage(image,0,0,256,256);
 if(placement){
  const data=normalized.getContext('2d').getImageData(0,0,256,256).data,[dx,dy]=placement.offset;
  for(let p=0;p<256*256;p++)if(data[p*4+3]&&(p%256+dx<0||p%256+dx>=256||Math.floor(p/256)+dy<0||Math.floor(p/256)+dy>=256)){normalized.width=normalized.height=0;throw Error('The translated cap would clip actual source paint.');}
 }
 }catch(error){normalized.width=normalized.height=0;throw error;}
 const alive=()=>{if(disposed)throw Error('This prepared hair part has been released.');};
 return Object.freeze({dispose(){if(disposed)return;disposed=true;normalized.width=normalized.height=0;},async compose({body,binding,appearanceBody,hairColour='chestnut',clothing,referenceBody}){
  alive();validateHairColour(hairColour);
  if(canonical(checked.body)!==canonical(binding)||body.width!==256||body.height!==256)throw Error('Review the changed hair/body registration before composing this pose.');
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',body.getContext('2d').getImageData(0,0,256,256).data))].map(n=>n.toString(16).padStart(2,'0')).join('');
  if(digest!==binding.frames[checked.sheet][checked.index])throw Error('The prepared body pose changed.');
  await verifyHairPlacementBodies(placement,body,referenceBody);alive();
  const frame=document.createElement('canvas');frame.width=frame.height=256;
  let layers=null,dressed=null,hair=normalized;
  try{
   const paintedBody=registeredBodyAppearance(body,appearanceBody),ctx=frame.getContext('2d');
   layers=checked.foreground!==undefined?await createBodyForegroundLayers({body,binding,mask:checked.foreground,sheet:checked.sheet,index:checked.index,appearanceBody:paintedBody,clothing}):null;
   alive();dressed=!layers&&clothing?composeClothingPose({...clothing,body,appearanceBody:paintedBody,binding,sheet:checked.sheet,index:checked.index}).frame:null;
   if(hairColour!=='chestnut'){hair=document.createElement('canvas');hair.width=hair.height=256;const painted=tintHairPixels(normalized.getContext('2d').getImageData(0,0,256,256),hairColour);hair.getContext('2d').putImageData(new ImageData(painted.data,256,256),0,0);}
   ctx.drawImage(layers?layers.back:dressed??paintedBody,0,0);ctx.drawImage(hair,...(placement?.offset??[0,0]));if(layers)ctx.drawImage(layers.front,0,0);
   frame.dataset.partCoverage=String(audit.coverage);return frame;
  }catch(error){frame.width=frame.height=0;throw error;}
  finally{
   if(dressed)dressed.width=dressed.height=0;
   if(layers)for(const layer of [layers.back,layers.front])layer.width=layer.height=0;
   if(hair!==normalized)hair.width=hair.height=0;
  }
 }});
}
export async function registeredHairFrame(args){
 validateHairColour(args.hairColour??'chestnut');
 const prepared=prepareRegisteredHair(args);try{return await prepared.compose(args);}finally{prepared.dispose();}
}
