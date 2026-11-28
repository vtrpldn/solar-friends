import {unrotatedSiteSize} from './site-space.js';
import {GATHERING,GROVE_REACH} from './gathering.js';
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
 if((s.naturalLandVersion&&s.gatheringLandVersion&&s.seedlingLandVersion) || !s.landSeed)return;
 const random=landRandom(s.landSeed^0x8e4b192),settings=settingsFor(s.landSeed);
 const species=BIOMES[settings.biome].trees.filter(id=>TREE_SPECIES[id]);
 const add=(key,x,z)=>{
   const [w,d]=defs[key].size;
   if(x<CELL_MIN+3||z<CELL_MIN+3||x+w>CELL_MAX-3||z+d>CELL_MAX-3)return false;
   if(Math.hypot(x-s.stock.x,z-s.stock.z)<9 || (s.campSite&&Math.hypot(x-s.campSite.x,z-s.campSite.z)<7))return false;
   for(let dx=-1;dx<=w;dx++)for(let dz=-1;dz<=d;dz++)if(riverBankAt(x+dx,z+dz,1,s.landSeed)||accessRoadAt(x+dx,z+dz,2))return false;
   if(s.projects.some(p=>{
     // Trees in a grove stand in neighbouring cells; everything else keeps clear.
     const gap=defs[p.key].kind==='wild-tree'&&(defs[key].kind==='wild-tree'||GATHERING[key]?.grove)?0:2;
     const size=p.key==='field'?(p.fieldSize||defs[p.key].size):unrotatedSiteSize(p,defs[p.key].size);
     const [pw,pd]=(p.rotation||0)%2?[...size].reverse():size;
     return !p.felled&&x<p.x+pw+gap&&x+w+gap>p.x&&z<p.z+pd+gap&&z+d+gap>p.z;
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
 if(!s.naturalLandVersion)for(const key of ['supply-2','supply-3']){
   const sites=candidates.map(p=>({...p,score:(key==='supply-3'?p.relief:1-p.relief+p.moisture*.5)
     +terrainNoise(p.x/18,p.z/18,s.landSeed^(key==='supply-3'?0x71af:0x38cd))*.6+p.jitter*.18}))
     .sort((a,b)=>b.score-a.score);
   // Keep one usable deposit of each material within a short walk of supplies.
   let placed=0;
   for(const p of sites)if(Math.hypot(p.x-s.stock.x,p.z-s.stock.z)<28&&add(key,p.x,p.z)){placed++;break;}
   for(const p of sites){if(placed>=4)break;if(add(key,p.x,p.z))placed++;}
 }
 const biomeDensity={'mata-atlantica':1.35,cerrado:1,caatinga:.7}[settings.biome];
 const target=Math.round(440*richnessFactor(settings.resources)*biomeDensity);
 // Trees grow as groves: long clumps of close-standing trees on the ground the
 // land favours, open meadow between them and a few loners beyond their edges.
 if(!s.naturalLandVersion){
  const gauss=()=>Math.sqrt(-2*Math.log(1-random()))*Math.cos(random()*Math.PI*2);
  const groves=[];
  let left=target,loners=Math.round(target*.14);
  left-=loners;
  for(let guard=0;left>0&&guard<600;guard++){
   const size=Math.min(left,3+Math.floor(random()**1.5*14)),spread=.55+Math.sqrt(size)*.5;
   let best=null;
   for(let i=0;i<30;i++){
    const p=candidates[Math.floor(random()*candidates.length)];
    if(groves.some(g=>Math.hypot(g.x-p.x,g.z-p.z)<(g.spread+spread)*1.8+2))continue;
    const score=terrainNoise(p.x/15,p.z/15,s.landSeed^0x49ab)*.75+terrainNoise(p.x/6,p.z/6,s.landSeed^0x726c)*.25+p.moisture*.12+random()*.25;
    if(!best||score>best.score)best={x:p.x,z:p.z,score};
   }
   if(!best)continue;
   const turn=random()*Math.PI,long=1.25+random()*.7;
   groves.push({...best,spread});
   // A grove shares one species, with occasional mixed growth.
   const main=species[Math.min(species.length-1,Math.floor(terrainNoise(best.x/11,best.z/11,s.landSeed^0x913e)*species.length))];
   let grown=0;
   for(let tries=0;grown<size&&tries<size*14;tries++){
    const a=gauss()*spread*long,b=gauss()*spread/long;
    const x=Math.round(best.x+a*Math.cos(turn)-b*Math.sin(turn)),z=Math.round(best.z+a*Math.sin(turn)+b*Math.cos(turn));
    if(add(`wild-${random()<.18?species[Math.floor(random()*species.length)]:main}`,x,z))grown++;
   }
   left-=size;
  }
  for(let tries=0;loners>0&&tries<6000&&groves.length;tries++){
   const g=groves[Math.floor(random()*groves.length)],a=random()*Math.PI*2,r=g.spread*2.4+2+random()*6;
   if(add(`wild-${species[Math.floor(random()*species.length)]}`,Math.round(g.x+Math.cos(a)*r),Math.round(g.z+Math.sin(a)*r)))loners--;
  }
 }
 if(!s.gatheringLandVersion){
  for(const [key,d] of Object.entries(GATHERING)){
   if(!d.biomes.includes(settings.biome)||d.grove)continue;
   const sites=[...candidates].sort((a,b)=>(b.jitter+b.moisture*(key==='wild-bamboo'?2:.3))-(a.jitter+a.moisture*(key==='wild-bamboo'?2:.3)));
   let count=0;for(const p of sites)if(Math.hypot(p.x-s.stock.x,p.z-s.stock.z)<28&&add(key,p.x,p.z)){count++;break;}
   for(const p of sites){if(count>=Math.max(2,Math.round(3*richnessFactor(settings.resources))))break;if(add(key,p.x,p.z))count++;}
  }
  s.gatheringLandVersion=1;
 }
 s.naturalLandVersion=1;
 // Seedling patches sit in a free cell beside the trees still standing, so a
 // village saved before they existed gets them from the groves it has left.
 // Their own random stream keeps that the same whatever ran above.
 if(!s.seedlingLandVersion){
  const pick=landRandom(s.landSeed^0x5eed11),trees=s.projects.filter(p=>p.natural&&!p.felled&&defs[p.key].kind==='wild-tree');
  const order=trees.map(p=>({p,at:pick()})).sort((a,b)=>a.at-b.at).map(o=>o.p);
  const company=p=>trees.filter(q=>Math.abs(q.x-p.x)<=GROVE_REACH&&Math.abs(q.z-p.z)<=GROVE_REACH).length;
  const placed=[],want=Math.max(3,Math.round(4*richnessFactor(settings.resources)));
  const beside=(p,near)=>{
   if(placed.length>=want||near&&Math.hypot(p.x-s.stock.x,p.z-s.stock.z)>=28||company(p)<4||placed.some(q=>Math.hypot(q.x-p.x,q.z-p.z)<12))return;
   // The most open neighbouring cell: seedlings come up at the sunny edge, where they can also be seen.
   const crowd=([dx,dz])=>trees.filter(q=>Math.abs(q.x-p.x-dx)<=1&&Math.abs(q.z-p.z-dz)<=1).length;
   const cells=[[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]].map((c,i)=>({c,i,n:crowd(c)})).sort((a,b)=>a.n-b.n||a.i-b.i);
   if(cells[0].n>2)return;
   for(const {c:[dx,dz]} of cells)if(add('wild-seedlings',p.x+dx,p.z+dz)){placed.push(p);return;}
  };
  // One within a short walk of the supplies first, then the rest across the land.
  for(const p of order){if(placed.length)break;beside(p,true);}
  for(const p of order)beside(p,false);
  s.seedlingLandVersion=1;
 }
}
