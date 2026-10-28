import {residentLookKeys,validateResidentAppearance} from './resident-look.js';
import {preparedFrames} from './sprite-frames.js';
const sheets=Object.freeze(['base','idle','activities']);
const castKey=appearances=>JSON.stringify([...new Set(appearances.map(a=>JSON.stringify(a)))].sort());
const bundledImage=(preset,sheet)=>{
 const image=new Image(),suffix=sheet==='base'?'':'-'+sheet;
 image.src=new URL(`./art/animations/${preset}${suffix}.png`,import.meta.url);
 return image;
};
// One catalog-owned provider per appearance, shared by portraits, editor and
// gameplay. Person IDs never select artwork. Draft part recipes stay isolated
// until their complete art sets and production compatibility are approved.
export function createResidentAppearanceLibrary({base=[],idle=[],activities=[],loadImage=bundledImage}={}){
 const supplied={base:[...base],idle:[...idle],activities:[...activities]},entries=new Map();let parts=null,partsWork=null,active=[],activeKey='[]',activation=0,closed=false,closing=null,partsGeneration=0;const retiring=new Set();
 const alive=()=>{if(closed)throw Error('This resident appearance library has been released.');};
 const closeSignal=new AbortController(),whileOpen=work=>new Promise((resolve,reject)=>{const signal=closeSignal.signal,abort=()=>reject(Error('This resident appearance library has been released.')),cleanup=()=>signal.removeEventListener('abort',abort);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();Promise.resolve(work).then(provider=>{cleanup();if(closed)abort();else resolve(provider);},error=>{cleanup();reject(error);});});
 const prepareParts=async recipe=>{
  if(!partsWork){const generation=partsGeneration,work=import('./resident-parts.js').then(({createResidentPartLibrary})=>{alive();if(generation!==partsGeneration)throw Error('This resident artwork generation has been released.');const library=createResidentPartLibrary();library.setActive(active);parts=library;return library;});partsWork=work;work.catch(()=>{if(partsWork===work)partsWork=null;});}
  const library=await partsWork;alive();return library.prepare(recipe);
 };
 for(const [sheet,images]of Object.entries(supplied))if(images.length&&images.length!==residentLookKeys.length)throw Error('Provide the complete bundled '+sheet+' catalog.');
 function entry(appearance){
  const checked=validateResidentAppearance(appearance),key=checked.preset+':'+checked.version;
  if(!entries.has(key)){
   const index=residentLookKeys.indexOf(checked.preset),images=new Map(),pending=new Map();
   const imageFor=sheet=>{
    if(!sheets.includes(sheet))throw Error('This resident animation sheet is unavailable.');
    if(closed&&!images.has(sheet)&&!supplied[sheet][index])throw Error('This released appearance has no prepared sheet.');
    if(!images.has(sheet))images.set(sheet,supplied[sheet][index]??loadImage(checked.preset,sheet));
    return images.get(sheet);
   };
   const provider=Object.freeze({interpolation:'crossfade',frameForPose(sheet,index){
    if(!Number.isInteger(index)||index<0||index>=16)throw Error('This resident animation pose is unavailable.');
    const frames=preparedFrames(imageFor(sheet),{referenceRow:sheet==='base'?2:0});
    if(!frames)throw Error('These resident poses have not loaded yet.');
    return frames[index];
   }});
   entries.set(key,{provider,pending,ready(requested){return requested.every(sheet=>{const image=images.get(sheet)??supplied[sheet]?.[index];return image?.complete&&image.naturalWidth>0;});},async prepare(requested){
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
  provider(appearance){alive();const checked=validateResidentAppearance(appearance);if(checked.schema===2){if(!parts)throw Error('These resident parts are still loading.');return parts.provider(checked);}return entry(checked).provider;},
  portraitFrame(appearance){alive();const checked=validateResidentAppearance(appearance);if(checked.schema===2){if(!parts)throw Error('These resident parts are still loading.');return parts.provider(checked).frameForPose('base',8);}return entry(checked).provider.frameForPose('base',8);},
  isReady(appearance,{sheets:requested=['base']}={}){try{alive();if(!Array.isArray(requested)||!requested.length||requested.some(sheet=>!sheets.includes(sheet)))return false;const checked=validateResidentAppearance(appearance);return checked.schema===2?!!parts?.provider(checked):entry(checked).ready(requested);}catch{return false;}},
  installPrepared(appearances,providers){
   alive();
   if(!Array.isArray(appearances)||!Array.isArray(providers)||appearances.length>12||appearances.length!==providers.length)throw Error('Install at most twelve prepared resident appearances.');
   const checked=appearances.map(validateResidentAppearance),custom=[],prepared=[];
   for(let i=0;i<checked.length;i++){if(checked[i].schema===2){custom.push(checked[i]);prepared.push(providers[i]);}else if(entry(checked[i]).provider!==providers[i])throw Error('Use the provider prepared for this resident.');}
   if(custom.length&&!parts)throw Error('These resident parts are still loading.');
   const previous=active,previousKey=activeKey,undo=parts?.installPrepared(custom,prepared),revision=++activation;active=custom;activeKey=castKey(checked);return ()=>{if(activation!==revision||undo&&!undo())return false;activation++;active=previous;activeKey=previousKey;return true;};
  },
  setActive(appearances){alive();if(!Array.isArray(appearances)||appearances.length>12)throw Error('Keep at most twelve active resident appearances.');const checked=appearances.map(validateResidentAppearance),key=castKey(checked),custom=checked.filter(recipe=>recipe.schema===2);parts?.setActive(custom);if(key!==activeKey){activation++;activeKey=key;}active=custom;},
  releaseInactiveParts(){
   alive();if(active.length||!parts&&!partsWork)return Promise.resolve(false);
   const previous=parts,pending=partsWork;partsGeneration++;activation++;parts=partsWork=null;
   const work=(previous?previous.dispose():Promise.resolve(pending).then(library=>library?.dispose(),()=>{})).then(()=>true);
   retiring.add(work);work.then(()=>retiring.delete(work),()=>retiring.delete(work));return work;
  },
  dispose(){
   if(closing)return closing;closed=true;closeSignal.abort();partsGeneration++;activation++;active=[];activeKey='[]';
   const closeParts=parts?parts.dispose():Promise.resolve(partsWork).catch(()=>null).then(library=>library?.dispose());
   const work=[closeParts,...retiring,...[...entries.values()].flatMap(entry=>[...entry.pending.values()])];
   closing=Promise.allSettled(work).then(results=>{entries.clear();for(const values of Object.values(supplied))values.length=0;parts=partsWork=null;const failure=results.find(r=>r.status==='rejected');if(failure)throw failure.reason;});return closing;
  },
  ownershipInfo:()=>({closed,partsReady:!!parts,partsRequested:!!partsWork,retiring:retiring.size}),
  partCacheInfo:()=>parts?.cacheInfo()??null,
  prepare(appearance,{sheets:requested=sheets}={}){
   if(!Array.isArray(requested)||!requested.length||requested.some(sheet=>!sheets.includes(sheet)))return Promise.reject(Error('Choose available resident animation sheets.'));
   try{alive();const checked=validateResidentAppearance(appearance),work=checked.schema===2?prepareParts(checked):entry(checked).prepare([...new Set(requested)]);return whileOpen(work);}catch(error){return Promise.reject(error);}
  },
 });
}
