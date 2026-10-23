import {hatReviewClip} from './character-hat-poses.js';
import {auditCharacterPartRegion} from './character-parts.js';
import {canonical} from './editor/journal.js';
function prepareSource({binding,source,image,sourceHash}){
 if(source.reviewSchema!==1||source.sheet!=='base'||source.index!==8||source.size!==1254||source.sha256!==sourceHash||canonical(source.body)!==canonical(binding)||image.width!==1254||image.height!==1254)throw Error('Use the registered hat source and body binding.');
 const canvas=document.createElement('canvas');canvas.width=canvas.height=1254;const context=canvas.getContext('2d');context.drawImage(image,0,0);let audit;
 try{audit=auditCharacterPartRegion(context.getImageData(0,0,1254,1254),source.bounds);}finally{canvas.width=canvas.height=0;}
 if(!audit.ok)throw Error('Hat paint leaves the registered head region.');
 const normalized=document.createElement('canvas');normalized.width=normalized.height=256;normalized.getContext('2d').drawImage(image,0,0,256,256);
 return {normalized,coverage:audit.coverage};
}
function overlay(appearanceFrame,offset,{normalized,coverage}){
 if(appearanceFrame?.width!==256||appearanceFrame?.height!==256)throw Error('Use a complete resident appearance frame.');
 const frame=document.createElement('canvas');frame.width=frame.height=256;const ctx=frame.getContext('2d');ctx.drawImage(appearanceFrame,0,0);ctx.drawImage(normalized,...offset);frame.dataset.partCoverage=String(coverage);return frame;
}
export function composeHatPrototypeFrame({appearanceFrame,binding,registration,image,sourceHash,sheet='base',index=8}){
 if(sheet!=='base'||index!==8)throw Error('This prototype supports only the registered standing pose.');
 return overlay(appearanceFrame,[0,0],prepareSource({binding,source:registration,image,sourceHash}));
}
export function composeHatBreatheFrame(args){if(args.registration.clip!=='breathe')throw Error('Use the registered breathing hat poses.');return composeHatClipFrame(args);}
function validatePose({binding,registration,sheet,index}){
 const spec=hatReviewClip(registration.clip);
 const pose=registration.poses?.[index],point=value=>Array.isArray(value)&&value.length===2&&Array.from(value).every(n=>Number.isInteger(n)&&n>=0&&n<=256);
 if(registration.reviewSchema!==1||registration.animationProfile!=='neutral-v1'||registration.sheet!==spec.sheet||sheet!==spec.sheet||!spec.indices.includes(index)||registration.coordinateSize!==256||Object.keys(registration.poses??{}).sort().join(',')!==spec.indices.map(String).sort().join(',')||!point(registration.anchorHead)||!point(pose?.head)||!Array.isArray(pose?.translation)||pose.translation.length!==2||Array.from(pose.translation).some((n,i)=>!Number.isInteger(n)||Math.abs(n)>spec.maxOffset||n!==pose.head[i]-registration.anchorHead[i])||pose.bodyFrameSha256!==binding?.frames?.[spec.sheet]?.[index])throw Error('Use all four registered activity poses and their authored head placements.');

 return pose.translation;
}
// Snapshot source identity before composing the fifty output frames. Each clip
// still checks its complete source registration and individual body-frame fit.
export function prepareHatClipComposer({binding,source,image,sourceHash}){
 const sourceIdentity=canonical(source),prepared=prepareSource({binding,source,image,sourceHash});
 return ({appearanceFrame,registration,sheet,index})=>{
  if(canonical(registration.source)!==sourceIdentity)throw Error('Hat activity names a different source registration.');
  const offset=validatePose({binding,registration,sheet,index});
  return overlay(appearanceFrame,offset,prepared);
 };
}
export function composeHatClipFrame(args){
 return prepareHatClipComposer({...args,source:args.registration.source})(args);
}
