import {canonical} from './editor/journal.js';
import {paintRegisteredEquipmentAtlas} from './character-equipment-atlas.js';
import {composeEquipmentAppearance} from './character-equipment-appearance.js';
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');

// Successful preparation takes ownership of the appearance provider. Failure
// releases only newly composed frames; the caller still owns its appearance.
export async function prepareEquippedFamily({family,appearance,groups,sources}){
 const definitions=structuredClone(groups),frames=new Map();let disposed=false;
 const clear=()=>{for(const value of frames.values())value.frame.width=value.frame.height=0;frames.clear();};
 if(!Array.isArray(definitions)||definitions.length<1||definitions.length>5)throw Error('Declare bounded equipment groups.');
 try{for(const group of definitions){
  if(!exact(group,['registration','masks','sources'])||!exact(group.masks,['schema','body','size','poses'])||group.masks.schema!==1||group.masks.size!==1254||canonical(group.masks.body)!==canonical(family.binding)||!Array.isArray(group.masks.poses)||group.masks.poses.length!==group.registration?.poses?.length||!group.sources||Array.isArray(group.sources)||Object.keys(group.sources).length>8)throw Error('Use exact body-bound equipment and hand ownership.');
  const selected=Object.fromEntries(Object.entries(group.sources).map(([local,key])=>{if(typeof key!=='string'||!Object.hasOwn(sources,key))throw Error('Equipment source mapping is incomplete.');return [local,sources[key]];}));
  for(const [i,pose]of group.registration.poses.entries()){
   const key=`${pose.sheet}:${pose.index}`,mask=group.masks.poses[i];
   if(frames.has(key)||!exact(mask,['sheet','index','polygons'])||mask.sheet!==pose.sheet||mask.index!==pose.index)throw Error('Equipment hand ownership must match unique poses.');
   const tool=paintRegisteredEquipmentAtlas({binding:family.binding,registration:group.registration,sources:selected,sheet:pose.sheet,index:pose.index});
   try{frames.set(key,await composeEquipmentAppearance({body:family.frameForPose(pose.sheet,pose.index),binding:family.binding,mask:{schema:1,body:family.binding,size:1254,...mask},sheet:pose.sheet,index:pose.index,appearance:appearance.frameForPose(pose.sheet,pose.index),origin:appearance.frameOriginForPose(pose.sheet,pose.index),equipment:tool}));}finally{tool.width=tool.height=0;}
  }
 }}catch(error){clear();throw error;}
 const get=(s,i)=>{if(disposed)throw Error('This equipped appearance has been released.');appearance.frameForPose(s,i);return frames.get(`${s}:${i}`);};
 return Object.freeze({frameForPose:(s,i)=>get(s,i)?.frame??appearance.frameForPose(s,i),frameOriginForPose:(s,i)=>get(s,i)?.origin.slice()??appearance.frameOriginForPose(s,i),contactForPose(s,i){get(s,i);return appearance.contactForPose(s,i);},shadowForPose(s,i){get(s,i);return appearance.shadowForPose(s,i);},info(){return {...appearance.info(),ownedFrames:appearance.info().ownedFrames+frames.size,equipmentFrames:frames.size,disposed};},dispose(){if(disposed)return;disposed=true;clear();appearance.dispose();}});
}
