import {prepareFamilyAccessories} from './character-family-accessories.js';
import {canonical} from './editor/journal.js';
import {createFamilyBodyMaterialModel,defaultBodyMaterials,validateBodyMaterials,tintBodyMaterials} from './character-materials.js';
import {validateHairColour} from './character-hair-colours.js';
import {prepareRegisteredHair} from './character-hair.js';
import {extractRegisteredAtlasPart,composeActivityUnderlay} from './character-atlas-part.js';
import {loadEquipmentArt} from './character-equipment-parts.js';
import {registeredEquipmentFrame} from './character-equipment.js';
const sheets=['base','idle','activities'],exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(','),clear=c=>{c.width=c.height=0;};
// Internal complete-family provider. The caller retains ownership of the body
// family and decoded sources. Every acquired preview has an explicit lease;
// eviction never invalidates a preview that is still in use.
export async function prepareFamilyAppearanceLibrary({family,materials,owners,equipment,load,accessories=null,maxEntries=12,maxConcurrent=2,maxQueued=24}){
 if(typeof load!=='function'||typeof family?.frameForPose!=='function'||!Number.isInteger(maxEntries)||maxEntries<1||maxEntries>24||!Number.isInteger(maxConcurrent)||maxConcurrent<1||maxConcurrent>4||!Number.isInteger(maxQueued)||maxQueued<1||maxQueued>128)throw Error('Choose bounded complete-family composition limits.');
 const registrations=structuredClone({materials,owners,equipment,accessories}),bodyKey=canonical(family.binding),caps=new Map(),underlays=new Map(),sourceWork=new Map(),tools=[],records=new Map(),queue=[];
 let model=null,accessoryParts=null,active=0,closed=false,disposing=null;
 const alive=()=>{if(closed)throw Error('This character family library has been released.');},source=file=>{
  if(typeof file!=='string'||!/^[a-z0-9-]+\.png$/.test(file))throw Error('Choose registered bundled family artwork.');
  if(!sourceWork.has(file))sourceWork.set(file,Promise.resolve().then(()=>load(file)));return sourceWork.get(file);
 };
 const destroyParts=()=>{for(const cap of caps.values())cap.composer.dispose();caps.clear();for(const a of underlays.values())if(a.frame instanceof HTMLCanvasElement)clear(a.frame);underlays.clear();sourceWork.clear();tools.length=0;accessoryParts?.dispose();accessoryParts=null;model?.clear();model=null;};
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
  if(registrations.accessories!==null)accessoryParts=await prepareFamilyAccessories({family,registration:registrations.accessories,load:source});
 }catch(error){destroyParts();throw error;}
 const validate=input=>{
  if(!input||!exact(input,['hair','hairColour','materials',...['hat','facialHair'].filter(k=>Object.hasOwn(input,k))])||!['curls','sidepart'].includes(input.hair))throw Error('Choose a complete family appearance.');
  const hat=Object.hasOwn(input,'hat')?input.hat:'none',facialHair=Object.hasOwn(input,'facialHair')?input.facialHair:'none';
  if(!['none','straw-v1'].includes(hat)||!['none','short-chestnut-v1'].includes(facialHair)||(hat!=='none'||facialHair!=='none')&&!accessoryParts)throw Error('These complete family accessories are unavailable.');
  return {hair:input.hair,hairColour:validateHairColour(input.hairColour),materials:validateBodyMaterials(input.materials),...(hat==='none'?{}:{hat}),...(facialHair==='none'?{}:{facialHair})};
 };
 const compose=async recipe=>{
  const scratch=new Set(),frames=new Map(),returns=new Map();let completed=false;
  const own=c=>{scratch.add(c);return c;};
  try{
   for(const sheet of sheets)for(let index=0;index<16;index++){
    alive();const body=family.frameForPose(sheet,index),cap=caps.get(recipe.hair+':'+sheet+':'+index);let painted=body;
    if(Object.keys(defaultBodyMaterials).some(k=>recipe.materials[k]!==defaultBodyMaterials[k])){
     const tinted=tintBodyMaterials(body.getContext('2d').getImageData(0,0,256,256),model.mask(sheet,index),recipe.materials);painted=own(document.createElement('canvas'));painted.width=painted.height=256;painted.getContext('2d').putImageData(new ImageData(tinted.data,256,256),0,0);
    }
    const args={body,binding:family.binding,appearanceBody:painted},appearance=own(await cap.composer.compose({...args,referenceBody:family.frameForPose('base',8),hairColour:recipe.hairColour}));alive();let frame=appearance;
    if(cap.activity)frame=own(composeActivityUnderlay(appearance,cap.activity));
    if(sheet==='activities'){
     const options={...args,...tools[index],appearanceFrame:appearance,sheet,index};frame=own(await registeredEquipmentFrame(options));alive();
     if([13,14].includes(index)){const {registration,equipment:art}=tools[index],keep=registration.parts.map((p,i)=>p.id.startsWith('grain-')?-1:i).filter(i=>i>=0);returns.set(index,own(await registeredEquipmentFrame({...options,registration:{...registration,parts:keep.map(i=>registration.parts[i])},equipment:{...art,parts:keep.map(i=>art.parts[i])}})));alive();}
    }
    if(recipe.hat||recipe.facialHair){const originalFrame=frame,flags={hat:!!recipe.hat,facialHair:!!recipe.facialHair};frame=own(accessoryParts.compose(frame,flags,sheet,index));if(originalFrame!==appearance&&scratch.delete(originalFrame))clear(originalFrame);if(returns.has(index)){const original=returns.get(index);returns.set(index,own(accessoryParts.compose(original,flags,sheet,index)));if(scratch.delete(original))clear(original);}}
    frames.set(sheet+':'+index,frame);
    // No material-frame cache: only this pose's tint/intermediate remains live.
    for(const c of [painted,appearance])if(c!==body&&c!==frame&&scratch.delete(c))clear(c);
   }
   completed=true;return {frames,returns};
  }finally{if(completed){for(const frame of [...frames.values(),...returns.values()])scratch.delete(frame);}for(const c of scratch)clear(c);}
 };
 const destroyRecord=record=>{if(record.value){for(const c of [...record.value.frames.values(),...record.value.returns.values()])clear(c);record.value.frames.clear();record.value.returns.clear();record.value=null;}};
 function drain(){while(!closed&&active<maxConcurrent&&queue.length){const job=queue.shift();active++;Promise.resolve().then(()=>compose(job.recipe)).then(job.resolve,job.reject).finally(()=>{active--;drain();});}}
 return Object.freeze({
  async acquire(input){
   alive();const recipe=validate(input),key=canonical(recipe);let record=records.get(key);
   if(!record){
    if(records.size>=maxEntries){const victim=[...records].find(([,r])=>r.value&&!r.users&&!r.waiters);if(!victim)throw Error('Release a character preview before preparing another appearance.');destroyRecord(victim[1]);records.delete(victim[0]);}
    if(active>=maxConcurrent&&queue.length>=maxQueued)throw Error('Character previews are busy. Try again after preparation finishes.');
    record={users:0,waiters:0,value:null,promise:null};const current=record;
    record.promise=new Promise((resolve,reject)=>{queue.push({recipe,resolve,reject});}).then(value=>{current.value=value;return value;},error=>{if(records.get(key)===current)records.delete(key);throw error;});records.set(key,record);drain();
   }else{records.delete(key);records.set(key,record);}
   record.waiters++;let value;try{value=await record.promise;alive();}finally{record.waiters--;}
   record.users++;let released=false;
   const provider=Object.freeze({interpolation:'keyframes',animationProfile:'neutral-v1',frameForPose(sheet,index,pose){alive();if(released)throw Error('This appearance preview has been released.');if(!sheets.includes(sheet)||!Number.isSafeInteger(index)||index<0||index>15)throw Error('Choose a registered family pose.');const normal=value.frames.get(sheet+':'+index);return sheet==='activities'&&pose?.sequenceIndex>=4?value.returns.get(index)??normal:normal;}});
   return Object.freeze({provider,release(){if(released)return;released=true;record.users--;}});
  },
  info:()=>({entries:records.size,active,queued:queue.length,leases:[...records.values()].reduce((n,r)=>n+r.users,0),preparedHairFrames:caps.size,underlays:underlays.size,appearanceFrames:[...records.values()].reduce((n,r)=>n+(r.value?50:0),0),maxEntries,maxConcurrent,maxQueued,closed,accessories:accessoryParts?.info()??null}),
  dispose(){
   if(disposing)return disposing;closed=true;for(const job of queue.splice(0))job.reject(Error('This character family library has been released.'));
   disposing=(async()=>{await Promise.allSettled([...records.values()].map(r=>r.promise));for(const r of records.values())destroyRecord(r);records.clear();destroyParts();})();return disposing;
  },
 });
}
