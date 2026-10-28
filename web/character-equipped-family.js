import {canonical} from './editor/journal.js';
import {paintRegisteredEquipmentAtlas} from './character-equipment-atlas.js';
import {composeEquipmentAppearance} from './character-equipment-appearance.js';
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');

// Successful preparation takes ownership of the appearance provider. Failure
// releases only newly composed frames; the caller still owns its appearance.
export async function prepareEquippedFamily({family,appearance,groups,sources}){
 const definitions=structuredClone(groups),frames=new Map(),returns=new Map();let disposed=false;
 const clear=()=>{for(const map of [frames,returns]){for(const value of map.values())value.frame.width=value.frame.height=0;map.clear();}};
 if(!Array.isArray(definitions)||definitions.length<1||definitions.length>5)throw Error('Declare bounded equipment groups.');
 try{for(const group of definitions){
  if(!exact(group,['registration','masks','sources',...(Object.hasOwn(group,'returns')?['returns']:[])])||!exact(group.masks,['schema','body','size','poses'])||group.masks.schema!==1||group.masks.size!==1254||canonical(group.masks.body)!==canonical(family.binding)||!Array.isArray(group.masks.poses)||group.masks.poses.length!==group.registration?.poses?.length||!group.sources||Array.isArray(group.sources)||Object.keys(group.sources).length>8)throw Error('Use exact body-bound equipment and hand ownership.');
  const selected=Object.fromEntries(Object.entries(group.sources).map(([local,key])=>{if(typeof key!=='string'||!Object.hasOwn(sources,key))throw Error('Equipment source mapping is incomplete.');return [local,sources[key]];}));
  for(const [i,pose]of group.registration.poses.entries()){
   const key=`${pose.sheet}:${pose.index}`,mask=group.masks.poses[i];
   if(frames.has(key)||!exact(mask,['sheet','index','polygons'])||mask.sheet!==pose.sheet||mask.index!==pose.index)throw Error('Equipment hand ownership must match unique poses.');
   const tool=paintRegisteredEquipmentAtlas({binding:family.binding,registration:group.registration,sources:selected,sheet:pose.sheet,index:pose.index});
   try{frames.set(key,await composeEquipmentAppearance({body:family.frameForPose(pose.sheet,pose.index),binding:family.binding,mask:{schema:1,body:family.binding,size:1254,...mask},sheet:pose.sheet,index:pose.index,appearance:appearance.frameForPose(pose.sheet,pose.index),origin:appearance.frameOriginForPose(pose.sheet,pose.index),equipment:tool}));}finally{tool.width=tool.height=0;}
  }
  if(Object.hasOwn(group,'returns')){
   const r=group.returns;
   if(!exact(r,['schema','body','scale','sources','poses'])||r.schema!==group.registration.schema||canonical(r.body)!==canonical(group.registration.body)||r.scale!==group.registration.scale||canonical(r.sources)!==canonical(group.registration.sources)||!Array.isArray(r.poses)||!r.poses.length||r.poses.length>group.registration.poses.length)throw Error('Return equipment must reuse its exact registered source space.');
   for(const pose of r.poses){
    const key=`${pose.sheet}:${pose.index}`,owner=group.registration.poses.find(p=>p.sheet===pose.sheet&&p.index===pose.index),mask=group.masks.poses.find(p=>p.sheet===pose.sheet&&p.index===pose.index);
    if(!owner||!mask||returns.has(key)||!Array.isArray(pose.parts)||pose.parts.some(p=>!owner.parts.some(o=>canonical(o)===canonical(p))))throw Error('Return equipment can only retain parts of its owned pose.');
    let previous=-1;for(const part of pose.parts){const next=owner.parts.findIndex((p,i)=>i>previous&&canonical(p)===canonical(part));if(next<0)throw Error('Return parts must retain their original order without duplication.');previous=next;}
    const tool=paintRegisteredEquipmentAtlas({binding:family.binding,registration:r,sources:selected,sheet:pose.sheet,index:pose.index});
    try{returns.set(key,await composeEquipmentAppearance({body:family.frameForPose(pose.sheet,pose.index),binding:family.binding,mask:{schema:1,body:family.binding,size:1254,...mask},sheet:pose.sheet,index:pose.index,appearance:appearance.frameForPose(pose.sheet,pose.index),origin:appearance.frameOriginForPose(pose.sheet,pose.index),equipment:tool}));}finally{tool.width=tool.height=0;}
   }
  }
 }}catch(error){clear();throw error;}
 const get=(s,i,pose)=>{if(disposed)throw Error('This equipped appearance has been released.');appearance.frameForPose(s,i,pose);const key=`${s}:${i}`;return pose?.sequenceIndex>=4?returns.get(key)??frames.get(key):frames.get(key);};
 return Object.freeze({frameForPose:(s,i,pose)=>get(s,i,pose)?.frame??appearance.frameForPose(s,i,pose),frameOriginForPose:(s,i,pose)=>get(s,i,pose)?.origin.slice()??appearance.frameOriginForPose(s,i,pose),contactForPose(s,i,pose){get(s,i,pose);return appearance.contactForPose(s,i,pose);},shadowForPose(s,i,pose){get(s,i,pose);return appearance.shadowForPose(s,i,pose);},info(){return {...appearance.info(),ownedFrames:appearance.info().ownedFrames+frames.size+returns.size,equipmentFrames:frames.size,returnFrames:returns.size,disposed};},dispose(){if(disposed)return;disposed=true;clear();appearance.dispose();}});
}
