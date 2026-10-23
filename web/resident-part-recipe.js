import {defaultBodyMaterials,validateBodyMaterials} from './character-materials.js';
export const residentPartCatalog=Object.freeze({schema:2,assetVersion:'resident-parts-v1',bodies:Object.freeze(['neutral-v1']),hairstyles:Object.freeze(['short-curls-v1','side-part-v1'])});
export function validateResidentPartRecipe(recipe){
 if(!recipe||typeof recipe!=='object'||Array.isArray(recipe)||Object.keys(recipe).sort().join(',')!=='assetVersion,body,hair,materials,schema'||recipe.schema!==2||recipe.assetVersion!==residentPartCatalog.assetVersion||!residentPartCatalog.bodies.includes(recipe.body)||!residentPartCatalog.hairstyles.includes(recipe.hair))throw Error('These resident parts or their artwork revision are unavailable.');
 return {schema:2,assetVersion:recipe.assetVersion,body:recipe.body,hair:recipe.hair,materials:validateBodyMaterials(recipe.materials)};
}
export function residentPartRecipe({hair='short-curls-v1',materials=defaultBodyMaterials}={}){return validateResidentPartRecipe({schema:2,assetVersion:'resident-parts-v1',body:'neutral-v1',hair,materials});}
