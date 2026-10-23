export const residentAppearanceCatalog=Object.freeze([
 {key:'iara',version:1,accent:'#d8a044'},
 {key:'bento',version:1,accent:'#588b83'},
 {key:'luz',version:1,accent:'#d27a59'},
 {key:'caua',version:1,accent:'#6a8e58'},
 {key:'nina',version:1,accent:'#8580a0'},
].map(Object.freeze));
export const residentLookKeys=Object.freeze(residentAppearanceCatalog.map(look=>look.key));
export function validateResidentAppearance(appearance){
 if(appearance?.schema===2)return validateResidentPartRecipe(appearance);
 if(!appearance||typeof appearance!=='object'||Array.isArray(appearance)||Object.keys(appearance).sort().join(',')!=='preset,version'||!residentLookKeys.includes(appearance.preset)||appearance.version!==1)throw Error('This resident artwork revision is unavailable.');
 return {preset:appearance.preset,version:appearance.version};
}
export function residentLookIndex(person){
 const checked=validateResidentAppearance(person?.appearance);
 if(!checked.preset)throw Error('This resident appearance uses composed parts, not a preset sheet.');
 return residentLookKeys.indexOf(checked.preset);
}
export function residentAppearanceInfo(appearance){
 const checked=validateResidentAppearance(appearance);
 if(checked.schema===2)return {key:JSON.stringify(checked),version:2,accent:'#588b83'};
 return residentAppearanceCatalog.find(look=>look.key===checked.preset);
}
import {validateResidentPartRecipe} from './resident-part-recipe.js';
