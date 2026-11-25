import * as THREE from 'three';
import {greenhouseShell} from './greenhouse-model.js';
import {CROPS} from './cultivation.js';
import {elevationAt} from './elevation.js';

// Farm look: worked plots sit on trodden red earth, beds are mounded, and
// each crop is one small leafy model that stays the same at every position
// on screen.
const SOIL={dry:'#9f6c49',moist:'#70493a',mulch:'#ad8a4c',turf:'#8a9a55',path:'#c29a74',ridgeDry:'#c18e62',ridgeMoist:'#7f5642'};
const WILT=new THREE.Color(1.55,.98,.5);

// --- Crop geometry ---------------------------------------------------------
function builder(){
 const position=[],color=[],c=new THREE.Color();
 const tri=(a,b,d,hex,shade=1)=>{c.set(hex).multiplyScalar(shade);for(const v of [a,b,d]){position.push(v.x,v.y,v.z);color.push(c.r,c.g,c.b);}};
 return {
  tri,
  // A folded leaf: spine from base to tip through a raised middle, with the
  // two edges cupped above the spine so each half catches light differently.
  leaf({angle,from=.02,y=0,length,width,rise=0,arch=0,cup=.02,hex}){
   const dx=Math.cos(angle),dz=Math.sin(angle),at=(r,h,side=0)=>new THREE.Vector3(dx*r-dz*side,h,dz*r+dx*side);
   const base=at(from,y),tip=at(from+length,y+rise),mid=at(from+length*.55,y+rise*.55+arch);
   const left=at(from+length*.5,y+rise*.5+arch+cup,width/2),right=at(from+length*.5,y+rise*.5+arch+cup,-width/2);
   tri(base,mid,left,hex,1.06);tri(base,right,mid,hex,.9);tri(mid,tip,left,hex,1);tri(mid,right,tip,hex,.84);
  },
  // Three-sided tapered stem.
  stem(height,bottom,top,hex){
   const ring=(r,h)=>[0,1,2].map(i=>new THREE.Vector3(Math.cos(i*2.094)*r,h,Math.sin(i*2.094)*r));
   const a=ring(bottom,0),b=ring(top,height);
   for(let i=0;i<3;i++){const j=(i+1)%3;tri(a[i],b[i],a[j],hex,.9+i*.08);tri(a[j],b[i],b[j],hex,.9+i*.08);}
  },
  // Four-sided spindle for pods and ears, from one point to another.
  spindle(from,to,radius,hex){
   const axis=to.clone().sub(from),mid=from.clone().lerp(to,.45),side=new THREE.Vector3(axis.z,0,-axis.x).normalize().multiplyScalar(radius),up=axis.clone().cross(side).normalize().multiplyScalar(radius);
   const ring=[mid.clone().add(side),mid.clone().add(up),mid.clone().sub(side),mid.clone().sub(up)];
   for(let i=0;i<4;i++){const j=(i+1)%4;tri(from,ring[j],ring[i],hex,.85+i*.08);tri(to,ring[i],ring[j],hex,.9+i*.06);}
  },
  build(){
   const g=new THREE.BufferGeometry();
   g.setAttribute('position',new THREE.Float32BufferAttribute(position,3));
   g.setAttribute('color',new THREE.Float32BufferAttribute(color,3));
   g.computeVertexNormals();return g;
  },
 };
}
const GOLDEN=2.399;
function greens(){
 const b=builder();
 // Open rosette of broad outer leaves around a paler upright heart.
 for(let i=0;i<6;i++)b.leaf({angle:i*Math.PI/3,length:.17,width:.16,rise:.05,arch:.035,cup:.025,hex:i%2?'#78ab46':'#6a9d40'});
 for(let i=0;i<4;i++)b.leaf({angle:.5+i*Math.PI/2,from:.01,y:.03,length:.1,width:.11,rise:.15,arch:.03,cup:.02,hex:i%2?'#a6cc64':'#94c058'});
 return b.build();
}
function beans(mature){
 const b=builder();
 b.stem(.56,.022,.012,'#6b8a48');
 // Three tiers of trifoliate-looking leaves make a rounded bush.
 const tiers=[[.14,5,.24,.15],[.32,4,.21,.14],[.5,3,.15,.12]];
 tiers.forEach(([y,count,length,width],tier)=>{
  for(let i=0;i<count;i++)b.leaf({angle:tier*.9+i*Math.PI*2/count,from:.025,y,length,width,rise:.04+tier*.03,arch:.05,cup:.02,hex:tier===2?'#6aa64a':i%2?'#55913f':'#4a8439'});
 });
 if(mature)for(let i=0;i<4;i++){
  // Pale pods hang under the canopy.
  const a=.4+i*Math.PI/2,r=.07+i%2*.03,top=new THREE.Vector3(Math.cos(a)*r,.3-i%2*.1,Math.sin(a)*r);
  b.spindle(top,top.clone().add(new THREE.Vector3(Math.cos(a)*.03,-.15,Math.sin(a)*.03)),.016,'#c3d47a');
 }
 return b.build();
}
function corn(mature){
 const b=builder();
 b.stem(mature?1.8:1.9,.036,.014,'#93a85a');
 // Leaves alternate on opposite sides, rise from the stalk and arch over.
 for(let i=0;i<8;i++){
  const y=.3+i*.19,length=.62-Math.abs(i-3.5)*.045;
  b.leaf({angle:i*Math.PI+(i%3-1)*.35,from:.02,y,length,width:.11,rise:-.04,arch:.3,cup:.025,hex:i%2?'#6c9944':'#5f8c3e'});
 }
 if(mature){
  // Straw tassel and two husked ears make ripe corn readable from afar.
  for(let i=0;i<5;i++)b.leaf({angle:i*1.257,from:.005,y:1.78,length:.14,width:.035,rise:.2,arch:.02,cup:0,hex:'#dcc98a'});
  for(const [a,y] of [[.6,.95],[3.5,1.2]]){
   const base=new THREE.Vector3(Math.cos(a)*.03,y,Math.sin(a)*.03),tip=base.clone().add(new THREE.Vector3(Math.cos(a)*.1,.26,Math.sin(a)*.1));
   b.spindle(base,tip,.05,'#bccb6b');
   b.spindle(tip.clone().lerp(base,.15),tip.clone().add(new THREE.Vector3(Math.cos(a)*.03,.06,Math.sin(a)*.03)),.02,'#c79a54');
  }
 }
 return b.build();
}
// A four-sided tuft stands in for each plant when the camera is far out.
function tuft(){
 const b=builder(),top=new THREE.Vector3(0,1,0),ring=[0,1,2,3].map(i=>new THREE.Vector3(Math.cos(i*Math.PI/2),0,Math.sin(i*Math.PI/2)));
 for(let i=0;i<4;i++)b.tri(top,ring[(i+1)%4],ring[i],'#ffffff',.82+i*.08);
 return b.build();
}
function cassava(mature){
 const b=builder();
 // Bare knobbly cane that forks high up; each fork carries a parasol of
 // long-stalked, deeply fingered leaves.
 b.stem(1.05,.045,.03,'#8a7256');
 const forks=mature?3:2;
 for(let f=0;f<forks;f++){
  const a=.5+f*Math.PI*2/forks,foot=new THREE.Vector3(0,1,0),head=new THREE.Vector3(Math.cos(a)*.3,1.6+f%2*.14,Math.sin(a)*.3);
  b.spindle(foot,head,.032,'#93795a');
  for(let i=0;i<5;i++){
   // Reddish stalk out to a hand of drooping fingers.
   const la=a+(i-2)*.95,hub=head.clone().add(new THREE.Vector3(Math.cos(la)*.3,.12-Math.abs(i-2)*.08,Math.sin(la)*.3));
   b.spindle(head,hub,.014,'#a8584a');
   for(let k=-2;k<=2;k++)b.leaf({angle:la+k*.5,from:Math.hypot(hub.x,hub.z)-.02,y:hub.y,length:.34-Math.abs(k)*.05,width:.1,rise:-.1,arch:.04,cup:.012,hex:(i+k)%2?'#4f8a3c':'#5d9944'});
  }
 }
 return b.build();
}
function sweetPotato(mature){
 const b=builder();
 // Runners creep out flat and carry heart-shaped leaves on short stalks.
 const runners=mature?6:4;
 for(let i=0;i<runners;i++){
  const a=i*Math.PI*2/runners+.3,reach=mature?.5:.3;
  b.spindle(new THREE.Vector3(0,.02,0),new THREE.Vector3(Math.cos(a)*reach,.03,Math.sin(a)*reach),.01,'#7a5a6a');
  for(let k=1;k<=3;k++){
   const r=reach*k/3.2,turn=a+(k%2?.5:-.5);
   b.leaf({angle:turn,from:r,y:.05+k%2*.04,length:.19,width:.2,rise:.03,arch:.03,cup:.012,hex:k===3?'#6c8a5c':k%2?'#4c8a44':'#5a9a4c'});
  }
 }
 for(let i=0;i<4;i++)b.leaf({angle:.4+i*Math.PI/2,from:.01,y:.06,length:.13,width:.14,rise:.08,arch:.03,cup:.012,hex:i%2?'#63a352':'#559548'});
 return b.build();
}
function pumpkin(mature){
 const b=builder();
 // Broad rough leaves held up on stalks over a trailing vine.
 for(let i=0;i<7;i++){
  const a=i*GOLDEN,r=.1+i*.085,y=.22+(i%3)*.09;
  b.spindle(new THREE.Vector3(Math.cos(a)*r*.6,.02,Math.sin(a)*r*.6),new THREE.Vector3(Math.cos(a)*r,y,Math.sin(a)*r),.012,'#7f9a52');
  b.leaf({angle:a,from:r-.05,y,length:.4,width:.44,rise:.02,arch:.05,cup:.03,hex:i%2?'#4e8840':'#5c9648'});
 }
 for(const a of [1.2,3.6])b.spindle(new THREE.Vector3(0,.03,0),new THREE.Vector3(Math.cos(a)*.6,.03,Math.sin(a)*.6),.012,'#7f9a52');
 if(mature){
  // One ribbed fruit beside the crown, and a yellow flower on the vine.
  const fruit=new THREE.Vector3(.36,.16,-.26);
  for(let i=0;i<3;i++){const a=i*Math.PI/3,off=new THREE.Vector3(Math.cos(a)*.19,0,Math.sin(a)*.19);b.spindle(fruit.clone().sub(off),fruit.clone().add(off),.16,i===1?'#d9862f':'#cf7a2a');}
  b.spindle(fruit.clone().add(new THREE.Vector3(0,.13,0)),fruit.clone().add(new THREE.Vector3(.02,.23,0)),.02,'#6f7f3f');
  for(let i=0;i<5;i++)b.leaf({angle:i*1.257,from:.42,y:.06,length:.07,width:.06,rise:.05,arch:.01,cup:0,hex:'#f0c13a'});
 }
 return b.build();
}
function cowpea(mature){
 const b=builder();
 // Looser and more sprawling than bush beans, with long pods held above the leaves.
 b.stem(.5,.02,.01,'#6f8f4c');
 const tiers=[[.12,5,.3,.13],[.3,4,.27,.12],[.48,3,.2,.1]];
 tiers.forEach(([y,count,length,width],tier)=>{
  for(let i=0;i<count;i++)b.leaf({angle:tier*1.1+i*Math.PI*2/count,from:.03,y,length,width,rise:.02+tier*.02,arch:.06,cup:.015,hex:tier===2?'#74ab52':i%2?'#5f9a47':'#528c40'});
 });
 if(mature)for(let i=0;i<5;i++){
  const a=.2+i*1.257,foot=new THREE.Vector3(Math.cos(a)*.06,.52,Math.sin(a)*.06);
  b.spindle(foot,foot.clone().add(new THREE.Vector3(Math.cos(a)*.2,.12-i%2*.2,Math.sin(a)*.2)),.013,i%2?'#d8cf8c':'#b9c873');
 }
 return b.build();
}
const MODELS={greens,beans,corn,cassava,sweet_potato:sweetPotato,pumpkin,cowpea};
const geometry={};
const cropGeometry=(id,mature)=>geometry[`${id}:${mature}`]??=MODELS[id](mature);
// Far tufts: colour, radius, height.
const FAR={greens:['#74a745',.19,.2],beans:['#51893c',.2,.62],corn:['#688f42',.26,1.9],cassava:['#548d40',.42,1.8],sweet_potato:['#52904a',.3,.16],pumpkin:['#548f44',.48,.4],cowpea:['#5a9545',.24,.6]};
const dummy=new THREE.Object3D(),tint=new THREE.Color();
const noise=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
function instanced(geo,material,items,place){
 const mesh=new THREE.InstancedMesh(geo,material,items.length);mesh.userData.ownedMaterial=true;
 items.forEach((item,i)=>{place(item,i);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,tint);});
 mesh.castShadow=true;mesh.receiveShadow=true;return mesh;
}

