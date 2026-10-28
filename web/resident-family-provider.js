import {copyResidentShadow} from './resident-shadow-metadata.js';
// Retain complete native artwork and pose metadata before releasing an internal
// lease. Transparent margins preserve native coordinates; never resize paint.
export function copyResidentFamilyProvider(provider){
 const extended=provider?.frameOriginForPose!==undefined;
 if(typeof provider?.frameForPose!=='function'||provider.contactForPose!==undefined&&typeof provider.contactForPose!=='function'||provider.shadowForPose!==undefined&&typeof provider.shadowForPose!=='function'||extended&&(typeof provider.frameOriginForPose!=='function'||typeof provider.contactForPose!=='function'))throw Error('Copy a complete prepared resident provider.');
 if(provider.portraitFraming!==undefined&&typeof provider.portraitFraming!=='function')throw Error('Use registered portrait framing.');
 const frames=new Map(),returns=new Map(),owned=[];let hasContacts=extended,hasShadows=false;
 const capture=(sheet,index,pose)=>{
  const source=provider.frameForPose(sheet,index,pose),value=extended?provider.frameOriginForPose(sheet,index,pose):[0,0];
  if(!source||!Number.isInteger(source.width)||!Number.isInteger(source.height)||source.width<256||source.height<256||source.width>512||source.height>512||!extended&&(source.width!==256||source.height!==256)||!Array.isArray(value)||value.length!==2||Array.from(value).some(n=>!Number.isSafeInteger(n)||n>0||n< -128)||value[0]+source.width<256||value[1]+source.height<256)throw Error('Retain bounded resident frames and their native origins.');
  const origin=Object.freeze([...value]),contact=provider.contactForPose?.(sheet,index,pose),shadow=copyResidentShadow(provider.shadowForPose?.(sheet,index,pose));
  if(contact!==undefined&&(!Array.isArray(contact)||contact.length!==2||!Array.from(contact).every(n=>Number.isFinite(n)&&n>=0&&n<=256)))throw Error('Retain only registered native pose contacts.');
  if(shadow!==undefined&&contact===undefined)throw Error('Retain shadow metadata with its pose contact.');
  hasContacts||=contact!==undefined;hasShadows||=shadow!==undefined;
  const frame=document.createElement('canvas');frame.width=source.width;frame.height=source.height;owned.push(frame);const ctx=frame.getContext('2d');if(!ctx)throw Error('Cannot prepare this resident preview.');ctx.drawImage(source,0,0);
  return {frame,origin,contact:contact===undefined?undefined:Object.freeze([...contact]),shadow};
 };
 try{
  for(const sheet of ['base','idle','activities'])for(let index=0;index<16;index++)frames.set(`${sheet}:${index}`,capture(sheet,index));
  for(const index of [13,14])returns.set(index,capture('activities',index,{sequenceIndex:5}));
  let portrait=null;if(provider.portraitFraming){const p=provider.portraitFraming();if(!p||Object.keys(p).sort().join(',')!=='crop,origin'||!Array.isArray(p.origin)||p.origin.length!==2||Array.from(p.origin).some((n,i)=>n!==frames.get('base:8').origin[i])||!Array.isArray(p.crop)||p.crop.length!==4||Array.from(p.crop).some(n=>!Number.isFinite(n))||p.crop[0]< -128||p.crop[1]< -128||p.crop[2]<=0||p.crop[3]<=0||p.crop[0]+p.crop[2]>384||p.crop[1]+p.crop[3]>384)throw Error('Retain bounded native portrait framing.');portrait={origin:Object.freeze([...p.origin]),crop:Object.freeze([...p.crop])};}
  const get=(sheet,index,pose)=>{
   const key=`${sheet}:${index}`;if(!Number.isSafeInteger(index)||!frames.has(key))throw Error('Choose a registered resident pose.');
   return sheet==='activities'&&pose?.sequenceIndex>=4?returns.get(index)??frames.get(key):frames.get(key);
  };
  return Object.freeze({interpolation:'keyframes',animationProfile:'neutral-v1',
   ...(portrait?{portraitFraming:()=>({origin:[...portrait.origin],crop:[...portrait.crop]})}:{}),
   ...(extended?{frameOriginForPose:(s,i,p)=>[...get(s,i,p).origin]}:{}),
   ...(hasContacts?{contactForPose(s,i,p){const c=get(s,i,p).contact;return c?[...c]:undefined;}}:{}),
   ...(hasShadows?{shadowForPose:(s,i,p)=>copyResidentShadow(get(s,i,p).shadow)}:{}),
   frameForPose:(s,i,p)=>get(s,i,p).frame,
  });
 }catch(error){for(const frame of owned)frame.width=frame.height=0;throw error;}
}
