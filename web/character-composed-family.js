import {createAppearanceLeaseCache} from './appearance-lease-cache.js';
import {canonical} from './editor/journal.js';
import {prepareBodyFamily} from './character-body-family.js';
import {createFamilyBodyMaterialModel,validateBodyMaterials,tintBodyMaterials} from './character-materials.js';
import {validateHairColour} from './character-hair-colours.js';
import {prepareHairFamily} from './character-hair-family.js';
import {paintPreparedResidentPortrait} from './resident-portrait.js';
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
export function validateComposedFamilyRecipe(recipe,family){
 if(!exact(recipe,['schema','family','hairColour','hat','materials'])||recipe.schema!==1||recipe.family!==family||!['none','straw-v1'].includes(recipe.hat))throw Error('Choose an available versioned family appearance.');
 return Object.freeze({schema:1,family,hairColour:validateHairColour(recipe.hairColour),hat:recipe.hat,materials:Object.freeze(validateBodyMaterials(recipe.materials))});
}
// Internal complete-sidepart bundle adapter. Caller owns decoded source images;
// this adapter owns body preparation and the composed appearance, including all
// partial work on failure. No URLs or assets can be selected by the recipe.
export function prepareComposedResidentFamily(args){return prepareComposedFamily(args,null);}
async function prepareComposedFamily({definition,sources,recipe},sharedBody){
 const d=structuredClone(definition);
 if(!exact(d,['schema','id','sources','bodySources','hairSources','hatSource','ownership','materials','hair','hat','portrait'])||d.schema!==1||typeof d.id!=='string'||!/^[a-z][a-z0-9-]{0,63}$/.test(d.id)||!d.sources||Object.keys(d.sources).length<1||Object.keys(d.sources).length>32||!sources||Object.keys(sources).sort().join(',')!==Object.keys(d.sources).sort().join(',')||!exact(d.portrait,['sheet','index','crop'])||d.portrait.sheet!=='base'||d.portrait.index!==8)throw Error('Use a complete versioned composed family definition.');
 const selected=validateComposedFamilyRecipe(recipe,d.id);if(typeof d.hatSource!=='string'||!Object.hasOwn(d.sources,d.hatSource))throw Error('Declare the bundled hat source.');
 for(const [id,spec]of Object.entries(d.sources))if(!/^[a-f0-9]{64}$/.test(spec.sha256??'')||sources[id]?.sourceHash!==spec.sha256)throw Error('Composed family source identity changed.');
 const select=map=>{if(!map||typeof map!=='object'||Array.isArray(map))throw Error('Use declared family source mappings.');return Object.fromEntries(Object.entries(map).map(([id,key])=>{if(!Object.hasOwn(sources,key))throw Error('A composed family source is missing.');return [id,sources[key]];}));};
 let body=sharedBody,model=null,appearance=null,disposed=false;const tint=document.createElement('canvas');tint.width=tint.height=256;
 try{body??=await prepareBodyFamily({ownership:d.ownership,sources:select(d.bodySources)});model=await createFamilyBodyMaterialModel(body,d.materials,{maxFrames:1});const colored=(s,i)=>{const pixels=body.frameForPose(s,i).getContext('2d').getImageData(0,0,256,256),paint=tintBodyMaterials(pixels,model.mask(s,i),selected.materials);tint.getContext('2d').putImageData(new ImageData(paint.data,256,256),0,0);return tint;};appearance=await prepareHairFamily({family:body,registration:d.hair,sources:select(d.hairSources),hairColour:selected.hairColour,appearanceFrameForPose:colored,hat:selected.hat==='none'?null:{registration:d.hat,source:sources[d.hatSource]}});model.clear();model=null;}catch(error){appearance?.dispose();model?.clear();if(!sharedBody)body?.dispose();throw error;}finally{tint.width=tint.height=0;}
 const alive=()=>{if(disposed)throw Error('This composed resident family has been released.');};
 const provider=Object.freeze(Object.fromEntries(['frameForPose','frameOriginForPose','contactForPose','shadowForPose'].map(method=>[method,(...args)=>{alive();return appearance[method](...args);}])));
 return Object.freeze({recipe:selected,provider,portrait(canvas,{filter='none'}={}){alive();paintPreparedResidentPortrait(canvas,appearance.frameForPose(d.portrait.sheet,d.portrait.index),{filter,origin:appearance.frameOriginForPose(d.portrait.sheet,d.portrait.index),crop:d.portrait.crop});},info(){return {disposed,...appearance.info()};},dispose(){if(disposed)return;disposed=true;appearance.dispose();if(!sharedBody)body.dispose();}});
}

// Reuse identical recipes and bound distinct prepared appearances. Active
// previews hold leases; callers must release them before capacity can be reused.
export function createComposedResidentLibrary({definition,sources,maxEntries=2,maxConcurrent=1,maxQueued=4}){
 const data=structuredClone(definition),loaded=Object.fromEntries(Object.entries(sources).map(([id,value])=>[id,{...value}]));
 let body=null,bodyWork=null,closing=null;
 const sharedBody=()=>{if(!bodyWork)bodyWork=prepareBodyFamily({ownership:data.ownership,sources:Object.fromEntries(Object.entries(data.bodySources).map(([id,key])=>[id,loaded[key]]))}).then(value=>{body=value;return value;},error=>{bodyWork=null;throw error;});return bodyWork;};
 const cache=createAppearanceLeaseCache({maxEntries,maxConcurrent,maxQueued,prepare:async recipe=>prepareComposedFamily({definition:data,sources:loaded,recipe},await sharedBody()),destroy:value=>value.dispose()});
 return Object.freeze({async acquire(input){const recipe=validateComposedFamilyRecipe(input,data.id),lease=await cache.acquire(canonical(recipe),recipe),value=lease.value;const provider=Object.freeze(Object.fromEntries(['frameForPose','frameOriginForPose','contactForPose','shadowForPose'].map(method=>[method,(...args)=>{lease.assertActive();return value.provider[method](...args);}])));return Object.freeze({recipe:value.recipe,provider,portrait(...args){lease.assertActive();return value.portrait(...args);},release:lease.release});},info:()=>({...cache.info(),preparedBodyPoses:body?48:0}),dispose(){if(!closing)closing=cache.dispose().finally(async()=>{await bodyWork?.catch(()=>{});body?.dispose();body=null;bodyWork=null;});return closing;}});
}
