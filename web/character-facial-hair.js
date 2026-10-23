import {residentClips} from './resident-animation.js';
import {auditCharacterPartRegion} from './character-parts.js';
// Internal art-review compositor. Public recipes do not expose incomplete parts.
// The crop comes from the original body reference, never from painted bounds.
export function composeFacialHairPose({appearanceFrame,image,sourceHash,binding,registration,sheet,index}){
 const r=registration,crop=r?.crop;
 if(r?.reviewSchema!==1||r.part!=='short-beard'||r.sheet!==sheet||r.index!==index||!['base','idle','activities'].includes(sheet)||!Number.isInteger(index)||index<0||index>15||!/^[a-f0-9]{64}$/.test(r.bodyFrameSha256)||r.bodyFrameSha256!==binding?.frames?.[sheet]?.[index])throw Error('Use the registered facial pose and original body binding.');
 if(!Array.isArray(crop)||crop.length!==4||Array.from(crop).some(n=>!Number.isFinite(n))||crop[0]<0||crop[1]<0||crop[2]<=0||crop[3]<=0||crop[2]!==crop[3]||crop[0]+crop[2]>256||crop[1]+crop[3]>256)throw Error('Use the square face crop authored from the original body frame.');
 if(r.source?.size!==1254||!/^[a-f0-9]{64}$/.test(r.source?.sha256)||r.source.sha256!==sourceHash||image?.naturalWidth!==1254||image?.naturalHeight!==1254||appearanceFrame?.width!==256||appearanceFrame?.height!==256)throw Error('Facial hair requires its exact source pixels and complete body frame.');
 const rect=r.source.rect===undefined?[0,0,1254,1254]:r.source.rect;
 if(!Array.isArray(rect)||rect.length!==4||Array.from(rect).some(n=>!Number.isSafeInteger(n))||rect[0]<0||rect[1]<0||rect[2]<=0||rect[2]!==rect[3]||rect[0]+rect[2]>1254||rect[1]+rect[3]>1254)throw Error('Use the square source tile authored for this facial pose.');
 const assembly=document.createElement('canvas');assembly.width=assembly.height=1254;const context=assembly.getContext('2d');
 try{
  context.drawImage(image,0,0);const audit=auditCharacterPartRegion(context.getImageData(...rect),r.bounds);
  if(!audit.ok)throw Error('Facial-hair paint leaves its authored region.');
  context.clearRect(0,0,1254,1254);const scale=1254/256;context.drawImage(image,...rect,...crop.map(n=>n*scale));
  const frame=document.createElement('canvas');frame.width=frame.height=256;const ctx=frame.getContext('2d');ctx.drawImage(appearanceFrame,0,0);ctx.drawImage(assembly,0,0,256,256);return {frame,audit};
 }finally{assembly.width=assembly.height=0;}
}

// A partial facial set must never fall back to a bare face mid-animation.
export function composeFacialHairClip({provider,binding,entries,clip}){
 if(!['work','walk','breathe','sit','sleep','look'].includes(clip))throw Error('This facial animation set is not available.');
 const spec=residentClips[clip],indices=[...new Set(spec.frames.map(frame=>spec.row*4+frame))];
 if(provider?.animationProfile!=='neutral-v1'||typeof provider.frameForPose!=='function'||!(entries instanceof Map)||entries.size!==indices.length||indices.some(index=>!entries.has(index)))throw Error('Provide every registered pose for this facial animation.');
 const frames=new Map();
 try{for(const index of indices){
  const entry=entries.get(index),result=composeFacialHairPose({...entry,binding,appearanceFrame:provider.frameForPose(spec.sheet,index),sheet:spec.sheet,index});frames.set(index,result.frame);
 }}catch(error){for(const frame of frames.values())frame.width=frame.height=0;throw error;}
 let disposed=false;
 return Object.freeze({animationProfile:'neutral-v1',interpolation:'keyframes',frameForPose(sheet,index){if(disposed||sheet!==spec.sheet||!frames.has(index))throw Error('This facial set has no registered artwork for the requested pose.');return frames.get(index);},cacheInfo:()=>({entries:frames.size,maximum:indices.length,rgbaByteUpperBound:frames.size*256*256*4}),dispose(){if(disposed)return;disposed=true;for(const frame of frames.values())frame.width=frame.height=0;frames.clear();}});
}

export function composeWorkingFacialHair(args){return composeFacialHairClip({...args,clip:'work'});}
