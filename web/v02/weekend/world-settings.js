export const DEFAULT_SETTINGS={biome:'mata-atlantica',landscape:'rolling',water:'seasonal',resources:'balanced',savings:'modest',supplies:'camp',town:'drive'};
export const OPTIONS={biome:['mata-atlantica','cerrado','caatinga'],landscape:['gentle','rolling','rugged'],water:['dry','seasonal','abundant'],resources:['sparse','balanced','rich'],savings:['tight','modest','comfortable'],supplies:['essentials','camp','prepared'],town:['nearby','drive','remote']};
export const PRESETS={gentle:{landscape:'gentle',water:'abundant',resources:'rich',savings:'comfortable',supplies:'prepared',town:'nearby'},scratch:{landscape:'rolling',water:'seasonal',resources:'balanced',savings:'tight',supplies:'essentials',town:'drive'},remote:{landscape:'rugged',water:'dry',resources:'balanced',savings:'modest',supplies:'camp',town:'remote'}};
const worlds=new Map();
export const settingsFor=seed=>worlds.get(seed)||DEFAULT_SETTINGS;
export function validSettings(value){return value && Object.entries(OPTIONS).every(([k,values])=>values.includes(value[k]));}
export function registerWorld(seed,value){if(!validSettings(value))throw Error('Invalid world settings');worlds.set(seed,{...value});}
export const townDuration=setting=>({nearby:45,drive:55,remote:110}[setting]||55);
export const richnessFactor=setting=>({sparse:.6,balanced:1,rich:1.6}[setting]||1);
export const waterFactor=setting=>({dry:.55,seasonal:1,abundant:1.5}[setting]||1);
export const BIOMES={
 'mata-atlantica':{name:'Mata Atlântica',colors:['#9fad72','#b9ad7b','#849965'],trees:['jequitiba','pau_brasil','jucara','embauba']},
 cerrado:{name:'Cerrado',colors:['#b3ad68','#b58951','#92965d'],trees:['pequi','barbatimao','bunchgrass','campo']},
 caatinga:{name:'Caatinga',colors:['#b6a67b','#c2b18b','#998c76'],trees:['umbuzeiro','jurema','mandacaru','macambira']},
};
export function applySettings(s,settings){
 s.worldSettings={...DEFAULT_SETTINGS,...settings};registerWorld(s.landSeed,s.worldSettings);
 if(s.mode==='sandbox')return s;
 s.money={tight:100,modest:220,comfortable:600}[settings.savings];
 const factor={essentials:.6,camp:1,prepared:1.7}[settings.supplies];
 s.wood=Math.round(s.wood*factor);
 for(const key of Object.keys(s.materials))s.materials[key]=Math.ceil(s.materials[key]*factor);
 return s;
}
