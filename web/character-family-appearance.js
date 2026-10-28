import {createAppearanceLeaseCache} from './appearance-lease-cache.js';
import {composeClothingPose} from './character-clothing.js';
import {bodyTransformHasContacts} from './character-contact-atlas.js';
import {prepareClothingColourSource} from './character-clothing-colour.js';
import {intersectBodyForegroundMasks} from './character-foreground.js';
import {prepareFamilyAccessories} from './character-family-accessories.js';
import {validateBodyForegroundMask} from './character-foreground-mask.js';
import {canonical} from './editor/journal.js';
import {createFamilyBodyMaterialModel,defaultBodyMaterials,validateBodyMaterials,tintBodyMaterials} from './character-materials.js';
import {validateHairColour} from './character-hair-colours.js';
import {prepareRegisteredHair} from './character-hair.js';
import {extractRegisteredAtlasPart,composeActivityUnderlay} from './character-atlas-part.js';
import {loadEquipmentArt} from './character-equipment-parts.js';
import {registeredEquipmentFrame,validateRegisteredEquipment} from './character-equipment.js';
const sheets=['base','idle','activities'],exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(','),clear=c=>{c.width=c.height=0;};
// Internal complete-family provider. The caller retains ownership of the body
// family and decoded sources. Every acquired preview has an explicit lease;
// eviction never invalidates a preview that is still in use.
export async function prepareFamilyAppearanceLibrary({family,materials,owners,equipment,load,accessories=null,workEquipment=null,clothing=null,maxEntries=12,maxConcurrent=2,maxQueued=24}){
 if(typeof load!=='function'||typeof family?.frameForPose!=='function'||!Number.isInteger(maxEntries)||maxEntries<1||maxEntries>24||!Number.isInteger(maxConcurrent)||maxConcurrent<1||maxConcurrent>4||!Number.isInteger(maxQueued)||maxQueued<1||maxQueued>128)throw Error('Choose bounded complete-family composition limits.');
 const hasContacts=Object.values(family.binding?.ownership?.sources??{}).some(source=>bodyTransformHasContacts(source.transform));
 if(hasContacts&&typeof family.contactForPose!=='function')throw Error('Contact-registered families must provide their pose contacts.');
 const registrations=structuredClone({materials,owners,equipment,accessories,workEquipment,clothing}),bodyKey=canonical(family.binding),caps=new Map(),underlays=new Map(),sourceWork=new Map(),tools=[],workTools=new Map(),garments=new Map();
 let model=null,accessoryParts=null,closed=false,disposing=null;
 const alive=()=>{if(closed)throw Error('This character family library has been released.');},source=file=>{
  if(typeof file!=='string'||!/^[a-z0-9-]+\.png$/.test(file))throw Error('Choose registered bundled family artwork.');
  if(!sourceWork.has(file))sourceWork.set(file,Promise.resolve().then(()=>load(file)));return sourceWork.get(file);
 };
 const destroyParts=()=>{for(const cap of caps.values())cap.composer.dispose();caps.clear();for(const a of underlays.values())if(a.frame instanceof HTMLCanvasElement)clear(a.frame);underlays.clear();sourceWork.clear();tools.length=0;workTools.clear();garments.clear();accessoryParts?.dispose();accessoryParts=null;model?.clear();model=null;};
 try{
  if(!exact(registrations.owners,['curls','sidepart'])||!Array.isArray(registrations.equipment)||registrations.equipment.length!==16)throw Error('Provide two complete hairstyle owners and sixteen tools.');
  for(const owner of Object.values(registrations.owners)){
   if(!exact(owner,['schema','sheets','body','poses'])||owner.schema!==2||canonical(owner.sheets)!==canonical(sheets)||canonical(owner.body)!==bodyKey||!exact(owner.poses,sheets))throw Error('Hair ownership differs from the complete body family.');
   for(const sheet of sheets){if(!exact(owner.poses[sheet],Array.from({length:16},(_,i)=>String(i))))throw Error('Provide every owned hair pose.');for(let i=0;i<16;i++){const pose=owner.poses[sheet][i];if(pose?.sheet!==sheet||pose.index!==i)throw Error('Hair pose identity differs from its slot.');}}
  }
  model=await createFamilyBodyMaterialModel(family,registrations.materials,{maxFrames:1});
  for(const [style,owner]of Object.entries(registrations.owners))for(const sheet of sheets)for(let index=0;index<16;index++){
   const pose=owner.poses[sheet][index],loaded=await source(pose.file),part=extractRegisteredAtlasPart({...loaded,registration:{sha256:pose.partSha256,size:pose.size,bounds:pose.bounds,sourceRect:pose.sourceRect??[0,0,1254,1254]}});let composer;
   try{composer=prepareRegisteredHair({...loaded,image:part.frame,registration:{...pose,body:owner.body}});}finally{if(part.frame instanceof HTMLCanvasElement)clear(part.frame);}
   const cap={composer,activity:null};caps.set(style+':'+sheet+':'+index,cap);
   if(pose.activity){const a=pose.activity;if(sheet!=='base'||index<12||a.kind!=='stool')throw Error('Unsupported family activity underlay.');const key=canonical(a);if(!underlays.has(key))underlays.set(key,extractRegisteredAtlasPart({...await source(a.file),registration:{sha256:a.sha256,size:a.size,bounds:a.bounds,sourceRect:a.sourceRect}}));cap.activity=underlays.get(key);}
  }
  for(const [index,registration]of registrations.equipment.entries()){
   if(registration.sheet!=='activities'||registration.index!==index||canonical(registration.body)!==bodyKey)throw Error('Equipment ownership differs from its family pose.');tools.push({registration,equipment:await loadEquipmentArt(registration,source)});
  }
  if(registrations.workEquipment!==null){
   if(!Array.isArray(registrations.workEquipment)||registrations.workEquipment.length!==4)throw Error('Provide every registered work-tool pose.');
   for(const [slot,registration]of registrations.workEquipment.entries()){
    const index=slot+4;if(registration.sheet!=='base'||registration.index!==index||canonical(registration.body)!==bodyKey)throw Error('Work equipment ownership differs from its family pose.');
    const art=await loadEquipmentArt(registration,source);validateRegisteredEquipment({binding:family.binding,equipment:art,registration,sheet:'base',index});validateBodyForegroundMask(registration.foreground,family.binding,'base',index);workTools.set(index,{registration,equipment:art});
   }
  }
  if(registrations.clothing!==null){
   if(!Array.isArray(registrations.clothing)||!registrations.clothing.length||registrations.clothing.length>48)throw Error('Provide a bounded set of registered garment poses.');
   for(const garment of registrations.clothing){
    if(!exact(garment,['file','registration']))throw Error('Choose registered garment sources.');
    const r=garment.registration,key=r?.sheet+':'+r?.index;if(garments.has(key))throw Error('Duplicate garment pose.');
    const art=await source(garment.file),probe=composeClothingPose({...art,registration:r,body:family.frameForPose(r?.sheet,r?.index),binding:family.binding,sheet:r?.sheet,index:r?.index});clear(probe.frame);
    garments.set(key,{...art,registration:r});
    const equipped=r.sheet==='base'?workTools.get(r.index):r.sheet==='activities'?tools[r.index]:null;
    if(equipped&&r.foreground){
     // Only native skin shared by the tool and garment may be restored above
     // both. A tool's older broad arm mask must not erase the new sleeves.
     const adjusted={...equipped,registration:{...equipped.registration,foreground:intersectBodyForegroundMasks({binding:family.binding,sheet:r.sheet,index:r.index,masks:[equipped.registration.foreground,r.foreground]})}};
     if(r.sheet==='base')workTools.set(r.index,adjusted);else tools[r.index]=adjusted;
    }
   }
  }
  if(registrations.accessories!==null)accessoryParts=await prepareFamilyAccessories({family,registration:registrations.accessories,load:source});
 }catch(error){destroyParts();throw error;}
 const validate=input=>{
  if(!input||!exact(input,['hair','hairColour','materials',...['hat','facialHair'].filter(k=>Object.hasOwn(input,k))])||!['curls','sidepart'].includes(input.hair))throw Error('Choose a complete family appearance.');
  const hat=Object.hasOwn(input,'hat')?input.hat:'none',facialHair=Object.hasOwn(input,'facialHair')?input.facialHair:'none';
  if(!['none','straw-v1'].includes(hat)||!['none','short-chestnut-v1'].includes(facialHair)||(hat!=='none'||facialHair!=='none')&&!accessoryParts)throw Error('These complete family accessories are unavailable.');
  return {hair:input.hair,hairColour:validateHairColour(input.hairColour),materials:validateBodyMaterials(input.materials),...(hat==='none'?{}:{hat}),...(facialHair==='none'?{}:{facialHair})};
 };
 const compose=async recipe=>{
  const scratch=new Set(),frames=new Map(),returns=new Map(),colours=new Map(),sharedColours=new Map();let completed=false;
  const own=c=>{scratch.add(c);return c;};
  try{
   // Count consumers without decoding colour images. An identical image/hash
   // stays shared only until its last registered pose has been composed.
   for(const [key,garment]of garments){
    alive();let hashes=sharedColours.get(garment.image);
    if(!hashes){hashes=new Map();sharedColours.set(garment.image,hashes);}
    let colour=hashes.get(garment.sourceHash);
    if(!colour){colour={remaining:0,prepared:null};hashes.set(garment.sourceHash,colour);}
    colour.remaining++;colours.set(key,colour);
   }
   for(const sheet of sheets)for(let index=0;index<16;index++){
    alive();const body=family.frameForPose(sheet,index),cap=caps.get(recipe.hair+':'+sheet+':'+index);let painted=body;
    if(Object.keys(defaultBodyMaterials).some(k=>recipe.materials[k]!==defaultBodyMaterials[k])){
     const tinted=tintBodyMaterials(body.getContext('2d').getImageData(0,0,256,256),model.mask(sheet,index),recipe.materials);painted=own(document.createElement('canvas'));painted.width=painted.height=256;painted.getContext('2d').putImageData(new ImageData(tinted.data,256,256),0,0);
    }
    const garment=garments.get(sheet+':'+index),colour=colours.get(sheet+':'+index);
    if(colour&&!colour.prepared){colour.prepared=await prepareClothingColourSource({...garment,colour:recipe.materials.shirt});alive();}
    const work=sheet==='base'?workTools.get(index):null,args={body,binding:family.binding,appearanceBody:painted},appearance=own(await cap.composer.compose({...args,...(garment?{clothing:{...garment,colourSource:colour.prepared}}:{}),...(work?{equipment:{art:work.equipment,registration:work.registration}}:{}),referenceBody:family.frameForPose('base',8),hairColour:recipe.hairColour}));alive();let frame=appearance;
    if(cap.activity)frame=own(composeActivityUnderlay(appearance,cap.activity));
    if(sheet==='activities'){
     const options={...args,...tools[index],appearanceFrame:appearance,sheet,index,...(garment?{clothing:{...garment,colourSource:colour.prepared}}:{})};frame=own(await registeredEquipmentFrame(options));alive();
     if([13,14].includes(index)){const {registration,equipment:art}=tools[index],keep=registration.parts.map((p,i)=>p.id.startsWith('grain-')?-1:i).filter(i=>i>=0);returns.set(index,own(await registeredEquipmentFrame({...options,registration:{...registration,parts:keep.map(i=>registration.parts[i])},equipment:{...art,parts:keep.map(i=>art.parts[i])}})));alive();}
    }
    if(recipe.hat||recipe.facialHair){const originalFrame=frame,flags={hat:!!recipe.hat,facialHair:!!recipe.facialHair};frame=own(accessoryParts.compose(frame,flags,sheet,index));if(originalFrame!==appearance&&scratch.delete(originalFrame))clear(originalFrame);if(returns.has(index)){const original=returns.get(index);returns.set(index,own(accessoryParts.compose(original,flags,sheet,index)));if(scratch.delete(original))clear(original);}}
    frames.set(sheet+':'+index,frame);
    // No material-frame cache: only this pose's tint/intermediate remains live.
    for(const c of [painted,appearance])if(c!==body&&c!==frame&&scratch.delete(c))clear(c);
    if(colour&&--colour.remaining===0){colour.prepared.dispose();colour.prepared=null;}
   }
   completed=true;return {frames,returns};
  }finally{for(const hashes of sharedColours.values())for(const colour of hashes.values())colour.prepared?.dispose();if(completed){for(const frame of [...frames.values(),...returns.values()])scratch.delete(frame);}for(const c of scratch)clear(c);}
 };
 const cache=createAppearanceLeaseCache({prepare:compose,destroy(value){for(const c of [...value.frames.values(),...value.returns.values()])clear(c);value.frames.clear();value.returns.clear();},maxEntries,maxConcurrent,maxQueued});
 return Object.freeze({
  async acquire(input){
   alive();const recipe=validate(input),lease=await cache.acquire(canonical(recipe),recipe),value=lease.value;
   const provider=Object.freeze({interpolation:'keyframes',animationProfile:'neutral-v1',...(hasContacts&&typeof family.shadowForPose==='function'?{shadowForPose(sheet,index,pose){lease.assertActive();return family.shadowForPose(sheet,index,pose);}}:{}),...(hasContacts?{contactForPose(sheet,index,pose){lease.assertActive();return family.contactForPose(sheet,index,pose);}}:{}),frameForPose(sheet,index,pose){lease.assertActive();if(!sheets.includes(sheet)||!Number.isSafeInteger(index)||index<0||index>15)throw Error('Choose a registered family pose.');const normal=value.frames.get(sheet+':'+index);return sheet==='activities'&&pose?.sequenceIndex>=4?value.returns.get(index)??normal:normal;}});
   return Object.freeze({provider,release:lease.release});
  },
  info:()=>{const {ready,...state}=cache.info();return {...state,preparedHairFrames:caps.size,underlays:underlays.size,workTools:workTools.size,clothingPoses:garments.size,appearanceFrames:ready*50,accessories:accessoryParts?.info()??null};},
  dispose(){if(disposing)return disposing;closed=true;disposing=cache.dispose().finally(destroyParts);return disposing;},
 });
}
