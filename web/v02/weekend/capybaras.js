import * as THREE from 'three';
import {createCapybara,poseCapybara} from '../library/capybara.js';
import {riverCenter,riverWidth} from './river-layout.js';
import {elevationAt} from './elevation.js';
import {MAP_HALF} from './map-size.js';
import {footprint} from './simulation.js';
export function createCapybaraVisitors(scene,state,{random=Math.random}={}){
 const root=new THREE.Group();root.name='Riverbank capybaras';scene.add(root);
 let cooldown=25+random()*60,age=0,visitors=[];
 const point=(z,side)=>({x:riverCenter(z,state.landSeed)+side*(riverWidth(z,state.landSeed)+3),z});
 const clear=p=>Math.abs(p.x)<MAP_HALF-3&&Math.abs(p.z)<MAP_HALF-3&&!state.projects.some(b=>{
  const [w,d]=footprint(b),x=p.x/2+32,z=p.z/2+32;
  return x>b.x-.7&&x<b.x+w+.7&&z>b.z-.7&&z<b.z+d+.7;
 });
 function disposeVisitors(){
  const geometries=new Set(),materials=new Set();
  for(const v of visitors){v.model.traverse(m=>{if(m.isMesh){geometries.add(m.geometry);materials.add(m.material);}});root.remove(v.model);}
  for(const g of geometries)g.dispose();for(const m of materials)m.dispose();visitors=[];
 }
 function spawn(){
  const z=(state.stock.z-32)*2+(random()-.5)*30,side=random()<.5?-1:1;
  for(let i=0;i<2;i++){
   const start=z+i*2.4;
   if(!Array.from({length:25},(_,j)=>point(start+j*.2,side)).every(clear))continue;
   const model=createCapybara();root.add(model);visitors.push({model,start,side,last:point(start,side)});
  }age=0;
 }
 return {get count(){return visitors.length;},update(dt){
  if(dt<=0)return;
  cooldown-=dt;if(!visitors.length&&cooldown<=0){spawn();cooldown=100+random()*100;}
  if(!visitors.length)return;
  age+=dt;
  for(const v of visitors){
   const walking=age<12||age>48,travel=age<12?age*.2:age>48?2.4+(age-48)*.2:2.4;
   const next=point(v.start+travel,v.side);
   const moving=walking&&clear(next);if(moving)v.last=next;
   const ahead=point(v.last.z+.1,v.side);
   v.model.position.set(v.last.x,elevationAt(v.last.x,v.last.z,state.elevationSeed,state.terrainPads),v.last.z);
   v.model.rotation.y=Math.atan2(ahead.x-v.last.x,.1);
   v.model.scale.setScalar(Math.max(0,Math.min(1,age/2,(60-age)/2)));
   poseCapybara(v.model,age,moving);
  }
  if(age>=60)disposeVisitors();
 },dispose(){disposeVisitors();scene.remove(root);}};
}
