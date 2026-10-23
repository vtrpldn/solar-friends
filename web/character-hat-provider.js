import {hatReviewClips} from './character-hat-poses.js';
import {prepareHatClipComposer} from './character-hat.js';
// Includes the equipment return frames as well as every main body pose.
export function composeHatProvider({provider,binding,registrations,image,sourceHash}){
 if(provider?.animationProfile!=='neutral-v1'||provider.interpolation!=='keyframes'||typeof provider.frameForPose!=='function'||!(registrations instanceof Map)||registrations.size!==Object.keys(hatReviewClips).length)throw Error('Provide the complete registered neutral-body hat set.');
 const composeFrame=prepareHatClipComposer({binding,source:registrations.get('breathe')?.source,image,sourceHash}),frames=new Map(),returns=new Map();
 for(const [clip,spec]of Object.entries(hatReviewClips)){
  const registration=registrations.get(clip);
  if(registration?.clip!==clip)throw Error('Hat activity registration is missing.');
  for(const index of spec.indices){
   const key=spec.sheet+':'+index;
   if(frames.has(key))throw Error('Hat activity registrations overlap.');
   // Do not close over the underlying provider in an inner composer: the
   // returned provider owns only its finished frames, not another full set.
   frames.set(key,composeFrame({appearanceFrame:provider.frameForPose(spec.sheet,index),registration,sheet:spec.sheet,index}));
   if(spec.sheet==='activities'&&[13,14].includes(index))returns.set(index,composeFrame({appearanceFrame:provider.frameForPose(spec.sheet,index,{sequenceIndex:5}),registration,sheet:spec.sheet,index}));
  }
 }
 if(frames.size!==48||returns.size!==2)throw Error('Hat poses and feeding returns are incomplete.');
 return Object.freeze({interpolation:'keyframes',animationProfile:'neutral-v1',frameForPose(sheet,index,pose){
  const key=sheet+':'+index;
  if(!frames.has(key))throw Error('This hat has no registered artwork for the requested pose.');
  return sheet==='activities'&&pose?.sequenceIndex>=4?returns.get(index)??frames.get(key):frames.get(key);
 }});
}
