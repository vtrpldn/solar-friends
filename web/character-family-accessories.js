import {canonical} from './editor/journal.js';
import {validateAttachmentBinding} from './character-attachments.js';
import {auditCharacterPartRegion} from './character-parts.js';
import {composeFacialHairPose} from './character-facial-hair.js';
const sheets=['base','idle','activities'],exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(','),point=p=>Array.isArray(p)&&p.length===2&&Array.from(p).every(n=>Number.isSafeInteger(n)&&n>=0&&n<256),clear=c=>{c.width=c.height=0;};
// Source and target bodies remain separate identities. Only rigid translation
// is supported; no source repaint, fitting, scale, rotation or missing-pose fallback.
export async function prepareFamilyAccessories({family,registration,load}){
 const r=structuredClone(registration);validateAttachmentBinding(r?.body);validateAttachmentBinding(r?.referenceBody);
 if(typeof load!=='function'||typeof family?.frameForPose!=='function'||!exact(r,['schema','status','body','referenceBody','hat','facialHair'])||r.schema!==1||r.body.normalization!==2||canonical(r.body)!==canonical(family.binding)||!exact(r.hat,['source','poses'])||!exact(r.facialHair,['poses']))throw Error('Use complete accessories registered to this body family.');
 const owned=new Set(),sourceWork=new Map(),faceSources=new Map(),hats=new Map(),faces=new Map(),actual=new Map();let disposed=false,hat=null;
 const own=c=>{owned.add(c);return c;},destroy=()=>{for(const c of owned)clear(c);owned.clear();sourceWork.clear();faceSources.clear();hats.clear();faces.clear();},loadSource=file=>{if(typeof file!=='string'||!/^[a-z0-9-]+\.png$/.test(file))throw Error('Choose bundled accessory artwork.');if(!sourceWork.has(file))sourceWork.set(file,Promise.resolve().then(()=>load(file)));return sourceWork.get(file);};
 const hash=async frame=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',frame.getContext('2d').getImageData(0,0,256,256).data))].map(n=>n.toString(16).padStart(2,'0')).join('');
 const reference=(sheet,index)=>{const frame=family.frameForPose(sheet,index);if(actual.get(sheet+':'+index)!==r.referenceBody.frames[sheet]?.[index])throw Error('The original accessory reference body is unavailable or changed.');return frame;};
 function records(poses,kind){
  if(!Array.isArray(poses)||poses.length!==48)throw Error('Provide all 48 accessory poses.');const map=new Map();
  for(const pose of poses){
   if(!exact(pose,kind==='hat'?['sheet','index','bodyFrameSha256','placement','translation']:['sheet','index','bodyFrameSha256','placement','translation','file','registration'])||!sheets.includes(pose.sheet)||!Number.isSafeInteger(pose.index)||pose.index<0||pose.index>15||pose.bodyFrameSha256!==r.body.frames[pose.sheet][pose.index]||!Array.isArray(pose.translation)||pose.translation.length!==2||Array.from(pose.translation).some(n=>!Number.isSafeInteger(n)||Math.abs(n)>96))throw Error('Accessory pose identity or rigid translation is invalid.');
   const p=pose.placement,key=pose.sheet+':'+pose.index;if(map.has(key))throw Error('Accessory pose ownership is duplicated.');
   if(p?.kind==='unchanged'){
    if(!exact(p,['kind'])||pose.bodyFrameSha256!==r.referenceBody.frames[pose.sheet][pose.index]||kind==='facialHair'&&pose.translation.some(n=>n!==0))throw Error('Unchanged accessories require the identical original body pose.');
   }else{
    if(!exact(p,['kind','reference','target'])||p.kind!=='crown-socket'||pose.sheet!=='base'||pose.index>3||!point(p.reference)||!point(p.target)||pose.translation.some((n,i)=>n!==p.target[i]-p.reference[i]))throw Error('Use measured walking crown sockets for changed anatomy.');
    for(const [frame,socket]of [[reference('base',8),p.reference],[family.frameForPose(pose.sheet,pose.index),p.target]])if(frame.getContext('2d').getImageData(...socket,1,1).data[3]<32)throw Error('Accessory sockets must lie on the actual body paint.');
   }
   map.set(key,pose);
  }return map;
 }
 const fits=(frame,offset)=>{const pixels=frame.getContext('2d').getImageData(0,0,256,256).data;for(let p=0;p<65536;p++)if(pixels[p*4+3]&&(p%256+offset[0]<0||p%256+offset[0]>=256||Math.floor(p/256)+offset[1]<0||Math.floor(p/256)+offset[1]>=256))throw Error('Keep the complete accessory paint inside the prepared frame.');};
 try{
  for(const sheet of sheets)for(let index=0;index<16;index++){const frame=family.frameForPose(sheet,index);if(frame?.width!==256||frame?.height!==256||await hash(frame)!==r.body.frames[sheet][index])throw Error('The target body pixels differ from accessory ownership.');actual.set(sheet+':'+index,r.body.frames[sheet][index]);}
  const hatPoses=records(r.hat.poses,'hat'),facePoses=records(r.facialHair.poses,'facialHair'),source=r.hat.source;
  if(source?.reviewSchema!==1||source.sheet!=='base'||source.index!==8||source.size!==1254||canonical(source.body)!==canonical(r.referenceBody)||!/^[a-f0-9]{64}$/.test(source.sha256??''))throw Error('Use the exact original standing hat registration.');reference('base',8);
  const art=await loadSource(source.file);if(art.sourceHash!==source.sha256||art.image?.naturalWidth!==1254||art.image?.naturalHeight!==1254)throw Error('Hat source pixels differ from their registration.');
  const raw=own(document.createElement('canvas'));raw.width=raw.height=1254;raw.getContext('2d').drawImage(art.image,0,0);const audit=auditCharacterPartRegion(raw.getContext('2d').getImageData(0,0,1254,1254),source.bounds);clear(raw);owned.delete(raw);if(!audit.ok)throw Error('Hat source paint leaves its authored region.');
  hat=own(document.createElement('canvas'));hat.width=hat.height=256;hat.getContext('2d').drawImage(art.image,0,0,256,256);for(const [key,pose]of hatPoses){fits(hat,pose.translation);hats.set(key,pose.translation);}
  const blank=own(document.createElement('canvas'));blank.width=blank.height=256;
  for(const [key,pose]of facePoses){
   const original=pose.registration,changed=pose.placement.kind==='crown-socket';
   if(!/^facial-short-chestnut-source-\d{2}-v1\.png$/.test(pose.file)||original?.bodyFrameSha256!==r.referenceBody.frames[original?.sheet]?.[original?.index]||changed&&(original.sheet!=='base'||original.index!==8)||!changed&&(original.sheet!==pose.sheet||original.index!==pose.index))throw Error('Beard reuse requires its original registered facial pose.');reference(original.sheet,original.index);
   const id=canonical({file:pose.file,registration:original});if(!faceSources.has(id)){const loaded=await loadSource(pose.file),result=composeFacialHairPose({appearanceFrame:blank,...loaded,binding:r.referenceBody,registration:original,sheet:original.sheet,index:original.index});faceSources.set(id,own(result.frame));}
   const frame=faceSources.get(id);fits(frame,pose.translation);faces.set(key,{frame,offset:pose.translation});
  }
  clear(blank);owned.delete(blank);
 }catch(error){destroy();throw error;}
 return Object.freeze({
  compose(frame,{hat:wearHat,facialHair},sheet,index){
   if(disposed||typeof wearHat!=='boolean'||typeof facialHair!=='boolean'||!sheets.includes(sheet)||!Number.isSafeInteger(index)||index<0||index>15||frame?.width!==256||frame?.height!==256)throw Error('Choose an available complete accessory pose.');
   if(!wearHat&&!facialHair)return frame;const key=sheet+':'+index,result=document.createElement('canvas');result.width=result.height=256;
   try{const ctx=result.getContext('2d');ctx.drawImage(frame,0,0);if(facialHair){const face=faces.get(key);ctx.drawImage(face.frame,...face.offset);}if(wearHat)ctx.drawImage(hat,...hats.get(key));return result;}catch(error){clear(result);throw error;}
  },
  info:()=>({hatFrames:hat&&!disposed?1:0,facialSourceFrames:faceSources.size,posePlacements:hats.size+faces.size,rgbaBytes:owned.size*256*256*4}),
  dispose(){if(disposed)return;disposed=true;destroy();hat=null;},
 });
}
