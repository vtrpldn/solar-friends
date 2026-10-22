import {validateBodyMaterials,defaultBodyMaterials} from './character-materials.js';
// This catalog is a draft, not an approved resident appearance or save format.
// Reject unknown versions/parts rather than silently substituting another look.
const keys=['schema','assetVersion','body','hair','materials'];
export function validatePrototypeAppearanceRecipe(recipe){
 if(!recipe||typeof recipe!=='object'||Array.isArray(recipe)||Object.keys(recipe).length!==keys.length||Object.keys(recipe).some(key=>!keys.includes(key))||recipe.schema!==1||recipe.assetVersion!=='resident-prototype-v1'||recipe.body!=='neutral-v1'||recipe.hair!=='short-curls-v1')throw Error('This draft appearance recipe or artwork version is unavailable.');
 return {schema:1,assetVersion:recipe.assetVersion,body:recipe.body,hair:recipe.hair,materials:validateBodyMaterials(recipe.materials)};
}
export function prototypeAppearanceRecipe(materials=defaultBodyMaterials){
 return validatePrototypeAppearanceRecipe({schema:1,assetVersion:'resident-prototype-v1',body:'neutral-v1',hair:'short-curls-v1',materials});
}
