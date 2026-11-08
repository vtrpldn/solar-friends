import {landRandom} from './land-layout.js';
import {settingsFor,richnessFactor,BIOMES} from './world-settings.js';
import {riverBankAt} from './river-layout.js';
import {accessRoadAt} from './road-layout.js';
import {CELL_MIN,CELL_MAX} from './map-size.js';
export const TREE_SPECIES={jequitiba:'Jequitibá',pau_brasil:'Pau-brasil',jucara:'Juçara palm',embauba:'Embaúba',pequi:'Pequi',barbatimao:'Barbatimão',umbuzeiro:'Umbuzeiro',jurema:'Jurema'};
export function registerNaturalProjects(defs){
 for(const [asset,name] of Object.entries(TREE_SPECIES))defs[`wild-${asset}`]={name,asset,size:[1,1],kind:'wild-tree',materials:{},work:1,repeatable:true,natural:true,description:'Select this individual tree to mark it for cutting. A resident fells it and carries raw wood back to camp. It will not regrow automatically.'};
 for(const key of ['supply-2','supply-3'])Object.assign(defs[key],{natural:true,name:key==='supply-3'?'Stone outcrop':'Earth deposit',asset:key==='supply-3'?'natural-stone':'natural-earth',size:[4,3],description:'A large natural deposit. Residents extract finite local materials here; deposits cannot be placed, copied or moved.'});
}
export function ensureNaturalLand(s,defs){
 if(s.naturalLandVersion || !s.landSeed)return;
 const random=landRandom(s.landSeed^0x8e4b192),settings=settingsFor(s.landSeed);
 const species=BIOMES[settings.biome].trees.filter(id=>TREE_SPECIES[id]);
 const add=(key,x,z)=>{
   const [w,d]=defs[key].size;
   if(x<CELL_MIN+3||z<CELL_MIN+3||x+w>CELL_MAX-3||z+d>CELL_MAX-3)return false;
   if(Math.hypot(x-s.stock.x,z-s.stock.z)<9 || (s.campSite&&Math.hypot(x-s.campSite.x,z-s.campSite.z)<7))return false;
   for(let dx=-1;dx<=w;dx++)for(let dz=-1;dz<=d;dz++)if(riverBankAt(x+dx,z+dz,1,s.landSeed)||accessRoadAt(x+dx,z+dz,2))return false;
   if(s.projects.some(p=>!p.felled&&x< p.x+defs[p.key].size[0]+2&&x+w+2>p.x&&z<p.z+defs[p.key].size[1]+2&&z+d+2>p.z))return false;
   s.projects.push({id:s.nextId++,key,x,z,work:defs[key].work,delivered:0,natural:true});return true;
 };
 // Nearby deposits introduce local resources; others reward exploring the land.
 for(const key of ['supply-2','supply-3'])for(let n=0;n<4;n++)for(let attempt=0;attempt<100;attempt++){
   const radius=n===0?12+random()*12:22+random()*36,angle=random()*Math.PI*2;
   if(add(key,Math.round(32+Math.cos(angle)*radius),Math.round(32+Math.sin(angle)*radius)))break;
 }
 for(let n=0;n<Math.round(110*richnessFactor(settings.resources));n++){
   const x=Math.round(CELL_MIN+5+random()*(CELL_MAX-CELL_MIN-10)),z=Math.round(CELL_MIN+5+random()*(CELL_MAX-CELL_MIN-10));
   add(`wild-${species[Math.floor(random()*species.length)]}`,x,z);
 }
 s.naturalLandVersion=1;
}
