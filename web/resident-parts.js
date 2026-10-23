import {loadCharacterImageSource} from './character-image-source.js';
import {preparedFrames} from './sprite-frames.js';
import {attachmentBinding} from './character-attachments.js';
import {createBodyMaterialModel} from './character-materials.js';
import {extractRegisteredAtlasPart,composeActivityUnderlay} from './character-atlas-part.js';
import {prepareRegisteredHair} from './character-hair.js';
import {registeredEquipmentFrame} from './character-equipment.js';
import {loadEquipmentArt} from './character-equipment-parts.js';
import {createAppearanceCache} from './appearance-cache.js';
import {validateResidentPartRecipe} from './resident-part-recipe.js';
import {canonical} from './editor/journal.js';
const root='/art/characters/prototype-v1/',sheets=['base','idle','activities'];
const bodyFiles={base:'body-neutral-base.png',idle:'body-neutral-idle-candidate-v2.png',activities:'body-neutral-activities-candidate-v1.png'};
const toolFiles=Array.from({length:16},(_,i)=>i<4?`cook-equipment-pose-${i}-v${i===0?3:2}.json`:i<8?`water-equipment-pose-${i}-v${i===7?3:1}.json`:i<12?`tend-equipment-pose-${i}-v${i===11?1:2}.json`:`feed-equipment-pose-${i}-v5.json`);
const keyFor=recipe=>JSON.stringify(validateResidentPartRecipe(recipe));
// Sources are bundled, pose-bound and hash-checked. A recipe cannot name a file.
export function createResidentPartLibrary(){
 const sources=new Map(),hairSets=new Map(),preparedHairCounts=new Map();let bodyWork=null,toolWork=null,pinned=new Set();
 const read=async file=>{if(!/^[a-z0-9-]+\.json$/.test(file))throw Error('Choose bundled resident registrations.');const response=await fetch(root+file);if(!response.ok)throw Error('Cannot load resident part registration.');return response.json();};
 const load=file=>{
  if(!/^[a-z0-9-]+\.png$/.test(file))return Promise.reject(Error('Choose bundled resident artwork.'));
  if(!sources.has(file)){const work=loadCharacterImageSource(root+file);sources.set(file,work);work.catch(()=>{if(sources.get(file)===work)sources.delete(file);});}
  return sources.get(file);
 };
 const body=()=>{
  if(!bodyWork){const work=(async()=>{const loaded=await Promise.all(sheets.map(sheet=>load(bodyFiles[sheet]))),frames=Object.fromEntries(sheets.map((sheet,i)=>[sheet,preparedFrames(loaded[i].image,{referenceRow:sheet==='base'?2:0})])),hashes=Object.fromEntries(sheets.map((sheet,i)=>[sheet,loaded[i].sourceHash])),binding=await attachmentBinding(frames,hashes),materials=createBodyMaterialModel(frames,await read('body-materials-v1.json'),{sourceHashes:hashes});return {frames,binding,materials};})();bodyWork=work;work.catch(()=>{if(bodyWork===work)bodyWork=null;});}
  return bodyWork;
 };
 const hair=style=>{
  if(!hairSets.has(style)){const work=(async()=>{
   const [owner,base]=await Promise.all([read(style==='side-part-v1'?'hair-sidepart-all-v1-registration.json':'hair-curls-all-v1-registration.json'),body()]);
   if(owner.schema!==2||canonical(owner.body)!==canonical(base.binding)||sheets.some(sheet=>Object.keys(owner.poses?.[sheet]??{}).sort().join(',')!==Array.from({length:16},(_,i)=>String(i)).sort().join(',')))throw Error('Resident hair/body pose registration is incomplete.');
   const poses=new Map();for(const sheet of sheets)for(let index=0;index<16;index++){
    const pose=owner.poses[sheet][index],source=await load(pose.file),part=extractRegisteredAtlasPart({...source,registration:{sha256:pose.partSha256,size:pose.size,bounds:pose.bounds,sourceRect:pose.sourceRect??[0,0,1254,1254]}});
    let activity=null;if(pose.activity){const a=pose.activity;if(sheet!=='base'||index<12||a.kind!=='stool')throw Error('Unsupported resident activity underlay.');activity=extractRegisteredAtlasPart({...await load(a.file),registration:{sha256:a.sha256,size:a.size,bounds:a.bounds,sourceRect:a.sourceRect}});}
    poses.set(sheet+':'+index,{composer:prepareRegisteredHair({image:part.frame,sourceHash:source.sourceHash,registration:{...pose,body:owner.body}}),activity});
   }
   preparedHairCounts.set(style,poses.size);return poses;
  })();hairSets.set(style,work);work.catch(()=>{if(hairSets.get(style)===work)hairSets.delete(style);});}
  return hairSets.get(style);
 };
 const tools=()=>{
  if(!toolWork){const work=Promise.all(toolFiles.map(async file=>{const registration=await read(file),equipment=await loadEquipmentArt(registration,load);return {registration,equipment};}));toolWork=work;work.catch(()=>{if(toolWork===work)toolWork=null;});}
  return toolWork;
 };
 const cache=createAppearanceCache({maxEntries:16,maxConcurrent:2,maxQueued:24,isPinned:key=>pinned.has(key),compose:async recipe=>{
  const [base,caps,equipment]=await Promise.all([body(),hair(recipe.hair),tools()]),painted=base.materials.provider(recipe.materials),frames=new Map(),returns=new Map();
  for(const sheet of sheets)for(let index=0;index<16;index++){
   const key=sheet+':'+index,cap=caps.get(key),args={body:base.frames[sheet][index],binding:base.binding,appearanceBody:painted.frameForPose(sheet,index)},appearance=await cap.composer.compose({...args,hairColour:recipe.hairColour??'chestnut'});
   let frame=cap.activity?composeActivityUnderlay(appearance,cap.activity):appearance;
   if(sheet==='activities'){
    const {registration,equipment:tool}=equipment[index],options={...args,appearanceFrame:appearance,equipment:tool,registration,sheet,index};frame=await registeredEquipmentFrame(options);
    if([13,14].includes(index)){const keep=registration.parts.map((part,i)=>part.id.startsWith('grain-')?-1:i).filter(i=>i>=0);returns.set(index,await registeredEquipmentFrame({...options,registration:{...registration,parts:keep.map(i=>registration.parts[i])},equipment:{...tool,parts:keep.map(i=>tool.parts[i])}}));}
   }
   frames.set(key,frame);
  }
  return Object.freeze({interpolation:'keyframes',frameForPose(sheet,index,pose){const key=sheet+':'+index;if(!frames.has(key))throw Error('These resident parts have no artwork for this pose.');return sheet==='activities'&&pose?.sequenceIndex>=4?returns.get(index)??frames.get(key):frames.get(key);}});
 }});
 return Object.freeze({
  prepare(recipe){let checked;try{checked=validateResidentPartRecipe(recipe);}catch(error){return Promise.reject(error);}return cache.get(keyFor(checked),checked);},
  provider(recipe){const provider=cache.peek(keyFor(recipe));if(!provider)throw Error('These resident parts are still loading.');return provider;},
  setActive(recipes){if(recipes.length>12)throw Error('Keep at most twelve active resident appearances.');pinned=new Set(recipes.map(keyFor));},
  cacheInfo:()=>({...cache.info(),preparedHairFrames:[...preparedHairCounts.values()].reduce((sum,n)=>sum+n,0),preparedHairRgbaBytes:[...preparedHairCounts.values()].reduce((sum,n)=>sum+n,0)*256*256*4,maximumFrames:16*50,rgbaByteUpperBound:cache.info().entries*50*256*256*4,decodedSources:sources.size}),
 });
}
