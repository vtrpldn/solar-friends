// Internal full-family review adapter; no player recipe/catalogue activation.
import {prepareBodyFamily} from '../character-body-family.js';
import {prepareFamilyAppearanceLibrary} from '../character-family-appearance.js';
export async function prepareFamilyWorkReview({bundle,workEquipment,load}){
 const loaded={};let family=null,library=null,closing=null;const leases=[];
 try{
  for(const [id,file]of Object.entries(bundle.bodySources))loaded[id]=await load(file);
  family=await prepareBodyFamily({ownership:bundle.ownership,sources:loaded});
  library=await prepareFamilyAppearanceLibrary({family,materials:bundle.materials,owners:bundle.owners,equipment:bundle.equipment,accessories:bundle.accessories,workEquipment,load,maxEntries:4});
  for(const hair of ['curls','sidepart'])for(const equipped of [false,true])leases.push(await library.acquire({hair,hairColour:'chestnut',materials:{skin:'copper',shirt:'teal',shorts:'sage',shoes:'graphite'},...(equipped?{hat:'straw-v1',facialHair:'short-chestnut-v1'}:{})}));
  return Object.freeze({providers:Object.freeze(leases.map(l=>l.provider)),info:()=>library.info(),dispose(){if(!closing){for(const lease of leases)lease.release();closing=library.dispose().finally(()=>family.dispose());}return closing;}});
 }catch(error){for(const lease of leases)lease.release();await library?.dispose();family?.dispose();throw error;}
}
