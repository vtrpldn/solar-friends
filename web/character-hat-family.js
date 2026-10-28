import {registeredBodyAppearance} from './character-body-appearance.js';
import {canonical} from './editor/journal.js';
import {validateAttachmentBinding} from './character-attachments.js';
import {createBodyForegroundLayers} from './character-foreground.js';
import {composeResidentFrame} from './character-frame-composition.js';
const sheets=['base','idle','activities'];
// Exact-body hat provider. Caller owns the body and decoded source; this
// provider owns only its composed canvases and releases partial work on error.
export async function prepareHatFamily({family,registration,source,appearanceFrameForPose=null}){
 if(appearanceFrameForPose!==null&&typeof appearanceFrameForPose!=='function')throw Error('Use a registered colour frame provider.');
 const r=structuredClone(registration);validateAttachmentBinding(r?.body);
 if(r.schema!==1||canonical(r.body)!==canonical(family?.binding)||typeof family?.frameForPose!=='function'||typeof family?.contactForPose!=='function'||!Array.isArray(r.poses)||r.poses.length!==48||source?.sourceHash!==r.source?.sha256||!/^[a-f0-9]{64}$/.test(r.source?.sha256??'')||!Number.isSafeInteger(r.source?.size)||r.source.size<256||r.source.size>2048||source.image?.naturalWidth!==r.source.size||source.image?.naturalHeight!==r.source.size)throw Error('Use a complete hat registration for the exact body and source.');
 const records=new Map(),frames=new Map(),owned=new Set();let disposed=false;
 const clear=c=>{c.width=c.height=0;},destroy=()=>{for(const c of owned)clear(c);owned.clear();frames.clear();};
 for(const pose of r.poses){const key=pose.sheet+':'+pose.index;if(!sheets.includes(pose.sheet)||!Number.isSafeInteger(pose.index)||pose.index<0||pose.index>15||records.has(key)||pose.bodyFrameSha256!==r.body.frames[pose.sheet][pose.index]||!['worn','not-worn'].includes(pose.kind)||!Array.isArray(pose.offset)||pose.offset.length!==2||pose.offset.some(n=>!Number.isSafeInteger(n)||Math.abs(n)>128)||pose.kind==='not-worn'&&(pose.offset.some(n=>n!==0)||pose.foreground!==null))throw Error('Use unique exact-body hat poses and bounded translations.');records.set(key,pose);}
 const hat=document.createElement('canvas');hat.width=hat.height=256;
 try{hat.getContext('2d').drawImage(source.image,0,0,256,256);
  for(const sheet of sheets)for(let index=0;index<16;index++){
   const key=sheet+':'+index,pose=records.get(key),body=family.frameForPose(sheet,index);if(!pose||body?.width!==256||body?.height!==256)throw Error('Keep every native body and hat pose.');
   const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',body.getContext('2d').getImageData(0,0,256,256).data))].map(n=>n.toString(16).padStart(2,'0')).join('');if(digest!==pose.bodyFrameSha256)throw Error('Hat body pixels changed.');
   const appearance=registeredBodyAppearance(body,appearanceFrameForPose?.(sheet,index)??body);
   if(pose.kind==='not-worn'){frames.set(key,{frame:appearance,origin:[0,0]});continue;}
   let split=null;try{if(pose.foreground!==null)split=await createBodyForegroundLayers({body,binding:r.body,sheet,index,appearanceBody:appearance,mask:pose.foreground});const result=composeResidentFrame(split?.back??appearance,[{frame:hat,offset:pose.offset},...(split?[{frame:split.front,offset:[0,0]}]:[])]);owned.add(result.frame);frames.set(key,result);}finally{if(split){clear(split.back);clear(split.front);}}
  }
 }catch(error){destroy();throw error;}finally{clear(hat);}
 const get=(sheet,index)=>{if(disposed)throw Error('This hat family has been released.');if(!sheets.includes(sheet)||!Number.isSafeInteger(index)||index<0||index>15)throw Error('Choose a supported hat pose.');const value=frames.get(sheet+':'+index);if(!value)throw Error('Choose an available hat pose.');return value;};
 return Object.freeze({frameForPose:(s,i)=>get(s,i).frame,frameOriginForPose:(s,i)=>[...get(s,i).origin],contactForPose(s,i){get(s,i);return family.contactForPose(s,i);},shadowForPose(s,i){get(s,i);return family.shadowForPose?.(s,i);},dispose(){if(disposed)return;disposed=true;destroy();},info:()=>({ownedFrames:owned.size,poses:frames.size,disposed})});
}
