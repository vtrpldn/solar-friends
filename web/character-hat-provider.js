import {hatReviewClips} from './character-hat-poses.js';
import {composeHatClipFrame} from './character-hat.js';
// Includes the equipment return frames as well as every main body pose.
export function composeHatProvider({provider,binding,registrations,image,sourceHash}){
 if(provider?.animationProfile!=='neutral-v1'||provider.interpolation!=='keyframes'||typeof provider.frameForPose!=='function'||!(registrations instanceof Map)||registrations.size!==Object.keys(hatReviewClips).length)throw Error('Provide the complete registered neutral-body hat set.');
 const frames=new Map(),returns=new Map();
 for(const [clip,spec]of Object.entries(hatReviewClips)){
  const registration=registrations.get(clip);
  if(registration?.clip!==clip)throw Error('Hat activity registration is missing.');
  for(const index of spec.indices){
   const key=spec.sheet+':'+index;
   if(frames.has(key))throw Error('Hat activity registrations overlap.');
   const compose=pose=>composeHatClipFrame({appearanceFrame:provider.frameForPose(spec.sheet,index,pose),binding,registration,image,sourceHash,sheet:spec.sheet,index});
   frames.set(key,compose());
   if(spec.sheet==='activities'&&[13,14].includes(index))returns.set(index,compose({sequenceIndex:5}));
  }
 }
 if(frames.size!==48||returns.size!==2)throw Error('Hat poses and feeding returns are incomplete.');
 return Object.freeze({interpolation:'keyframes',animationProfile:'neutral-v1',frameForPose(sheet,index,pose){
  const key=sheet+':'+index;
  if(!frames.has(key))throw Error('This hat has no registered artwork for the requested pose.');
  return sheet==='activities'&&pose?.sequenceIndex>=4?returns.get(index)??frames.get(key):frames.get(key);
 }});
}
