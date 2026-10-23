import {defaultBodyMaterials,validateBodyMaterials} from './character-materials.js';
import {hairColourPalettes,validateHairColour} from './character-hair-colours.js';
export const residentPartCatalog=Object.freeze({schema:2,assetVersion:'resident-parts-v1',bodies:Object.freeze(['neutral-v1']),hats:Object.freeze(['none','straw-v1']),hairstyles:Object.freeze(['short-curls-v1','side-part-v1']),hair_colours:Object.freeze(Object.keys(hairColourPalettes))});
export function validateResidentPartRecipe(recipe){
 if(!recipe||typeof recipe!=='object'||Array.isArray(recipe)||['schema','assetVersion','body','hair','materials'].some(key=>!Object.hasOwn(recipe,key))||Object.keys(recipe).some(key=>!['schema','assetVersion','body','hair','hairColour','hat','materials'].includes(key))||recipe.schema!==2||recipe.assetVersion!==residentPartCatalog.assetVersion||!residentPartCatalog.bodies.includes(recipe.body)||!residentPartCatalog.hairstyles.includes(recipe.hair))throw Error('These resident parts or their artwork revision are unavailable.');
 const hat=Object.hasOwn(recipe,'hat')?recipe.hat:'none';if(!residentPartCatalog.hats.includes(hat))throw Error('This resident hat is unavailable.');
 const hairColour=validateHairColour(Object.hasOwn(recipe,'hairColour')?recipe.hairColour:'chestnut');
 return {schema:2,assetVersion:recipe.assetVersion,body:recipe.body,hair:recipe.hair,materials:validateBodyMaterials(recipe.materials),...(hairColour==='chestnut'?{}:{hairColour}),...(hat==='none'?{}:{hat})};
}
export function residentPartRecipe({hair='short-curls-v1',hairColour='chestnut',hat='none',materials=defaultBodyMaterials}={}){return validateResidentPartRecipe({schema:2,assetVersion:'resident-parts-v1',body:'neutral-v1',hair,materials,hairColour,hat});}
