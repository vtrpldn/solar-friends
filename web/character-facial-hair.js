import {residentClips} from './resident-animation.js';
import {auditCharacterPartRegion} from './character-parts.js';
// Pose-bound composition shared by bundled facial parts and internal art review.
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
 if(!['work','walk','breathe','sit','sleep','look','wave','relax','stretch','cook','water','tend','feed'].includes(clip))throw Error('This facial animation set is not available.');
 const spec=residentClips[clip],indices=[...new Set(spec.frames.map(frame=>spec.row*4+frame))];
 if(provider?.animationProfile!=='neutral-v1'||typeof provider.frameForPose!=='function'||!(entries instanceof Map)||entries.size!==indices.length||indices.some(index=>!entries.has(index)))throw Error('Provide every registered pose for this facial animation.');
 const frames=new Map(),returns=new Map(),returnIndices=clip==='feed'?[13,14]:[];
 try{for(const index of indices){
  const entry=entries.get(index),result=composeFacialHairPose({...entry,binding,appearanceFrame:provider.frameForPose(spec.sheet,index),sheet:spec.sheet,index});frames.set(index,result.frame);
 }
 for(const index of returnIndices){
  const entry=entries.get(index),result=composeFacialHairPose({...entry,binding,appearanceFrame:provider.frameForPose(spec.sheet,index,{sequenceIndex:4}),sheet:spec.sheet,index});returns.set(index,result.frame);
 }}catch(error){for(const frame of [...frames.values(),...returns.values()])frame.width=frame.height=0;throw error;}
 let disposed=false;
 return Object.freeze({animationProfile:'neutral-v1',interpolation:'keyframes',frameForPose(sheet,index,pose){if(disposed||sheet!==spec.sheet||!frames.has(index))throw Error('This facial set has no registered artwork for the requested pose.');return pose?.sequenceIndex>=4?returns.get(index)??frames.get(index):frames.get(index);},cacheInfo:()=>({entries:frames.size+returns.size,maximum:indices.length+returnIndices.length,rgbaByteUpperBound:(frames.size+returns.size)*256*256*4}),dispose(){if(disposed)return;disposed=true;for(const frame of [...frames.values(),...returns.values()])frame.width=frame.height=0;frames.clear();returns.clear();}});
}

export function composeWorkingFacialHair(args){return composeFacialHairClip({...args,clip:'work'});}

// Complete internal review provider: transitions may request any body pose.
// It owns its overlays, but never owns or disposes the underlying body provider.
export function composeFacialHairProvider({provider,binding,entries}){
 const keys=['base','idle','activities'].flatMap(sheet=>Array.from({length:16},(_,index)=>sheet+':'+index));
 if(provider?.animationProfile!=='neutral-v1'||provider.interpolation!=='keyframes'||typeof provider.frameForPose!=='function'||!(entries instanceof Map)||entries.size!==48||keys.some(key=>!entries.has(key)))throw Error('Provide the complete registered facial-hair body set.');
 const frames=new Map(),returns=new Map();
 const compose=(sheet,index,pose)=>composeFacialHairPose({...entries.get(sheet+':'+index),binding,appearanceFrame:provider.frameForPose(sheet,index,pose),sheet,index}).frame;
 try{
  for(const key of keys){const [sheet,index]=key.split(':');frames.set(key,compose(sheet,Number(index)));}
  for(const index of [13,14])returns.set(index,compose('activities',index,{sequenceIndex:4}));
 }catch(error){for(const frame of [...frames.values(),...returns.values()])frame.width=frame.height=0;throw error;}
 let disposed=false;
 return Object.freeze({animationProfile:'neutral-v1',interpolation:'keyframes',frameForPose(sheet,index,pose){
  const key=sheet+':'+index;
  if(disposed||typeof sheet!=='string'||!Number.isInteger(index)||index<0||index>15||!frames.has(key))throw Error('This facial appearance has no registered artwork for the requested pose.');
  return sheet==='activities'&&pose?.sequenceIndex>=4?returns.get(index)??frames.get(key):frames.get(key);
 },cacheInfo:()=>({entries:frames.size+returns.size,maximum:50,rgbaByteUpperBound:(frames.size+returns.size)*256*256*4}),dispose(){
  if(disposed)return;disposed=true;
  for(const frame of [...frames.values(),...returns.values()])frame.width=frame.height=0;
  frames.clear();returns.clear();
 }});
}
