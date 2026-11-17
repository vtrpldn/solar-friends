import {MAP_HALF} from './map-size.js';
import * as THREE from 'three';
import {riverCenter,riverWidth} from './river-layout.js';
import {landRandom} from './land-layout.js';
import {terrainNoise} from './terrain-noise.js';
import {settingsFor} from './world-settings.js';
import {createWaterMaterial} from './river-water.js';
export {riverCenter,riverWidth};

export function createRiver(seed=0){
 const center=z=>riverCenter(z,seed),width=z=>riverWidth(z,seed);
 const random=landRandom(seed^0x5a1d9),root=new THREE.Group(),materials=new Map();
 const material=color=>{
  if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({color,roughness:1,flatShading:true,side:THREE.DoubleSide}));
  return materials.get(color);
 };
 function ribbon(extra,y,color){
  const positions=[];
  for(let z=-MAP_HALF;z<MAP_HALF;z++){
   const edge=t=>width(t)+extra*(.82+terrainNoise(t/7,2,seed)*.18);
   const a=center(z),b=center(z+1),wa=edge(z),wb=edge(z+1);
   positions.push(a-wa,y,z,b-wb,y,z+1,b+wb,y,z+1,a-wa,y,z,b+wb,y,z+1,a+wa,y,z);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,material(color));mesh.receiveShadow=true;root.add(mesh);
 }
 ribbon(1.9,.025,'#82906a');ribbon(1.1,.035,'#b6a780');ribbon(.3,.045,'#9fae91');
 const rocks=[];
 function rock(x,z,radius,inWater=false){
  const mesh=new THREE.Mesh(new THREE.IcosahedronGeometry(radius,0),material(['#979b86','#b0ae94','#7d8b7e'][Math.floor(random()*3)]));
  mesh.position.set(x,radius*.3,z);mesh.scale.set(1.15,.65,.85);mesh.rotation.set(0,random()*Math.PI,.1);
  mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);
  if(inWater)rocks.push({x,z,radius:radius*.9});
 }
 // A few channel boulders anchor the animated eddies; the central passage stays open.
 for(let i=0;i<8;i++){
  const z=-MAP_HALF+18+i*29+random()*9,side=random()<.5?-1:1;
  rock(center(z)+side*width(z)*(.55+random()*.12),z,.3+random()*.24,true);
 }
 const biome=settingsFor(seed).biome;
 const reedColors=biome==='caatinga'?['#8e9059','#aaa16b']:['#627d4e','#829653'];
 const clusters=biome==='caatinga'?22:38;
 for(let i=0;i<clusters;i++){
  const z=-MAP_HALF+5+random()*(MAP_HALF*2-10),side=random()<.5?-1:1;
  const x=center(z)+side*(width(z)+.65+random()*.35);
  // Pebble pockets vary in size and leave long stretches of bank clear.
  for(let j=0,n=2+Math.floor(random()*5);j<n;j++){
   const rz=z+(random()-.5)*2.6,rx=center(rz)+side*(width(rz)+.45+random()*.9);
   rock(rx,rz,.09+random()*.18);
  }
  for(let j=0,n=4+Math.floor(random()*6);j<n;j++){
   const height=.45+random()*.65;
   const reed=new THREE.Mesh(new THREE.ConeGeometry(.045+random()*.035,height,3),material(reedColors[j%2]));
   reed.position.set(x+(random()-.5)*.35,height*.5+.04,z+(random()-.5)*1.5);
   reed.rotation.set((random()-.5)*.25,random()*Math.PI,(random()-.5)*.25);root.add(reed);
  }
 }
 // Short weathered logs lie along the bank, inside the non-buildable river margin.
 for(let i=0;i<5;i++){
  const z=-MAP_HALF+12+random()*(MAP_HALF*2-24),side=random()<.5?-1:1;
  const x=center(z)+side*(width(z)+1.15),length=1.1+random()*.65,radius=.11+random()*.055;
  const log=new THREE.Mesh(new THREE.CylinderGeometry(radius*.8,radius,length,7),material('#79664c'));
  const bankAt=t=>center(t)+side*(width(t)+1.15);
  const tangent=new THREE.Vector3(bankAt(z+.5)-bankAt(z-.5),0,1).normalize();
  log.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),tangent);
  log.position.set(x,radius+.04,z);
  log.name='riverbank-log';
  log.castShadow=log.receiveShadow=true;root.add(log);
  const end=new THREE.Mesh(new THREE.CircleGeometry(radius*.78,7),material('#b4a078'));
  end.rotation.x=-Math.PI/2;end.position.y=length/2+.002;log.add(end);
 }
 // UV.x runs bank-to-bank; UV.y is metres downstream, so flow follows bends.
 const positions=[],uvs=[];
 for(let z=-MAP_HALF;z<MAP_HALF;z++){
  for(const [side,t] of [[-1,z],[-1,z+1],[1,z+1],[-1,z],[1,z+1],[1,z]]){
   positions.push(center(t)+side*width(t),.06,t);uvs.push(side,t);
  }
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.computeVertexNormals();geometry.computeBoundingSphere();
 const water=createWaterMaterial(rocks,seed),current=new THREE.Mesh(geometry,water.material);
 current.name='flowing-river';current.receiveShadow=true;current.userData.ownedMaterial=true;
 root.traverse(mesh=>{if(mesh.isMesh)mesh.userData.ownedMaterial=true;});
 return {root,current,update(time){water.time.value=Number.isFinite(time)?time:0;}};
}
