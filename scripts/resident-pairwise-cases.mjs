import {validateResidentPartRecipe} from '../web/resident-part-recipe.js';
// Cover every feasible pair of public creation choices. Legacy revisions remain
// loadable but are not additional selectable outfits (matching the creator).
export function residentPairwiseCases(catalog){
 const outfits=catalog.bodies.flatMap(body=>catalog.body_revisions[body].filter(version=>version===catalog.body_assets[body]||version==='resident-parts-v6').map(assetVersion=>({body,assetVersion})));
 const axes={outfit:outfits.map(o=>o.body+':'+o.assetVersion),hair:catalog.hairstyles,hairColour:catalog.hair_colours,hat:catalog.hats,facialHair:catalog.facial_hair,...catalog.materials},names=Object.keys(axes),candidates=[];
 function visit(values,index){
  if(index===names.length){const outfit=outfits[axes.outfit.indexOf(values.outfit)];if(!catalog.body_facial_hair[outfit.body].includes(values.facialHair))return;
   const recipe=validateResidentPartRecipe({schema:2,...outfit,hair:values.hair,hairColour:values.hairColour,hat:values.hat,facialHair:values.facialHair,materials:Object.fromEntries(Object.keys(catalog.materials).map(k=>[k,values[k]]))});candidates.push({values:{...values},recipe});return;}
  const name=names[index];for(const value of axes[name])visit({...values,[name]:value},index+1);
 }
 visit({},0);
 const pairs=values=>names.flatMap((a,i)=>names.slice(i+1).map(b=>JSON.stringify([a,values[a],b,values[b]]))),universe=new Set();for(const c of candidates){c.pairs=pairs(c.values);for(const p of c.pairs)universe.add(p);}
 const selected=[],groups=[];
 for(const outfit of axes.outfit){
  const eligible=candidates.filter(c=>c.values.outfit===outfit),missing=new Set(eligible.flatMap(c=>c.pairs)),required=missing.size,start=selected.length;
  while(missing.size){let winner=null,score=0;for(const c of eligible){let n=0;for(const p of c.pairs)if(missing.has(p))n++;if(n>score){winner=c;score=n;}}
   if(!winner)throw Error('Feasible resident pair coverage stalled');selected.push({values:winner.values,recipe:winner.recipe});for(const p of winner.pairs)missing.delete(p);
  }
  groups.push({outfit,feasibleCandidates:eligible.length,feasiblePairs:required,cases:selected.length-start});
 }
 return {schema:1,axes,feasibleCandidates:candidates.length,feasiblePairs:universe.size,groups,cases:selected,scope:'Pair coverage independently within each selectable public outfit; coverage does not establish all higher-order combinations or visual acceptance.'};
}
