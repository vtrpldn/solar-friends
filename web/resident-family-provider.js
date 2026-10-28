import {copyResidentShadow} from './resident-shadow-metadata.js';
// Retain complete native artwork and fixed per-pose contacts before releasing
// an internal family lease. Neither frames nor metadata depend on its lifetime.
export function copyResidentFamilyProvider(provider){
 if(typeof provider?.frameForPose!=='function'||provider.contactForPose!==undefined&&typeof provider.contactForPose!=='function'||provider.shadowForPose!==undefined&&typeof provider.shadowForPose!=='function')throw Error('Copy a complete prepared resident provider.');
 const frames=new Map(),returns=new Map(),contacts=new Map(),shadows=new Map(),owned=[];
 const copy=source=>{if(source?.width!==256||source?.height!==256)throw Error('Resident frames must retain their native size.');const canvas=document.createElement('canvas');canvas.width=canvas.height=256;owned.push(canvas);const context=canvas.getContext('2d');if(!context)throw Error('Cannot prepare this resident preview.');context.drawImage(source,0,0);return canvas;};
 try{
  for(const sheet of ['base','idle','activities'])for(let index=0;index<16;index++){
   const key=sheet+':'+index;frames.set(key,copy(provider.frameForPose(sheet,index)));
   const contact=provider.contactForPose?.(sheet,index);const shadow=copyResidentShadow(provider.shadowForPose?.(sheet,index));if(shadow!==undefined){if(contact===undefined)throw Error('Retain shadow metadata with its pose contact.');shadows.set(key,shadow);}
   if(contact!==undefined){if(!Array.isArray(contact)||contact.length!==2||![contact[0],contact[1]].every(n=>Number.isFinite(n)&&n>=0&&n<=256))throw Error('Retain only registered native pose contacts.');contacts.set(key,Object.freeze([...contact]));}
  }
  for(const index of [13,14])returns.set(index,copy(provider.frameForPose('activities',index,{sequenceIndex:5})));
  const keyFor=(sheet,index)=>{const key=sheet+':'+index;if(!Number.isSafeInteger(index)||!frames.has(key))throw Error('Choose a registered resident pose.');return key;};
  return Object.freeze({interpolation:'keyframes',animationProfile:'neutral-v1',...(shadows.size?{shadowForPose(sheet,index){return copyResidentShadow(shadows.get(keyFor(sheet,index)));}}:{}),...(contacts.size?{contactForPose(sheet,index){const value=contacts.get(keyFor(sheet,index));return value?[...value]:undefined;}}:{}),frameForPose(sheet,index,pose){const frame=frames.get(keyFor(sheet,index));return sheet==='activities'&&pose?.sequenceIndex>=4?returns.get(index)??frame:frame;}});
 }catch(error){for(const canvas of owned)canvas.width=canvas.height=0;throw error;}
}
