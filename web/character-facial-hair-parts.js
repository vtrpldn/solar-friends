import {canonical} from './editor/journal.js';
import {composeFacialHairPose} from './character-facial-hair.js';

// Prepare immutable face-only overlays once per loaded part set, shared by
// palettes, hairstyles, hats and the two equipment-return states.
export async function prepareFacialHairParts({owner,binding,load,yieldControl=()=>new Promise(resolve=>setTimeout(resolve,0))}){
 if(owner?.schema!==1||owner.part!=='short-chestnut-v1'||owner.assetVersion!=='resident-parts-v1'||canonical(owner.body)!==canonical(binding)||!Array.isArray(owner.sources)||!owner.sources.length||owner.sources.length>48||!Array.isArray(owner.poses)||owner.poses.length!==48)throw Error('The bundled facial-hair set does not match this body revision.');
 const allowed=new Map();for(const source of owner.sources){if(!/^facial-short-chestnut-source-\d{2}-v1\.png$/.test(source.file??'')||!/^[a-f0-9]{64}$/.test(source.sha256??'')||allowed.has(source.file))throw Error('Choose exact bundled facial-hair source files.');allowed.set(source.file,source.sha256);}
 const entries=new Map();for(const pose of owner.poses){const r=pose.registration,key=r?.sheet+':'+r?.index;if(!['base','idle','activities'].includes(r?.sheet)||!Number.isInteger(r?.index)||r.index<0||r.index>15||entries.has(key)||!allowed.has(pose.file)||r.source?.sha256!==allowed.get(pose.file))throw Error('Facial-hair pose registration is incomplete or duplicated.');entries.set(key,pose);}
 if([...allowed.keys()].some(file=>!owner.poses.some(p=>p.file===file)))throw Error('Facial-hair artwork has an undeclared pose source.');
 const overlays=new Map(),blank=document.createElement('canvas');blank.width=blank.height=256;
 try{
  for(const [key,pose]of entries){const source=await load(pose.file);if(source.sourceHash!==allowed.get(pose.file))throw Error('Facial-hair artwork does not match its bundled registration.');const r=pose.registration,result=composeFacialHairPose({appearanceFrame:blank,...source,binding,registration:r,sheet:r.sheet,index:r.index});overlays.set(key,result.frame);if(overlays.size%4===0)await yieldControl();}
 }catch(error){for(const frame of overlays.values())frame.width=frame.height=0;throw error;}
 finally{blank.width=blank.height=0;}
 let disposed=false;
 return Object.freeze({
  compose(frame,sheet,index){if(disposed||typeof sheet!=='string'||!Number.isInteger(index)||!overlays.has(sheet+':'+index)||frame?.width!==256||frame?.height!==256)throw Error('This facial-hair part has no artwork for the requested pose.');const result=document.createElement('canvas');result.width=result.height=256;const ctx=result.getContext('2d');ctx.drawImage(frame,0,0);ctx.drawImage(overlays.get(sheet+':'+index),0,0);return result;},
  cacheInfo:()=>({entries:overlays.size,maximum:48,rgbaByteUpperBound:overlays.size*256*256*4}),
  dispose(){if(disposed)return;disposed=true;for(const frame of overlays.values())frame.width=frame.height=0;overlays.clear();},
 });
}
