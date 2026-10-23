import {registeredBodyAppearance} from './character-body-appearance.js';
import {canonical} from './editor/journal.js';
import {auditCharacterPartRegion} from './character-parts.js';
import {createBodyForegroundLayers} from './character-foreground.js';
import {validateHairColour,tintHairPixels} from './character-hair-colours.js';
export async function registeredHairFrame({body,binding,registration,image,sourceHash,appearanceBody,hairColour='chestnut'}){
 validateHairColour(hairColour);
 if(registration.schema!==1||!['base','idle','activities'].includes(registration.sheet)||!Number.isInteger(registration.index)||registration.index<0||registration.index>15||registration.size!==1254||!/^[a-f0-9]{64}$/.test(sourceHash??'')||registration.partSha256!==sourceHash||canonical(registration.body)!==canonical(binding)||body.width!==256||body.height!==256||image.width!==1254||image.height!==1254)throw Error('Review the changed hair/body registration before composing this pose.');
 const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',body.getContext('2d').getImageData(0,0,256,256).data))].map(n=>n.toString(16).padStart(2,'0')).join('');
 if(digest!==binding.frames[registration.sheet][registration.index])throw Error('The prepared body pose changed.');
 const raw=document.createElement('canvas');raw.width=raw.height=1254;const rawContext=raw.getContext('2d');rawContext.drawImage(image,0,0);const pixels=rawContext.getImageData(0,0,1254,1254),audit=auditCharacterPartRegion(pixels,registration.bounds);
 if(!audit.ok)throw Error('This hair layer fails its authored pose bounds.');
 const frame=document.createElement('canvas');frame.width=frame.height=256;
 const paintedBody=registeredBodyAppearance(body,appearanceBody),ctx=frame.getContext('2d'),layers=registration.foreground!==undefined?await createBodyForegroundLayers({body,binding,mask:registration.foreground,sheet:registration.sheet,index:registration.index,appearanceBody:paintedBody}):null;
 const hair=document.createElement('canvas');hair.width=hair.height=256;const hairContext=hair.getContext('2d');hairContext.drawImage(image,0,0,256,256);if(hairColour!=='chestnut'){const painted=tintHairPixels(hairContext.getImageData(0,0,256,256),hairColour);hairContext.putImageData(new ImageData(painted.data,256,256),0,0);}
 ctx.drawImage(layers?layers.back:paintedBody,0,0);ctx.drawImage(hair,0,0);if(layers)ctx.drawImage(layers.front,0,0);
 frame.dataset.partCoverage=String(audit.coverage);
 return frame;
}
