import {residentLookKeys,validateResidentAppearance} from './resident-look.js';
import {preparedFrames} from './sprite-frames.js';
const sheets=Object.freeze(['base','idle','activities']);
const bundledImage=(preset,sheet)=>{
 const image=new Image(),suffix=sheet==='base'?'':'-'+sheet;
 image.src=new URL(`./art/animations/${preset}${suffix}.png`,import.meta.url);
 return image;
};
// One catalog-owned provider per appearance, shared by portraits, editor and
// gameplay. Person IDs never select artwork. Draft part recipes stay isolated
// until their complete art sets and production compatibility are approved.
export function createResidentAppearanceLibrary({base=[],idle=[],activities=[],loadImage=bundledImage}={}){
 const supplied={base:[...base],idle:[...idle],activities:[...activities]},entries=new Map();let parts=null,partsWork=null,active=[];
 const prepareParts=async recipe=>{
  if(!partsWork){partsWork=import('./resident-parts.js').then(({createResidentPartLibrary})=>{parts=createResidentPartLibrary();parts.setActive(active);return parts;});partsWork.catch(()=>{partsWork=null;});}
  return (await partsWork).prepare(recipe);
 };
 for(const [sheet,images]of Object.entries(supplied))if(images.length&&images.length!==residentLookKeys.length)throw Error('Provide the complete bundled '+sheet+' catalog.');
 function entry(appearance){
  const checked=validateResidentAppearance(appearance),key=checked.preset+':'+checked.version;
  if(!entries.has(key)){
   const index=residentLookKeys.indexOf(checked.preset),images=new Map(),pending=new Map();
   const imageFor=sheet=>{
    if(!sheets.includes(sheet))throw Error('This resident animation sheet is unavailable.');
    if(!images.has(sheet))images.set(sheet,supplied[sheet][index]??loadImage(checked.preset,sheet));
    return images.get(sheet);
   };
   const provider=Object.freeze({interpolation:'crossfade',frameForPose(sheet,index){
    if(!Number.isInteger(index)||index<0||index>=16)throw Error('This resident animation pose is unavailable.');
    const frames=preparedFrames(imageFor(sheet),{referenceRow:sheet==='base'?2:0});
    if(!frames)throw Error('These resident poses have not loaded yet.');
    return frames[index];
   }});
   entries.set(key,{provider,ready(requested){return requested.every(sheet=>{const image=images.get(sheet)??supplied[sheet]?.[index];return image?.complete&&image.naturalWidth>0;});},async prepare(requested){
    await Promise.all(requested.map(sheet=>{
     if(!sheets.includes(sheet))throw Error('This resident animation sheet is unavailable.');
     if(!pending.has(sheet)){
      const image=imageFor(sheet),work=Promise.resolve().then(()=>image.decode()).then(()=>{provider.frameForPose(sheet,0);});
      pending.set(sheet,work);work.catch(()=>{if(pending.get(sheet)===work){pending.delete(sheet);images.delete(sheet);}});
     }
     return pending.get(sheet);
    }));
    return provider;
   }});
  }
  return entries.get(key);
 }
 return Object.freeze({
  provider(appearance){const checked=validateResidentAppearance(appearance);if(checked.schema===2){if(!parts)throw Error('These resident parts are still loading.');return parts.provider(checked);}return entry(checked).provider;},
  portraitFrame(appearance){const checked=validateResidentAppearance(appearance);if(checked.schema===2){if(!parts)throw Error('These resident parts are still loading.');return parts.provider(checked).frameForPose('base',8);}return entry(checked).provider.frameForPose('base',8);},
  isReady(appearance,{sheets:requested=['base']}={}){try{if(!Array.isArray(requested)||!requested.length||requested.some(sheet=>!sheets.includes(sheet)))return false;const checked=validateResidentAppearance(appearance);return checked.schema===2?!!parts?.provider(checked):entry(checked).ready(requested);}catch{return false;}},
  setActive(appearances){if(!Array.isArray(appearances)||appearances.length>12)throw Error('Keep at most twelve active resident appearances.');active=appearances.map(validateResidentAppearance).filter(recipe=>recipe.schema===2);parts?.setActive(active);},
  partCacheInfo:()=>parts?.cacheInfo()??null,
  prepare(appearance,{sheets:requested=sheets}={}){
   if(!Array.isArray(requested)||!requested.length||requested.some(sheet=>!sheets.includes(sheet)))return Promise.reject(Error('Choose available resident animation sheets.'));
   try{const checked=validateResidentAppearance(appearance);return checked.schema===2?prepareParts(checked):entry(checked).prepare([...new Set(requested)]);}catch(error){return Promise.reject(error);}
  },
 });
}
