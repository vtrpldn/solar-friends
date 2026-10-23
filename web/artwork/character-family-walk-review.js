import {prepareBodyFamily} from '../character-body-family.js';
import {createFamilyBodyMaterialModel} from '../character-materials.js';
import {prepareFamilyAccessories} from '../character-family-accessories.js';
import {extractRegisteredAtlasPart} from '../character-atlas-part.js';
import {prepareRegisteredHair} from '../character-hair.js';
// Internal clip review only. Missing non-walk artwork must never fall back to
// another pose; the player provider still requires the complete character set.
export async function prepareFamilyWalkReview({ownership,materials,owners,accessories,garments,load,withAccessories=false}){
 const data=structuredClone({ownership,materials,owners,accessories,garments});
 if(typeof load!=='function'||typeof withAccessories!=='boolean'||!Array.isArray(data.garments)||data.garments.length!==4||data.garments.some((g,i)=>g?.registration?.sheet!=='base'||g.registration.index!==i))throw Error('Provide exactly four ordered walking garment poses.');
 const loaded={},frames=[[],[]],owned=new Set();let family=null,model=null,parts=null,disposed=false;
 const clear=c=>{c.width=c.height=0;};
 try{
  for(const id of Object.keys(data.ownership.sources))loaded[id]=await load('body-'+id);
  family=await prepareBodyFamily({ownership:data.ownership,sources:loaded});model=await createFamilyBodyMaterialModel(family,data.materials,{maxFrames:8});
  if(withAccessories)parts=await prepareFamilyAccessories({family,registration:data.accessories,load});
  const painted=model.provider({skin:'warm',shirt:'cream',shorts:'sage',shoes:'graphite'}),clothing=[];
  for(const garment of data.garments)clothing.push({...await load(garment.file),registration:garment.registration});
  for(const [style,hair]of ['curls','sidepart'].entries())for(let index=0;index<4;index++){
   const owner=data.owners[hair],pose=owner.poses.base[index],source=await load(pose.file),part=extractRegisteredAtlasPart({...source,registration:{sha256:pose.partSha256,size:pose.size,bounds:pose.bounds,sourceRect:pose.sourceRect??[0,0,1254,1254]}});let cap=null,appearance=null;
   try{
    cap=prepareRegisteredHair({...source,image:part.frame,registration:{...pose,body:owner.body}});const appearanceBody=painted.frameForPose('base',index);if(appearanceBody!==family.frames.base[index])owned.add(appearanceBody);
    appearance=await cap.compose({body:family.frames.base[index],binding:family.binding,referenceBody:family.frames.base[8],appearanceBody,hairColour:'chestnut',clothing:clothing[index]});
    const frame=parts?parts.compose(appearance,{hat:true,facialHair:true},'base',index):appearance;frames[style][index]=frame;if(frame===appearance)appearance=null;
   }finally{if(appearance)clear(appearance);cap?.dispose();if(part.frame instanceof HTMLCanvasElement)clear(part.frame);}
  }
 }catch(error){for(const set of frames)for(const c of set)if(c)clear(c);throw error;}
 finally{parts?.dispose();for(const c of owned)clear(c);model?.clear();family?.dispose();}
 const providers=frames.map(set=>Object.freeze({animationProfile:'neutral-v1',interpolation:'keyframes',frameForPose(sheet,index){if(disposed||sheet!=='base'||!Number.isSafeInteger(index)||index<0||index>3)throw Error('Only the four reviewed shirt walking poses exist here.');return set[index];}}));
 return Object.freeze({providers,dispose(){if(disposed)return;disposed=true;for(const set of frames)for(const c of set)clear(c);}});
}
