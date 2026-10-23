export const characterCategories={
 Identity:['name','pronouns','biography'],
 Appearance:['appearance'],
 Personality:['personality','routine_preferences','occupation','outside_shifts'],
 Experience:['experience','work_preferences'],
};
const names=['Ana','André','Camila','Davi','Joana','Júlia','Marina','Rafael','Renata','Tiago'];
export function resetCharacterCategory(person,baseline,category){
 const fields=characterCategories[category];if(!fields)throw Error('Choose a character category.');
 const result=structuredClone(person);
 for(const field of fields){if(Object.hasOwn(baseline,field))result[field]=structuredClone(baseline[field]);else delete result[field];}
 return result;
}
export function randomizeCharacter(person,locked,catalog,random=Math.random){
 const result=structuredClone(person);
 const pick=values=>{if(!values.length)throw Error('No supported choices are available.');const value=random();if(!Number.isFinite(value)||value<0||value>=1)throw Error('Invalid character random source.');return values[Math.floor(value*values.length)];};
 if(!locked.Identity)Object.assign(result,{name:pick(names),pronouns:'',biography:''});
 if(!locked.Appearance){if(person.appearance?.schema===2){const parts=catalog.resident_parts;result.appearance=residentPartRecipe({hair:pick(parts.hairstyles),hairColour:pick(parts.hair_colours),hat:pick(parts.hats),facialHair:pick(parts.facial_hair),materials:Object.fromEntries(Object.entries(parts.materials).map(([key,values])=>[key,pick(values)]))});}else{const look=pick(catalog.resident_appearances);result.appearance={preset:look.key,version:1};}}
 if(!locked.Personality){
  const routines=catalog.resident_routines,bed=routines.bedtime;
  const favourite=pick(routines.hobbies).id,other=pick(routines.hobbies.filter(h=>h.id!==favourite)).id;
  result.personality={social_style:pick(catalog.resident_personality.social_styles).key,work_interest:pick(catalog.resident_personality.interests).key};
  result.routine_preferences={preferred_bedtime:pick(Array.from({length:Math.floor((bed.latest-bed.earliest)/bed.step)+1},(_,i)=>bed.earliest+i*bed.step)),favourite_hobby:favourite,alternate_hobby:other};
  result.occupation=pick(catalog.occupations).key;result.outside_shifts=false;
 }
 if(!locked.Experience){
  const experience=catalog.resident_experience;
  // Catalog backgrounds always stay within the balanced budget, even when
  // the author has allowed unrestricted starting levels elsewhere.
  const background=pick(experience.backgrounds.filter(b=>Object.values(b.levels).every(n=>n<=experience.balanced_maximum)&&Object.values(b.levels).reduce((sum,n)=>sum+n,0)<=experience.balanced_total));
  result.experience={background:background.key,levels:structuredClone(background.levels)};
  result.work_preferences=Object.fromEntries(experience.work_groups.map(g=>[g.key,pick(['less','share','prefer'])]));
 }
 return result;
}
import {residentPartRecipe} from '../resident-part-recipe.js';
