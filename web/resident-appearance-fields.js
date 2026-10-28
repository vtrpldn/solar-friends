import {residentPartRecipe,validateResidentPartRecipe,residentPartCatalog} from './resident-part-recipe.js';
import {bodyMaterialPalettes} from './character-materials.js';
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function changeAppearanceField(appearance,field,value){
 if(field==='appearance')return value==='custom'?residentPartRecipe():{preset:value,version:1};
 const recipe=validateResidentPartRecipe(appearance);
 if(field==='appearance:body')return residentPartRecipe({...recipe,body:value});
 if(field==='appearance:top'){if(recipe.body!=='relaxed-v1'||!['resident-parts-v3','resident-parts-v4','resident-parts-v5','resident-parts-v6'].includes(value))throw Error('Choose an available top for this stance.');return validateResidentPartRecipe({...recipe,assetVersion:value});}
 if(field==='appearance:hair')return validateResidentPartRecipe({...recipe,hair:value});
 if(field==='appearance:hat')return validateResidentPartRecipe({...recipe,hat:value});
 if(field==='appearance:facialHair')return validateResidentPartRecipe({...recipe,facialHair:value});
 if(field==='appearance:hairColour')return validateResidentPartRecipe({...recipe,hairColour:value});
 const material=field.slice('appearance:'.length);return validateResidentPartRecipe({...recipe,materials:{...recipe.materials,[material]:value}});
}
const newSleep=appearance=>['resident-parts-v5','resident-parts-v6'].includes(appearance.assetVersion);
export function appearanceFields(appearance,presets){
 const custom=appearance?.schema===2,mode=custom?'custom':appearance?.preset;
 const select=(field,label,options,value)=>`<label class="creator-field">${label}<select data-resident-field="${field}">${options.map(([key,title])=>`<option value="${escape(key)}" ${key===value?'selected':''}>${escape(title)}</option>`).join('')}</select></label>`;
 let fields=select('appearance','Appearance',[...presets.map(p=>[p.key,p.name]),['custom','Custom look']],mode);
 if(custom){fields+='<div class="resident-part-palettes resident-part-options">'+select('appearance:body','Stance',residentPartCatalog.bodies.map(key=>[key,key==='relaxed-v1'?'Relaxed':'Classic']),appearance.body)+select('appearance:hair','Hairstyle',residentPartCatalog.hairstyles.map(key=>[key,key==='side-part-v1'?'Swept side part':'Short curls']),appearance.hair)+select('appearance:hairColour','Hair colour',residentPartCatalog.hair_colours.map(key=>[key,key[0].toUpperCase()+key.slice(1)]),appearance.hairColour??'chestnut')+select('appearance:hat','Hat',residentPartCatalog.hats.map(key=>[key,key==='none'?'No hat':'Straw hat']),appearance.hat??'none')+select('appearance:facialHair','Facial hair',residentPartCatalog.facial_hair.map(key=>[key,key==='none'?'Clean shaven':'Short chestnut beard']),appearance.facialHair??'none')+(appearance.body==='relaxed-v1'?select('appearance:top','Top style',newSleep(appearance)?[['resident-parts-v5','Sleeveless'],['resident-parts-v6','Short sleeves']]:[['resident-parts-v3','Sleeveless'],['resident-parts-v4','Short sleeves']],appearance.assetVersion==='resident-parts-v2'?'resident-parts-v3':appearance.assetVersion):'')+'</div><div class="resident-part-palettes">';for(const [key,label]of Object.entries({skin:'Skin tone',shirt:'Top colour',shorts:'Bottom colour',shoes:'Shoe colour'}))fields+=select('appearance:'+key,label,Object.keys(bodyMaterialPalettes[key]).filter(k=>k!=='reference').map(k=>[k,k[0].toUpperCase()+k.slice(1)]),appearance.materials?.[key]);fields+='</div>';}
 return fields+'<p>Appearance changes leave skills, personality and routines unchanged. Choose a stance, hairstyle, facial hair, hat and colours. The relaxed stance also offers sleeveless and short-sleeved tops. Body shape is fixed for now.</p>';
}
