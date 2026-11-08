import * as THREE from 'three';
import {elevationAt} from './elevation.js';
import {campLocation} from './simulation.js';
import {settingsFor} from './world-settings.js';

// Visitors are ambient, not livestock: bounded, ephemeral and never saved.
export const WILDLIFE_PALETTES={
 'mata-atlantica':{bird:0x79954a,wing:0x456d43,butterfly:0x6c9fc0},
 cerrado:{bird:0xa18b62,wing:0x6b7350,butterfly:0xe0b057},
 caatinga:{bird:0x9c977b,wing:0x667461,butterfly:0xd9c38c},
};
export function createWildlife(scene,state,{random=Math.random}={}){
 const root=new THREE.Group();root.name='Occasional wildlife';scene.add(root);
 const palette=WILDLIFE_PALETTES[settingsFor(state.landSeed).biome];
 const materials=new Map(),geometry=new THREE.IcosahedronGeometry(1,0);
 const material=color=>{if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({color,roughness:1,flatShading:true}));return materials.get(color);};
 function shape(parent,color,x,y,z,sx,sy,sz){const mesh=new THREE.Mesh(geometry,material(color));mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);parent.add(mesh);return mesh;}
 function model(butterfly){
  const group=new THREE.Group(),wings=[];
  shape(group,butterfly?0x534b38:palette.bird,0,0,0,butterfly?.035:.14,butterfly?.035:.13,butterfly?.12:.32);
  if(!butterfly){shape(group,palette.bird,0,.08,.28,.12,.12,.13);shape(group,0xb9a36d,0,.06,.41,.045,.04,.09);shape(group,palette.wing,0,0,-.32,.11,.035,.18);}
  for(const side of [-1,1]){
   const pivot=new THREE.Group();pivot.position.x=side*(butterfly?.02:.09);group.add(pivot);
   shape(pivot,butterfly?palette.butterfly:palette.wing,side*(butterfly?.13:.3),0,0,butterfly?.16:.38,.025,butterfly?.14:.15);
   wings.push({pivot,side});
  }
  return {group,wings};
 }
 let time=0,cooldown=8+random()*15,visitors=[];
 function spawn(){
  const butterfly=random()<.4,count=butterfly?1+Math.floor(random()*2):2+Math.floor(random()*3);
  const angle=random()*Math.PI*2,dx=Math.cos(angle),dz=Math.sin(angle);
  // Pass through the inhabited vicinity, without congregating at one point.
  const center=campLocation(state)||state.stock;
  const cx=(center.x-32)*2+(random()-.5)*32,cz=(center.z-32)*2+(random()-.5)*32;
  for(let i=0;i<count;i++){
   const rig=model(butterfly);root.add(rig.group);
   visitors.push({...rig,butterfly,age:0,duration:butterfly?24:18,dx,dz,cx:cx-dz*i*1.7,cz:cz+dx*i*1.7,phase:random()*6.28});
  }
 }
 function update(dt){
  if(dt<=0)return;
  time+=dt;cooldown-=dt;
  if(cooldown<=0&&!visitors.length){spawn();cooldown=45+random()*65;}
  for(const v of visitors){
   v.age+=dt;const progress=Math.min(1,v.age/v.duration),travel=(progress-.5)*(v.butterfly?22:100),sway=Math.sin(v.age*(v.butterfly?1.7:.45)+v.phase)*(v.butterfly?1.1:.8);
   const x=v.cx+v.dx*travel-v.dz*sway,z=v.cz+v.dz*travel+v.dx*sway;
   v.group.position.set(x,elevationAt(x,z,state.elevationSeed,state.terrainPads)+(v.butterfly?1.1:9)+Math.sin(v.age*2+v.phase)*.15,z);
   v.group.rotation.y=Math.atan2(v.dx,v.dz);
   const fade=Math.min(1,progress*8,(1-progress)*8);v.group.scale.setScalar(Math.max(0,fade));
   for(const w of v.wings)w.pivot.rotation.z=w.side*Math.sin(time*(v.butterfly?22:9)+v.phase)*(v.butterfly?1.1:.6);
  }
  visitors=visitors.filter(v=>{if(v.age<v.duration)return true;root.remove(v.group);return false;});
 }
 return {update,get count(){return visitors.length;},dispose(){scene.remove(root);geometry.dispose();for(const m of materials.values())m.dispose();visitors=[];}};
}
