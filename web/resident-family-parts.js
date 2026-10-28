import {copyResidentFamilyProvider} from './resident-family-provider.js';
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
   const lease=await prepared.acquire({hair:recipe.hair==='side-part-v1'?'sidepart':'curls',hairColour:recipe.hairColour??'chestnut',materials:recipe.materials,hat:recipe.hat??'none',facialHair:recipe.facialHair??'none'});
   try{
    if(closed)throw Error('This resident composer is closed.');
    return copyResidentFamilyProvider(lease.provider);
   }
   finally{lease.release();}
  },
  info:()=>family?.info()??null,
  dispose(){if(!closing){closed=true;closing=(work??Promise.resolve(null)).then(value=>value?.dispose());}return closing;}
 });
}

export function createBundledPartComposer(){return createComposer(false);}
export function createBundledWorkingPartComposer(){return createComposer(true);}

export function createBundledShirtPartComposer(){return createComposer(true,true);}
