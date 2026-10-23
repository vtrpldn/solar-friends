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
 const supplied={base:[...base],idle:[...idle],activities:[...activities]},entries=new Map();
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
   entries.set(key,{provider,async prepare(requested){
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
  provider:appearance=>entry(appearance).provider,
  portraitFrame:appearance=>entry(appearance).provider.frameForPose('base',8),
  prepare(appearance,{sheets:requested=sheets}={}){
   if(!Array.isArray(requested)||!requested.length||requested.some(sheet=>!sheets.includes(sheet)))return Promise.reject(Error('Choose available resident animation sheets.'));
   try{return entry(appearance).prepare([...new Set(requested)]);}catch(error){return Promise.reject(error);}
  },
 });
}
