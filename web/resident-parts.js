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
import {composeHatProvider} from './character-hat-provider.js';
import {hatReviewClips} from './character-hat-poses.js';
import {prepareFacialHairParts} from './character-facial-hair-parts.js';
import {createBundledPartComposer,createBundledWorkingPartComposer,createBundledShirtPartComposer,createBundledSleepPartComposer,createBundledSleepShirtPartComposer,createBundledBroadPartComposer} from './resident-family-parts.js';
import {canonical} from './editor/journal.js';
const root='/art/characters/prototype-v1/',sheets=['base','idle','activities'];
const bodyFiles={base:'body-neutral-base.png',idle:'body-neutral-idle-candidate-v2.png',activities:'body-neutral-activities-candidate-v1.png'};
const toolFiles=Array.from({length:16},(_,i)=>i<4?`cook-equipment-pose-${i}-v${i===0?3:2}.json`:i<8?`water-equipment-pose-${i}-v${i===7?3:1}.json`:i<12?`tend-equipment-pose-${i}-v${i===11?1:2}.json`:`feed-equipment-pose-${i}-v5.json`);
const keyFor=recipe=>JSON.stringify(validateResidentPartRecipe(recipe));
const settledValues=async promises=>{const results=await Promise.allSettled(promises),failure=results.find(r=>r.status==='rejected');if(failure)throw failure.reason;return results.map(r=>r.value);};
// Sources are bundled, pose-bound and hash-checked. A recipe cannot name a file.
export function createResidentPartLibrary(){
 const preparedKeys=new WeakMap(),sources=new Map(),hairSets=new Map(),preparedHairCounts=new Map();let bodyWork=null,toolWork=null,hatWork=null,facialWork=null,facialPrepared=null,pinned=new Set(),familyComposer=null,workingFamilyComposer=null,shirtFamilyComposer=null,sleepFamilyComposer=null,sleepShirtFamilyComposer=null,broadFamilyComposer=null,closed=false,closing=null;
 const alive=()=>{if(closed)throw Error('This resident part library has been released.');};
 const read=async file=>{if(!/^[a-z0-9-]+\.json$/.test(file))throw Error('Choose bundled resident registrations.');const response=await fetch(root+file);if(!response.ok)throw Error('Cannot load resident part registration.');return response.json();};
 const load=file=>{
  if(!/^[a-z0-9-]+\.png$/.test(file))return Promise.reject(Error('Choose bundled resident artwork.'));
  if(!sources.has(file)){const work=loadCharacterImageSource(root+file);sources.set(file,work);work.catch(()=>{if(sources.get(file)===work)sources.delete(file);});}
  return sources.get(file);
 };
 const body=()=>{
  if(!bodyWork){const work=(async()=>{const loaded=await settledValues(sheets.map(sheet=>load(bodyFiles[sheet]))),frames=Object.fromEntries(sheets.map((sheet,i)=>[sheet,preparedFrames(loaded[i].image,{referenceRow:sheet==='base'?2:0})])),hashes=Object.fromEntries(sheets.map((sheet,i)=>[sheet,loaded[i].sourceHash])),binding=await attachmentBinding(frames,hashes),materials=createBodyMaterialModel(frames,await read('body-materials-v1.json'),{sourceHashes:hashes});return {frames,binding,materials};})();bodyWork=work;work.catch(()=>{if(bodyWork===work)bodyWork=null;});}
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
  if(!toolWork){const work=settledValues(toolFiles.map(async file=>{const registration=await read(file),equipment=await loadEquipmentArt(registration,load);return {registration,equipment};}));toolWork=work;work.catch(()=>{if(toolWork===work)toolWork=null;});}
  return toolWork;
 };
 const hat=()=>{if(!hatWork){const work=(async()=>{const registrations=new Map(await settledValues(Object.keys(hatReviewClips).map(async clip=>[clip,await read(`straw-hat-${clip}-v1-registration.json`)])));const source=registrations.get('breathe').source;return {registrations,...await load(source.file)};})();hatWork=work;work.catch(()=>{if(hatWork===work)hatWork=null;});}return hatWork;};
 const facialParts=()=>{if(!facialWork){const work=(async()=>{const [owner,base]=await Promise.all([read('facial-short-chestnut-v1-registration.json'),body()]);try{const parts=await prepareFacialHairParts({owner,binding:base.binding,load});facialPrepared=parts;return parts;}finally{for(const source of Array.isArray(owner.sources)?owner.sources:[])if(/^facial-short-chestnut-source-\d{2}-v1\.png$/.test(source.file??'')){const pending=sources.get(source.file);const loaded=await pending?.catch(()=>null);loaded?.dispose?.();if(sources.get(source.file)===pending)sources.delete(source.file);}}})();facialWork=work;work.catch(()=>{if(facialWork===work)facialWork=null;});}return facialWork;};
 const cache=createAppearanceCache({maxEntries:16,maxConcurrent:2,maxQueued:24,isPinned:key=>pinned.has(key),compose:async recipe=>{
  if(recipe.body==='broad-v1')return (broadFamilyComposer??=createBundledBroadPartComposer()).compose(recipe);
  if(recipe.assetVersion==='resident-parts-v5')return (sleepFamilyComposer??=createBundledSleepPartComposer()).compose(recipe);
  if(recipe.assetVersion==='resident-parts-v6')return (sleepShirtFamilyComposer??=createBundledSleepShirtPartComposer()).compose(recipe);
  if(recipe.body==='relaxed-v1')return recipe.assetVersion==='resident-parts-v4'?(shirtFamilyComposer??=createBundledShirtPartComposer()).compose(recipe):recipe.assetVersion==='resident-parts-v3'?(workingFamilyComposer??=createBundledWorkingPartComposer()).compose(recipe):(familyComposer??=createBundledPartComposer()).compose(recipe);
  const [base,caps,equipment,face]=await settledValues([body(),hair(recipe.hair),tools(),recipe.facialHair?facialParts():null]),painted=base.materials.provider(recipe.materials),frames=new Map(),returns=new Map();
  for(const sheet of sheets)for(let index=0;index<16;index++){
   const key=sheet+':'+index,cap=caps.get(key),args={body:base.frames[sheet][index],binding:base.binding,appearanceBody:painted.frameForPose(sheet,index)},appearance=await cap.composer.compose({...args,hairColour:recipe.hairColour??'chestnut'});
   let frame=cap.activity?composeActivityUnderlay(appearance,cap.activity):appearance;
   if(sheet==='activities'){
    const {registration,equipment:tool}=equipment[index],options={...args,appearanceFrame:appearance,equipment:tool,registration,sheet,index};frame=await registeredEquipmentFrame(options);
    if([13,14].includes(index)){const keep=registration.parts.map((part,i)=>part.id.startsWith('grain-')?-1:i).filter(i=>i>=0);returns.set(index,await registeredEquipmentFrame({...options,registration:{...registration,parts:keep.map(i=>registration.parts[i])},equipment:{...tool,parts:keep.map(i=>tool.parts[i])}}));}
   }
   if(face){const original=frame;frame=face.compose(original,sheet,index);original.width=original.height=0;if(returns.has(index)){const returned=returns.get(index);returns.set(index,face.compose(returned,sheet,index));returned.width=returned.height=0;}}
   frames.set(key,frame);
  }
  const provider=Object.freeze({interpolation:'keyframes',animationProfile:'neutral-v1',frameForPose(sheet,index,pose){const key=sheet+':'+index;if(!frames.has(key))throw Error('These resident parts have no artwork for this pose.');return sheet==='activities'&&pose?.sequenceIndex>=4?returns.get(index)??frames.get(key):frames.get(key);}});
  return recipe.hat==='straw-v1'?composeHatProvider({provider,binding:base.binding,...await hat()}):provider;
 }});
 return Object.freeze({
  prepare(recipe){let checked;try{alive();checked=validateResidentPartRecipe(recipe);}catch(error){return Promise.reject(error);}const key=keyFor(checked);return cache.get(key,checked).then(provider=>{preparedKeys.set(provider,key);return provider;});},
  provider(recipe){alive();const provider=cache.peek(keyFor(recipe));if(!provider)throw Error('These resident parts are still loading.');return provider;},
  installPrepared(recipes,providers){
   alive();
   if(!Array.isArray(recipes)||!Array.isArray(providers)||recipes.length>12||recipes.length!==providers.length)throw Error('Install at most twelve prepared residents.');
   const keys=recipes.map(keyFor);for(let i=0;i<keys.length;i++)if(preparedKeys.get(providers[i])!==keys[i])throw Error('Use the provider prepared for this exact resident recipe.');
   const previous=pinned,installedPins=new Set(keys);pinned=installedPins;
   try{const undo=cache.install([...new Map(keys.map((key,i)=>[key,providers[i]]))]);return ()=>{if(pinned!==installedPins||!undo())return false;pinned=previous;return true;};}catch(error){pinned=previous;throw error;}
  },
  setActive(recipes){alive();if(!Array.isArray(recipes)||recipes.length>12)throw Error('Keep at most twelve active resident appearances.');const keys=new Set(recipes.map(keyFor));if(keys.size!==pinned.size||[...keys].some(key=>!pinned.has(key)))pinned=keys;},
  dispose(){
   if(closing)return closing;closed=true;pinned.clear();
   closing=cache.dispose().then(async()=>{
    await Promise.allSettled([bodyWork,toolWork,hatWork,facialWork,...hairSets.values()]);
    await Promise.allSettled([...sources.values()]);
    const results=await Promise.allSettled([familyComposer,workingFamilyComposer,shirtFamilyComposer,sleepFamilyComposer,sleepShirtFamilyComposer,broadFamilyComposer].filter(Boolean).map(composer=>composer.dispose()));
    for(const work of hairSets.values()){const poses=await work.catch(()=>null);for(const part of poses?.values()??[])part.composer.dispose();}
    facialPrepared?.dispose();facialPrepared=null;const base=await bodyWork?.catch(()=>null);base?.materials.clear();
    for(const work of sources.values()){const source=await work.catch(()=>null);source?.dispose?.();}
    sources.clear();hairSets.clear();preparedHairCounts.clear();bodyWork=toolWork=hatWork=facialWork=null;
    familyComposer=workingFamilyComposer=shirtFamilyComposer=sleepFamilyComposer=sleepShirtFamilyComposer=broadFamilyComposer=null;
    const failure=results.find(r=>r.status==='rejected');if(failure)throw failure.reason;
   });return closing;
  },
  cacheInfo:()=>({...cache.info(),preparedHairFrames:[...preparedHairCounts.values()].reduce((sum,n)=>sum+n,0),preparedHairRgbaBytes:[...preparedHairCounts.values()].reduce((sum,n)=>sum+n,0)*256*256*4,facialOverlayFrames:facialPrepared?.cacheInfo().entries??0,facialOverlayRgbaBytes:facialPrepared?.cacheInfo().rgbaByteUpperBound??0,maximumFrames:16*50,rgbaByteUpperBound:cache.info().entries*50*256*256*4,decodedSources:sources.size,familyCache:familyComposer?.info()??null,workFamilyCache:workingFamilyComposer?.info()??null,shirtFamilyCache:shirtFamilyComposer?.info()??null,sleepFamilyCache:sleepFamilyComposer?.info()??null,sleepShirtFamilyCache:sleepShirtFamilyComposer?.info()??null,broadFamilyCache:broadFamilyComposer?.info()??null}),
 });
}
