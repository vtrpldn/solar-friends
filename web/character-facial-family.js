import {canonical} from './editor/journal.js';
import {paintRegisteredEquipmentAtlas as paintNativeAtlas} from './character-equipment-atlas.js';
import {composeEquipmentAppearance as composeBehindHands} from './character-equipment-appearance.js';
import {validateBodyForegroundMask} from './character-foreground-mask.js';
import {validateHairColour,tintHairPixels} from './character-hair-colours.js';
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');

// Preparation-only: the caller owns every appearance frame and has not exposed
// the provider yet. On failure it must dispose that entire preparation. Bake
// into those owned frames, retaining no second full facial animation cache.
export async function applyFacialFamily({family,appearance,registration,sources,colour='chestnut'}){
 const r=structuredClone(registration);validateHairColour(colour);
 if(!exact(r,['schema','body','sources','groups','foreground'])||r.schema!==2||canonical(r.body)!==canonical(family.binding)||!r.sources||Array.isArray(r.sources)||Object.keys(r.sources).length<1||Object.keys(r.sources).length>16||!sources||Object.keys(r.sources).sort().join(',')!==Object.keys(sources).sort().join(',')||!Array.isArray(r.groups)||r.groups.length<1||r.groups.length>8||!Array.isArray(r.foreground)||r.foreground.length!==48)throw Error('Use complete body-bound facial ownership.');
 for(const [id,s]of Object.entries(r.sources))if(!/^[a-z][a-z0-9-]{0,63}$/.test(id)||!/^[a-f0-9]{64}$/.test(s.sha256??'')||sources[id]?.sourceHash!==s.sha256)throw Error('Facial source identity changed.');
 const records=new Map(),masks=new Map();
 for(const p of r.foreground){if(!exact(p,['sheet','index','polygons'])||!['base','idle','activities'].includes(p.sheet)||!Number.isInteger(p.index)||p.index<0||p.index>15||masks.has(`${p.sheet}:${p.index}`))throw Error('Own every facial foreground pose exactly once.');masks.set(`${p.sheet}:${p.index}`,p);}
 for(const group of r.groups){
  if(!exact(group,['registration','sources'])||!group.sources||Array.isArray(group.sources)||Object.keys(group.sources).length<1||Object.keys(group.sources).length>8||!Array.isArray(group.registration?.poses)||!group.registration.poses.length||group.registration.poses.length>48||canonical(group.registration.body)!==canonical(r.body))throw Error('Declare bounded registered facial atlas groups.');
  const loaded=Object.fromEntries(Object.entries(group.sources).map(([local,id])=>{if(!Object.hasOwn(sources,id))throw Error('Facial source mapping is incomplete.');return [local,sources[id]];}));
  for(const pose of group.registration.poses){const key=`${pose.sheet}:${pose.index}`;if(!masks.has(key)||records.has(key))throw Error('Facial source ownership must cover unique body poses.');records.set(key,{group,loaded,pose});}
 }
 if(records.size!==48)throw Error('Facial hair requires every logical body pose.');
 const destinations=new Map();
 // Validate aliasing before painting. Return phases may share their normal
 // canvas, but distinct body poses must never share a mutable destination.
 for(const [key,{pose}]of records)for(const sequenceIndex of [0,4]){const frame=appearance.frameForPose(pose.sheet,pose.index,{sequenceIndex});if(destinations.has(frame)&&destinations.get(frame)!==key)throw Error('Distinct facial poses cannot share an owned frame.');destinations.set(frame,key);}
 let prepared=0;
 for(const [key,{group,loaded,pose}]of records){
  const cap=paintNativeAtlas({binding:r.body,registration:group.registration,sources:loaded,sheet:pose.sheet,index:pose.index});
  try{
   if(colour!=='chestnut'){const p=tintHairPixels(cap.getContext('2d').getImageData(0,0,256,256),colour);cap.getContext('2d').putImageData(new ImageData(p.data,256,256),0,0);}
   const authored=validateBodyForegroundMask({schema:1,body:r.body,size:1254,...masks.get(key)},r.body,pose.sheet,pose.index),region=document.createElement('canvas');region.width=region.height=256;let runs;try{const ctx=region.getContext('2d');ctx.scale(256/1254,256/1254);ctx.beginPath();for(const polygon of authored.polygons){ctx.moveTo(...polygon[0]);for(const p of polygon.slice(1))ctx.lineTo(...p);ctx.closePath();}ctx.fill();const coverage=ctx.getImageData(0,0,256,256).data,paint=cap.getContext('2d').getImageData(0,0,256,256).data,body=family.frameForPose(pose.sheet,pose.index).getContext('2d').getImageData(0,0,256,256),digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',body.data))].map(n=>n.toString(16).padStart(2,'0')).join('');if(digest!==r.body.frames[pose.sheet][pose.index])throw Error('Facial body pixels changed.');const owned=new Uint8Array(256*256);for(let i=0;i<owned.length;i++)owned[i]=Number(coverage[i*4+3]>=128&&paint[i*4+3]>0&&body.data[i*4+3]>0);runs=[];for(let i=0;i<owned.length;){if(!owned[i]){i++;continue;}const start=i;while(i<owned.length&&owned[i])i++;runs.push([start,i-start]);}}finally{region.width=region.height=0;}const mask={schema:2,body:r.body,size:256,sheet:pose.sheet,index:pose.index,runs},seen=new Set();
   for(const sequenceIndex of [0,4]){
    const frame=appearance.frameForPose(pose.sheet,pose.index,{sequenceIndex});if(seen.has(frame))continue;seen.add(frame);
    if(!runs.length){const origin=appearance.frameOriginForPose(pose.sheet,pose.index,{sequenceIndex});frame.getContext('2d').drawImage(cap,-origin[0],-origin[1]);prepared++;continue;}
    const result=await composeBehindHands({body:family.frameForPose(pose.sheet,pose.index),binding:r.body,mask,sheet:pose.sheet,index:pose.index,appearance:frame,origin:appearance.frameOriginForPose(pose.sheet,pose.index,{sequenceIndex}),equipment:cap}).catch(error=>{throw Error(`Facial ${key} phase${sequenceIndex}: ${error.message}`,{cause:error});});
    try{const ctx=frame.getContext('2d');ctx.clearRect(0,0,frame.width,frame.height);ctx.drawImage(result.frame,0,0);prepared++;}finally{result.frame.width=result.frame.height=0;}
   }
  }finally{cap.width=cap.height=0;}
 }
 return prepared;
}
