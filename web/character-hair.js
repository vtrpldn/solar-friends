import {registeredBodyAppearance} from './character-body-appearance.js';
import {canonical} from './editor/journal.js';
import {auditCharacterPartRegion} from './character-parts.js';
import {createBodyForegroundLayers} from './character-foreground.js';
import {validateHairColour,tintHairPixels} from './character-hair-colours.js';
// Capture one validated source at the shared sprite resolution. The private
// normalized canvas and copied registration cannot be changed by callers.
// Bodies/coloured bodies are still validated on every composition.
export function prepareRegisteredHair({registration,image,sourceHash}){
 if(registration.schema!==1||!['base','idle','activities'].includes(registration.sheet)||!Number.isInteger(registration.index)||registration.index<0||registration.index>15||registration.size!==1254||!/^[a-f0-9]{64}$/.test(sourceHash??'')||registration.partSha256!==sourceHash||image.width!==1254||image.height!==1254)throw Error('Review the changed hair/body registration before composing this pose.');
 const checked=structuredClone(registration),raw=document.createElement('canvas');raw.width=raw.height=1254;let audit;
 try{const context=raw.getContext('2d');context.drawImage(image,0,0);audit=auditCharacterPartRegion(context.getImageData(0,0,1254,1254),checked.bounds);}finally{raw.width=raw.height=0;}
 if(!audit.ok)throw Error('This hair layer fails its authored pose bounds.');
 const normalized=document.createElement('canvas');normalized.width=normalized.height=256;normalized.getContext('2d').drawImage(image,0,0,256,256);
 return Object.freeze({async compose({body,binding,appearanceBody,hairColour='chestnut'}){
  validateHairColour(hairColour);
  if(canonical(checked.body)!==canonical(binding)||body.width!==256||body.height!==256)throw Error('Review the changed hair/body registration before composing this pose.');
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',body.getContext('2d').getImageData(0,0,256,256).data))].map(n=>n.toString(16).padStart(2,'0')).join('');
  if(digest!==binding.frames[checked.sheet][checked.index])throw Error('The prepared body pose changed.');
  const frame=document.createElement('canvas');frame.width=frame.height=256;
  const paintedBody=registeredBodyAppearance(body,appearanceBody),ctx=frame.getContext('2d'),layers=checked.foreground!==undefined?await createBodyForegroundLayers({body,binding,mask:checked.foreground,sheet:checked.sheet,index:checked.index,appearanceBody:paintedBody}):null;
  let hair=normalized;
  if(hairColour!=='chestnut'){hair=document.createElement('canvas');hair.width=hair.height=256;const painted=tintHairPixels(normalized.getContext('2d').getImageData(0,0,256,256),hairColour);hair.getContext('2d').putImageData(new ImageData(painted.data,256,256),0,0);}
  ctx.drawImage(layers?layers.back:paintedBody,0,0);ctx.drawImage(hair,0,0);if(layers)ctx.drawImage(layers.front,0,0);
  frame.dataset.partCoverage=String(audit.coverage);
  return frame;
 }});
}
export async function registeredHairFrame(args){
 validateHairColour(args.hairColour??'chestnut');
 return prepareRegisteredHair(args).compose(args);
}
