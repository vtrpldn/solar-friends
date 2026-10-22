import {canonical} from './editor/journal.js';
import {createBodyForegroundLayers} from './character-foreground.js';
import {paintEquipmentArt} from './character-equipment-parts.js';
// Equipment remains in the original full-frame coordinate space. No automatic
// silhouette fitting, hand snapping, body repainting or fallback poses.
export async function registeredEquipmentFrame({body,binding,appearanceBody=body,appearanceFrame=appearanceBody,equipment,registration,sheet,index}){
 if(![1,2].includes(registration?.schema)||registration.sheet!==sheet||registration.index!==index||canonical(registration.body)!==canonical(binding)||registration.source?.sha256!==equipment?.sourceHash||!/^[a-f0-9]{64}$/.test(equipment?.sourceHash??'')||equipment?.image?.naturalWidth!==registration.source.width||equipment?.image?.naturalHeight!==registration.source.height||registration.source.width!==registration.source.height||registration.source.width<256||registration.source.width>2048)throw Error('This equipment artwork is not registered to the exact body pose.');
 if(appearanceFrame?.width!==256||appearanceFrame?.height!==256)throw Error('Equipment requires the shared prepared appearance frame.');
 const {front}=await createBodyForegroundLayers({body,binding,appearanceBody,mask:registration.foreground,sheet,index});
 const tool=paintEquipmentArt(equipment,registration);
 const pixels=appearanceFrame.getContext('2d').getImageData(0,0,256,256),hands=front.getContext('2d').getImageData(0,0,256,256).data;
 for(let offset=0;offset<hands.length;offset+=4)if(hands[offset+3]){
  for(let c=0;c<4;c++)if(pixels.data[offset+c]!==hands[offset+c])throw Error('The equipment foreground overlaps another appearance part.');
  for(let c=0;c<4;c++)pixels.data[offset+c]=0;
 }
 const result=document.createElement('canvas');result.width=result.height=256;const ctx=result.getContext('2d');ctx.putImageData(pixels,0,0);ctx.drawImage(tool,0,0);ctx.drawImage(front,0,0);return result;
}
