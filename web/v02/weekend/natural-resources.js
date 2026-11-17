import {landRandom,landParameters} from './land-layout.js';
import {settingsFor,richnessFactor,BIOMES} from './world-settings.js';
import {riverBankAt,riverCenter,riverWidth} from './river-layout.js';
import {terrainNoise} from './terrain-noise.js';
import {elevationAt} from './elevation.js';
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
   if(s.projects.some(p=>{
     const gap=defs[key].kind==='wild-tree'&&defs[p.key].kind==='wild-tree'?1:2;
     return !p.felled&&x<p.x+defs[p.key].size[0]+gap&&x+w+gap>p.x&&z<p.z+defs[p.key].size[1]+gap&&z+d+gap>p.z;
   }))return false;
   s.projects.push({id:s.nextId++,key,x,z,work:defs[key].work,delivered:0,natural:true});return true;
 };
 // Rank irregular candidate sites by habitat instead of drawing rings around camp.
 const hillHeight=landParameters(s.landSeed).hillHeight;
 const candidates=Array.from({length:2200},()=>{
   const x=Math.floor(CELL_MIN+5+random()*(CELL_MAX-CELL_MIN-10));
   const z=Math.floor(CELL_MIN+5+random()*(CELL_MAX-CELL_MIN-10));
   const wx=(x-32)*2,wz=(z-32)*2;
   const bank=Math.max(0,Math.abs(wx-riverCenter(wz,s.landSeed))-riverWidth(wz,s.landSeed));
   return {x,z,relief:elevationAt(wx,wz,s.landSeed)/hillHeight,moisture:Math.exp(-bank/22),jitter:random()};
 });
 for(const key of ['supply-2','supply-3']){
   const sites=candidates.map(p=>({...p,score:(key==='supply-3'?p.relief:1-p.relief+p.moisture*.5)
     +terrainNoise(p.x/18,p.z/18,s.landSeed^(key==='supply-3'?0x71af:0x38cd))*.6+p.jitter*.18}))
     .sort((a,b)=>b.score-a.score);
   // Keep one usable deposit of each material within a short walk of supplies.
   let placed=0;
   for(const p of sites)if(Math.hypot(p.x-s.stock.x,p.z-s.stock.z)<28&&add(key,p.x,p.z)){placed++;break;}
   for(const p of sites){if(placed>=4)break;if(add(key,p.x,p.z))placed++;}
 }
 const biomeDensity={'mata-atlantica':1.35,cerrado:1,caatinga:.7}[settings.biome];
 const target=Math.round(110*richnessFactor(settings.resources)*biomeDensity);
 const groves=candidates.map(p=>({...p,score:terrainNoise(p.x/15,p.z/15,s.landSeed^0x49ab)*.75
   +terrainNoise(p.x/6,p.z/6,s.landSeed^0x726c)*.25+p.moisture*.12+p.jitter*.12}))
   .sort((a,b)=>b.score-a.score);
 let trees=0;
 for(const p of groves){
   if(trees>=target)break;
   // Nearby trees share species, with occasional mixed growth at grove edges.
   const local=terrainNoise(p.x/11,p.z/11,s.landSeed^0x913e);
   const index=random()<.2?Math.floor(random()*species.length):Math.min(species.length-1,Math.floor(local*species.length));
   if(add(`wild-${species[index]}`,p.x,p.z))trees++;
 }
 s.naturalLandVersion=1;
}