export function createCultivationModel(p,state){
 const root=new THREE.Group(),beds=p.cultivation.beds;
 const size=p.key==='field'?p.fieldSize:p.key==='garden'?[3,6]:[4,6];
 const ground=(x,z)=>{
  if(p.key!=='field')return 0;
  const angle=(p.rotation||0)*Math.PI/2,cx=(p.x-32+((p.rotation||0)%2?size[1]-1:size[0]-1)/2)*2,cz=(p.z-32+((p.rotation||0)%2?size[0]-1:size[1]-1)/2)*2;
  return elevationAt(cx+Math.cos(angle)*x+Math.sin(angle)*z,cz-Math.sin(angle)*x+Math.cos(angle)*z,state.elevationSeed,state.terrainPads)-elevationAt(cx,cz,state.elevationSeed,state.terrainPads);
 };
 const [width,depth]=size.map(n=>n*2);
 if(p.key==='field'){
  root.userData.cultivatedField=true;
  const points=[];
  for(let x=-width/2;x<=width/2;x+=2)points.push([x,-depth/2]);
  for(let z=-depth/2+2;z<=depth/2;z+=2)points.push([width/2,z]);
  for(let x=width/2-2;x>=-width/2;x-=2)points.push([x,depth/2]);
  for(let z=-depth/2+2;z>=-depth/2;z-=2)points.push([-width/2,z]);
  const edge=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points.map(([x,z])=>new THREE.Vector3(x,ground(x,z)+.08,z))),new THREE.LineBasicMaterial({color:'#b5a16c',transparent:true,opacity:.65}));edge.name='field-boundary';edge.userData.ownedMaterial=true;root.add(edge);
 }

 // Trodden earth spreads around every worked bed and fades into the grass.
 const nx=width+1,nz=depth+1,worked=new Float32Array(nx*nz);
 for(const b of beds){
  if(b.stage==='unprepared')continue;
  for(let x=Math.ceil(b.x-b.w/2-.95);x<=b.x+b.w/2+.95;x++)for(let z=Math.ceil(b.z-b.d/2-.95);z<=b.z+b.d/2+.95;z++){
   const ix=x+width/2,iz=z+depth/2;
   if(ix>0&&iz>0&&ix<nx-1&&iz<nz-1)worked[iz*nx+ix]=1;
  }
 }
 if(worked.some(Boolean)){
  const apron=new THREE.PlaneGeometry(width,depth,width,depth).rotateX(-Math.PI/2),at=apron.attributes.position,colors=new Float32Array(at.count*4),path=new THREE.Color(SOIL.path);
  for(let i=0;i<at.count;i++){
   const x=at.getX(i),z=at.getZ(i),shade=.95+noise(x*7.3+z*3.1+p.id)*.1;
   at.setY(i,ground(x,z)+.03);
   colors.set([path.r*shade,path.g*shade,path.b*shade,worked[Math.round(z+depth/2)*nx+Math.round(x+width/2)]],i*4);
  }
  apron.setAttribute('color',new THREE.BufferAttribute(colors,4));apron.computeVertexNormals();
  const earth=new THREE.Mesh(apron,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:0,polygonOffsetUnits:-4}));
  earth.userData.ownedMaterial=true;earth.receiveShadow=true;earth.name='field-earth';root.add(earth);
 }

 // Beds and hoed ridges are draped prisms: neighbouring half-metre sections
 // share their ground heights, so a bed bends over a slope without steps.
 const earth=builder();
 const prism=(x,w,taper,zA,zB,yA,yB,h,sink,hex,tone,capA,capB)=>{
  const at=(z,y)=>[new THREE.Vector3(x-w/2,y-sink,z),new THREE.Vector3(x-w*taper/2,y+h,z),new THREE.Vector3(x+w*taper/2,y+h,z),new THREE.Vector3(x+w/2,y-sink,z)];
  const a=at(zA,yA),b=at(zB,yB);
  for(let i=0;i<3;i++){earth.tri(a[i],b[i],a[i+1],hex,tone);earth.tri(a[i+1],b[i],b[i+1],hex,tone);}
  for(const end of [capA&&a,capB&&b])if(end){earth.tri(end[0],end[1],end[2],hex,tone);earth.tri(end[0],end[2],end[3],hex,tone);}
 };
 const stubble=[],plants=Object.fromEntries(Object.keys(CROPS).map(id=>[id,[]])),boxes={userData:{}};
 for(const b of beds){
  const job=(state.operations||[]).find(o=>!o.done&&o.site===p.id&&o.farm?.bed===b.id);
  const fraction=job?Math.min(1,job.work/job.farm.work):0,tone=.94+noise(p.id*17+b.id)*.12;
  const standing=['growing','harvestable','failed'].includes(b.stage);
  for(let z=-b.d/2;z<b.d/2-1e-6;z+=.5){
   const length=Math.min(.5,b.d/2-z),zA=b.z+z,zB=zA+length,yA=ground(b.x,zA),yB=ground(b.x,zB),first=z===-b.d/2,last=z+length>=b.d/2-1e-6;
   const turf=b.stage==='unprepared'&&!(job?.farm.action==='prepare'&&(z+b.d/2)/b.d<fraction);
   prism(b.x,b.w,turf?.92:.8,zA,zB,yA,yB,turf?.035:.13,.1,turf?SOIL.turf:b.cover>.2?SOIL.mulch:b.moisture>.4?SOIL.moist:SOIL.dry,tone,true,true);
   // Hoed ridges show on bare tilled soil; a crop canopy hides them.
   if(!turf&&!standing&&b.cover<=.2)for(const dx of [-.3,0,.3])prism(b.x+dx,.17,.45,zA,zB,yA+.13,yB+.13,.045,0,b.moisture>.4?SOIL.ridgeMoist:SOIL.ridgeDry,tone,first,last);
  }
  if(b.stage==='harvested')for(let z=-b.d/2+.2;z<b.d/2;z+=.33)for(const dx of [-.3,.3])stubble.push({x:b.x+dx+(noise(b.id*5+z)-.5)*.12,y:ground(b.x,b.z+z)+.13,z:b.z+z,w:.05,h:.07+noise(z+b.id)*.08,d:.05,color:'#c2ac68',tone:1});

  const planting=job?.farm.action==='plant'&&fraction>0;
  if(!standing&&!planting)continue;
  const crop=CROPS[b.crop],spacing=1/Math.sqrt(crop.plants*b.density),health=Math.min(b.elapsed?1-b.stress/b.elapsed:1,1-(b.droughtDamage||0))*(b.stage==='harvestable'?Math.max(.15,1-Math.max(0,(state.time-b.ripeAt)/3200-crop.window)/crop.window):1);
  // Rows are centred on the bed so both shoulders stay clear.
  const across=Math.max(1,Math.floor(b.w/spacing+1e-6)),along=Math.max(1,Math.floor(b.d/spacing+1e-6));
  for(let ix=0;ix<across;ix++)for(let iz=0;iz<along;iz++){
   const x=(ix-(across-1)/2)*spacing,z=(iz-(along-1)/2)*(b.d/along);
   if(planting&&(z+b.d/2)/b.d>fraction)continue;
   if(job?.farm.action==='harvest'&&(z+b.d/2)/b.d<fraction)continue;
   const n=plants[b.crop].length,seed=p.id*97+b.id*13+n*31;
   plants[b.crop].push({x:b.x+x+(noise(seed)-.5)*.05,z:b.z+z+(noise(seed+1)-.5)*.05,y:ground(b.x+x,b.z+z)+.12,growth:Math.max(.1,b.growth),health:b.stage==='failed'?0:Math.max(0,Math.min(1,health)),failed:b.stage==='failed',rotation:n*GOLDEN,vary:noise(seed+2)});
  }
 }

 const beds3d=new THREE.Mesh(earth.build(),new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide,flatShading:true}));
 beds3d.userData.ownedMaterial=true;beds3d.castShadow=true;beds3d.receiveShadow=true;beds3d.name='field-beds';root.add(beds3d);
 if(stubble.length){
  const detail=instanced(new THREE.BoxGeometry(1,1,1).translate(0,.5,0),new THREE.MeshStandardMaterial({color:'#ffffff',roughness:1}),stubble,m=>{dummy.position.set(m.x,m.y,m.z);dummy.rotation.set(0,0,0);dummy.scale.set(m.w,m.h,m.d);tint.set(m.color).multiplyScalar(m.tone);});
  detail.castShadow=false;root.add(detail);
 }

 for(const [id,items]of Object.entries(plants)){
  if(!items.length)continue;
  const near=new THREE.Group();
  const colour=plant=>{tint.setRGB(1,1,1).lerp(WILT,1-plant.health).multiplyScalar(.92+plant.vary*.16);};
  for(const mature of [false,true]){
   const group=items.filter(plant=>(plant.growth>.65&&!plant.failed)===mature);
   if(!group.length)continue;
   near.add(instanced(cropGeometry(id,mature),new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide,flatShading:true}),group,plant=>{
    // Seedlings keep some width so young beds read as planted rows.
    const g=plant.growth,spread=(.3+.7*g)*(.9+plant.vary*.2),tall=g*(.9+plant.vary*.2)*(plant.failed?.7:1);
    dummy.position.set(plant.x,plant.y,plant.z);dummy.rotation.set(plant.failed?.25:0,plant.rotation,0);dummy.scale.set(spread,Math.max(.12,tall),spread);colour(plant);
   }));
  }
  const [farColor,farRadius,farHeight]=FAR[id];
  const distant=instanced(tuft(),new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true}),items,plant=>{
   const g=plant.growth;
   dummy.position.set(plant.x,plant.y,plant.z);dummy.rotation.set(0,plant.rotation,0);dummy.scale.set(farRadius*(.3+.7*g),Math.max(.05,farHeight*g),farRadius*(.3+.7*g));
   colour(plant);tint.multiply(new THREE.Color(farColor));
  });
  distant.castShadow=false;
  const lod=new THREE.LOD();lod.userData.crops=true;lod.userData.plants=items.length;lod.addLevel(near,0);lod.addLevel(distant,65);
  // The game camera is orthographic: detail follows zoom, so a field looks
  // the same wherever it sits on screen.
  const update=lod.update.bind(lod);
  lod.update=camera=>{
   if(!camera.isOrthographicCamera)return update(camera);
   const far=camera.zoom<(lod.levels[1].distance===Infinity?0:.5);
   lod.levels[0].object.visible=!far;lod.levels[1].object.visible=far;
  };
  root.add(lod);
 }

 if(p.key==='greenhouse'){
  const box=(group,w,h,d,color,x,y,z,opacity=1)=>{
   const m=new THREE.Object3D();m.position.set(x,y,z);m.scale.set(w,h,d);
   group.userData.boxes??=new Map();const key=`${color}:${opacity}`;
   if(!group.userData.boxes.has(key))group.userData.boxes.set(key,{color,opacity,parts:[]});
   group.userData.boxes.get(key).parts.push(m);return m;
  };
  greenhouseShell(boxes,box);
  for(const {color,opacity,parts}of boxes.userData.boxes.values()){
   const batch=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color,roughness:.9,transparent:opacity<1,opacity,depthWrite:opacity===1,side:THREE.DoubleSide}),parts.length);
   batch.userData.ownedMaterial=true;batch.castShadow=opacity===1;batch.receiveShadow=true;
   parts.forEach((part,i)=>{part.updateMatrix();batch.setMatrixAt(i,part.matrix);});root.add(batch);
  }
 }
 return root;
}
