import {residentPartRecipe,validateResidentPartRecipe,residentPartCatalog} from './resident-part-recipe.js';
import {bodyMaterialPalettes} from './character-materials.js';
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function changeAppearanceField(appearance,field,value){
 if(field==='appearance')return value==='custom'?residentPartRecipe():{preset:value,version:1};
 const recipe=validateResidentPartRecipe(appearance);
 if(field==='appearance:hair')return validateResidentPartRecipe({...recipe,hair:value});
 if(field==='appearance:hairColour')return validateResidentPartRecipe({...recipe,hairColour:value});
 const material=field.slice('appearance:'.length);return validateResidentPartRecipe({...recipe,materials:{...recipe.materials,[material]:value}});
}
export function appearanceFields(appearance,presets){
 const custom=appearance?.schema===2,mode=custom?'custom':appearance?.preset;
 const select=(field,label,options,value)=>`<label class="creator-field">${label}<select data-resident-field="${field}">${options.map(([key,title])=>`<option value="${escape(key)}" ${key===value?'selected':''}>${escape(title)}</option>`).join('')}</select></label>`;
 let fields=select('appearance','Appearance',[...presets.map(p=>[p.key,p.name]),['custom','Custom look']],mode);
 if(custom){fields+='<div class="resident-part-palettes">'+select('appearance:hair','Hairstyle',residentPartCatalog.hairstyles.map(key=>[key,key==='side-part-v1'?'Swept side part':'Short curls']),appearance.hair)+select('appearance:hairColour','Hair colour',residentPartCatalog.hair_colours.map(key=>[key,key[0].toUpperCase()+key.slice(1)]),appearance.hairColour??'chestnut')+'</div><div class="resident-part-palettes">';for(const [key,label]of Object.entries({skin:'Skin tone',shirt:'Top colour',shorts:'Bottom colour',shoes:'Shoe colour'}))fields+=select('appearance:'+key,label,Object.keys(bodyMaterialPalettes[key]).filter(k=>k!=='reference').map(k=>[k,k[0].toUpperCase()+k.slice(1)]),appearance.materials?.[key]);fields+='</div>';}
 return fields+'<p>Appearance changes leave skills, personality and routines unchanged. Choose a hairstyle and colours. Body shape and clothing style are fixed for now.</p>';
}
