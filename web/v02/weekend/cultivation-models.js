import * as THREE from 'three';
import {CROPS} from './cultivation.js';
import {elevationAt} from './elevation.js';
const matrix=new THREE.Object3D();
function meshBox(group,w,h,d,color,x,y,z,opacity=1){
 const m=new THREE.Object3D();m.position.set(x,y,z);m.scale.set(w,h,d);
 group.userData.boxes??=new Map();const key=`${color}:${opacity}`;
 if(!group.userData.boxes.has(key))group.userData.boxes.set(key,{color,opacity,parts:[]});
 group.userData.boxes.get(key).parts.push(m);return m;
}
export function cultivationSignature(p,s){return JSON.stringify([Math.floor(s.time/3200),(s.operations||[]).filter(o=>!o.done&&o.site===p.id&&o.farm).map(o=>[o.farm.bed,o.farm.action,Math.floor(o.work/o.farm.work*10)]),p.fieldSize,p.rotation,p.cultivation.beds.map(b=>[b.stage,b.crop,b.density,Math.floor(b.growth*20),Math.floor(b.moisture*5),Math.floor(b.cover*5),Math.floor((b.elapsed?b.stress/b.elapsed:0)*5)])]);}
export function createCultivationModel(p,state){
 const root=new THREE.Group(),beds=p.cultivation.beds;
 const size=p.key==='field'?p.fieldSize:p.key==='garden'?[3,6]:[4,6];
 // Derive the actual centre supplied by the game, independent of model bounds.
 const w=p.key==='field'?p.fieldSize[0]*2:0;
 const ground=(x,z)=>{
  if(p.key!=='field')return 0;
  const angle=(p.rotation||0)*Math.PI/2,cx=(p.x-32+((p.rotation||0)%2?size[1]-1:size[0]-1)/2)*2,cz=(p.z-32+((p.rotation||0)%2?size[0]-1:size[1]-1)/2)*2;
  return elevationAt(cx+Math.cos(angle)*x+Math.sin(angle)*z,cz-Math.sin(angle)*x+Math.cos(angle)*z,state.elevationSeed,state.terrainPads)-elevationAt(cx,cz,state.elevationSeed,state.terrainPads);
 };
 if(p.key==='field'){
  root.userData.cultivatedField=true;
  const [width,depth]=p.fieldSize.map(n=>n*2),points=[];
  for(let x=-width/2;x<=width/2;x+=2)points.push([x,-depth/2]);
  for(let z=-depth/2+2;z<=depth/2;z+=2)points.push([width/2,z]);
  for(let x=width/2-2;x>=-width/2;x-=2)points.push([x,depth/2]);
  for(let z=depth/2-2;z>=-depth/2;z-=2)points.push([-width/2,z]);
  const edge=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(([x,z])=>new THREE.Vector3(x,ground(x,z)+.08,z))),new THREE.LineBasicMaterial({color:'#b5a16c',transparent:true,opacity:.65}));edge.name='field-boundary';edge.userData.ownedMaterial=true;root.add(edge);
 }
 const plants={greens:[],beans:[],corn:[]};
 for(const b of beds){
  const job=(state.operations||[]).find(o=>!o.done&&o.site===p.id&&o.farm?.bed===b.id);
  const fraction=job?Math.min(1,job.work/job.farm.work):0;
  for(let z=-b.d/2;z<b.d/2;z+=.5){const depth=Math.min(.5,b.d/2-z),y=ground(b.x,b.z+z+depth/2);meshBox(root,b.w,.07,depth,b.stage==='unprepared'&&!(job?.farm.action==='prepare'&&(z+b.d/2)/b.d<fraction)?'#71844a':b.cover>.2?'#927444':b.moisture>.4?'#57412d':'#947047',b.x,y+.025,b.z+z+depth/2);}
  if(b.stage==='prepared')for(const dx of [-.3,0,.3])meshBox(root,.035,.025,b.d,'#493829',b.x+dx,ground(b.x+dx,b.z)+.07,b.z);
  if(b.stage==='harvested')for(let z=-b.d/2+.2;z<b.d/2;z+=.4)meshBox(root,.06,.12,.06,'#a49155',b.x,ground(b.x,b.z+z)+.1,b.z+z);

  const planting=job?.farm.action==='plant'&&fraction>0;
  if(!['growing','harvestable','failed'].includes(b.stage)&&!planting)continue;
  const crop=CROPS[b.crop],spacing=1/Math.sqrt(crop.plants*b.density),health=Math.min(b.elapsed?1-b.stress/b.elapsed:1,1-(b.droughtDamage||0))*(b.stage==='harvestable'?Math.max(.15,1-Math.max(0,(state.time-b.ripeAt)/3200-crop.window)/crop.window):1);
  for(let x=-b.w/2+spacing/2;x<b.w/2;x+=spacing)for(let z=-b.d/2+spacing/2;z<b.d/2;z+=spacing){
   if(planting&&(z+b.d/2)/b.d>fraction)continue;
   if(job?.farm.action==='harvest'&&(z+b.d/2)/b.d<fraction)continue;
   const n=plants[b.crop].length,jitter=Math.sin((p.id+1)*97+b.id*13+n*31)*.04;
   plants[b.crop].push({x:b.x+x+jitter,z:b.z+z,y:ground(b.x+x,b.z+z),growth:Math.max(.1,b.growth),health,rotation:n*2.399});
  }
 }
 for(const [id,items]of Object.entries(plants)){
  if(!items.length)continue;
  const geo=new THREE.IcosahedronGeometry(1,0),material=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:1});
  const leaves=new THREE.InstancedMesh(geo,material,items.length*(id==='corn'?5:3));leaves.userData.ownedMaterial=true;leaves.castShadow=true;leaves.receiveShadow=true;let i=0;
  const color=new THREE.Color();
  for(const plant of items)for(let part=0;part<(id==='corn'?5:3);part++){
   const h=CROPS[id].height*plant.growth;
   matrix.position.set(plant.x,plant.y+.07+h*(part+1)/(id==='corn'?6:5),plant.z);
   matrix.rotation.set(id==='corn'?.4:0,plant.rotation+part*2.1,id==='corn'?(part%2?-.5:.5):.25);
   matrix.scale.set(id==='corn'?.35*plant.growth:.19*plant.growth,id==='corn'?.06*plant.growth:.1*plant.growth,id==='corn'?.09*plant.growth:.16*plant.growth);
   matrix.updateMatrix();leaves.setMatrixAt(i,matrix.matrix);color.set(plant.health<.4?'#a29b4b':id==='greens'?'#679b42':id==='beans'?'#4e843d':'#718c3b');leaves.setColorAt(i++,color);
  }
  const distant=new THREE.InstancedMesh(new THREE.CircleGeometry(1,4),new THREE.MeshStandardMaterial({color:'#ffffff',roughness:1,side:THREE.DoubleSide}),items.length);
  distant.userData.ownedMaterial=true;
  items.forEach((p,i)=>{const height=CROPS[id].height*p.growth;matrix.position.set(p.x,p.y+height/2,p.z);matrix.rotation.set(-.4,p.rotation,0);matrix.scale.set(id==='corn'?.35:.25,height/2,.25);matrix.updateMatrix();distant.setMatrixAt(i,matrix.matrix);distant.setColorAt(i,new THREE.Color(p.health<.4?'#a29b4b':id==='greens'?'#679b42':'#4e843d'));});
  const lod=new THREE.LOD();lod.userData.crops=true;lod.userData.plants=items.length;lod.addLevel(leaves,0);lod.addLevel(distant,65);root.add(lod);
  if(id==='corn'){
   const stalks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.025,.035,1,5),new THREE.MeshStandardMaterial({color:'#9aa65c',roughness:1}),items.length);stalks.userData.ownedMaterial=true;
   items.forEach((p,i)=>{matrix.position.set(p.x,p.y+CROPS.corn.height*p.growth/2,p.z);matrix.rotation.set(0,0,0);matrix.scale.set(1,CROPS.corn.height*p.growth,1);matrix.updateMatrix();stalks.setMatrixAt(i,matrix.matrix);});root.add(stalks);
  }
 }
 if(p.key==='greenhouse'){
  for(const x of [-3,3])for(const z of [-5,-2.5,0,2.5,5])meshBox(root,.08,2.5,.08,'#b6a17a',x,1.25,z);
  for(const z of [-5,-2.5,0,2.5,5])for(const side of [-1,1]){const beam=meshBox(root,.07,Math.sqrt(10),.07,'#b6a17a',side*1.5,3,z);beam.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(-side*3,1,0).normalize());}
  for(const side of [-1,1]){meshBox(root,.025,2.4,10,'#c1d8c7',side*3,1.25,0,.19);const roof=meshBox(root,Math.sqrt(10),.025,10,'#c1d8c7',side*1.5,3,0,.19);roof.rotation.z=-side*Math.atan2(1,3);}
  for(const z of [-5,5])for(const side of [-1,1])meshBox(root,2.5,2.4,.025,'#c1d8c7',side*1.75,1.25,z,.19);
 }
 for(const {color,opacity,parts}of root.userData.boxes?.values()||[]){
  const batch=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color,roughness:.9,transparent:opacity<1,opacity,depthWrite:opacity===1,side:THREE.DoubleSide}),parts.length);
  batch.userData.ownedMaterial=true;batch.castShadow=opacity===1;batch.receiveShadow=true;
  parts.forEach((p,i)=>{p.updateMatrix();batch.setMatrixAt(i,p.matrix);});root.add(batch);
 }
 delete root.userData.boxes;
 return root;
}
