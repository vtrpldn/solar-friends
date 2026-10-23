import {hatReviewClip} from './character-hat-poses.js';
import {auditCharacterPartRegion} from './character-parts.js';
import {canonical} from './editor/journal.js';
// Composition preserves the authored body and equipment; only the registered hat is overlaid.
export function composeHatPrototypeFrame({appearanceFrame,binding,registration,image,sourceHash,sheet='base',index=8}){
 return composeHatAtOffset({appearanceFrame,binding,registration,image,sourceHash,sheet,index},[0,0]);
}
function composeHatAtOffset({appearanceFrame,binding,registration,image,sourceHash,sheet='base',index=8},offset){
 if(registration.reviewSchema!==1||sheet!=='base'||index!==8||registration.sheet!==sheet||registration.index!==index||registration.size!==1254||registration.sha256!==sourceHash||canonical(registration.body)!==canonical(binding)||appearanceFrame.width!==256||appearanceFrame.height!==256||image.width!==1254||image.height!==1254)throw Error('This hat prototype supports only its registered standing pose.');
 const source=document.createElement('canvas');source.width=source.height=1254;const context=source.getContext('2d');context.drawImage(image,0,0);let audit;try{audit=auditCharacterPartRegion(context.getImageData(0,0,1254,1254),registration.bounds);}finally{source.width=source.height=0;}if(!audit.ok)throw Error('Hat paint leaves the registered head region.');
 const frame=document.createElement('canvas');frame.width=frame.height=256;const ctx=frame.getContext('2d');ctx.drawImage(appearanceFrame,0,0);ctx.drawImage(image,offset[0],offset[1],256,256);frame.dataset.partCoverage=String(audit.coverage);return frame;
}
export function composeHatBreatheFrame(args){if(args.registration.clip!=='breathe')throw Error('Use the registered breathing hat poses.');return composeHatClipFrame(args);}
export function composeHatClipFrame({appearanceFrame,binding,registration,image,sourceHash,sheet,index}){
 const spec=hatReviewClip(registration.clip);
 const pose=registration.poses?.[index],point=value=>Array.isArray(value)&&value.length===2&&Array.from(value).every(n=>Number.isInteger(n)&&n>=0&&n<=256);
 if(registration.reviewSchema!==1||registration.animationProfile!=='neutral-v1'||registration.sheet!==spec.sheet||sheet!==spec.sheet||!spec.indices.includes(index)||registration.coordinateSize!==256||Object.keys(registration.poses??{}).sort().join(',')!==spec.indices.map(String).sort().join(',')||!point(registration.anchorHead)||!point(pose?.head)||!Array.isArray(pose?.translation)||pose.translation.length!==2||Array.from(pose.translation).some((n,i)=>!Number.isInteger(n)||Math.abs(n)>spec.maxOffset||n!==pose.head[i]-registration.anchorHead[i])||pose.bodyFrameSha256!==binding?.frames?.[spec.sheet]?.[index])throw Error('Use all four registered activity poses and their authored head placements.');
 return composeHatAtOffset({appearanceFrame,binding,registration:registration.source,image,sourceHash},pose.translation);
}
