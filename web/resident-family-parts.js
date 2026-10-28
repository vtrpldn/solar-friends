import {prepareBundledResidentFamily,prepareBundledWorkingResidentFamily,prepareBundledShirtResidentFamily} from './character-family-bundle.js';

// Public previews retain providers. Copy whole native frames before releasing
// the internal lease; cache eviction must never erase a preview still on screen.
function createComposer(working,shirt=false){
 const prepare=shirt?prepareBundledShirtResidentFamily:working?prepareBundledWorkingResidentFamily:prepareBundledResidentFamily;
 let work=null,family=null,closing=null,closed=false;
 const ready=()=>work??=(prepare({maxEntries:2,maxConcurrent:2,maxQueued:2}).then(value=>{family=value;return value;}).catch(error=>{work=null;throw error;}));
 return Object.freeze({
  async compose(recipe){
   if(closed)throw Error('This resident composer is closed.');
   if(recipe?.body!=='relaxed-v1'||recipe.assetVersion!==(shirt?'resident-parts-v4':working?'resident-parts-v3':'resident-parts-v2')||!['short-curls-v1','side-part-v1'].includes(recipe.hair))throw Error('Choose a supported bundled resident family.');
   const prepared=await ready();if(closed)throw Error('This resident composer is closed.');
   const lease=await prepared.acquire({hair:recipe.hair==='side-part-v1'?'sidepart':'curls',hairColour:recipe.hairColour??'chestnut',materials:recipe.materials,hat:recipe.hat??'none',facialHair:recipe.facialHair??'none'}),frames=new Map(),returns=new Map(),owned=[];
   const copy=source=>{if(source.width!==256||source.height!==256)throw Error('Resident frames must retain their native size.');const canvas=document.createElement('canvas');canvas.width=canvas.height=256;owned.push(canvas);const context=canvas.getContext('2d');if(!context)throw Error('Cannot prepare this resident preview.');context.drawImage(source,0,0);return canvas;};
   try{
    if(closed)throw Error('This resident composer is closed.');
    for(const sheet of ['base','idle','activities'])for(let index=0;index<16;index++)frames.set(sheet+':'+index,copy(lease.provider.frameForPose(sheet,index)));
    for(const index of [13,14])returns.set(index,copy(lease.provider.frameForPose('activities',index,{sequenceIndex:5})));
    return Object.freeze({interpolation:'keyframes',animationProfile:'neutral-v1',frameForPose(sheet,index,pose){const frame=frames.get(sheet+':'+index);if(!Number.isSafeInteger(index)||!frame)throw Error('Choose a registered resident pose.');return sheet==='activities'&&pose?.sequenceIndex>=4?returns.get(index)??frame:frame;}});
   }catch(error){for(const canvas of owned)canvas.width=canvas.height=0;throw error;}
   finally{lease.release();}
  },
  info:()=>family?.info()??null,
  dispose(){if(!closing){closed=true;closing=(work??Promise.resolve(null)).then(value=>value?.dispose());}return closing;}
 });
}

export function createBundledPartComposer(){return createComposer(false);}
export function createBundledWorkingPartComposer(){return createComposer(true);}

export function createBundledShirtPartComposer(){return createComposer(true,true);}
