import * as THREE from 'three';
export const CELL = 2;
export const PALETTE = { plaster: '#e8d8ab', timber: '#936039', timberLight:'#b4834e', tile:'#b95532', tileLight:'#bf633b', tileDark:'#a84f30', teal:'#397c72', glass:'#334f4e', leaf:'#68883c', leafLight:'#91a74c', leafDark:'#3d632f', earth:'#b68a59', stone:'#ac9e7e', skin:'#b87950', shirt:'#d3ad58', trousers:'#496e62', hair:'#3a2a23' };
const materials = Object.fromEntries(Object.entries(PALETTE).map(([k,color])=>[k,new THREE.MeshStandardMaterial({color,roughness:1,metalness:0,flatShading:true})]));
function mesh(g, geo, material, x=0,y=0,z=0) { const m=new THREE.Mesh(geo,materials[material]); m.position.set(x,y,z); m.castShadow=true;m.receiveShadow=true;g.add(m);return m; }
function box(g,w,h,d,m,x=0,y=0,z=0){return mesh(g,new THREE.BoxGeometry(w,h,d),m,x,y,z);}
function cylinder(g,r1,r2,h,m,x=0,y=0,z=0,n=10){return mesh(g,new THREE.CylinderGeometry(r1,r2,h,n),m,x,y,z);}
function ball(g,r,m,x,y,z,s=[1,1,1],detail=1){const a=mesh(g,new THREE.IcosahedronGeometry(r,detail),m,x,y,z);a.scale.set(...s);return a;}
function beam(g,a,b,width,material='timber'){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b);const m=box(g,width,start.distanceTo(end),width,material);m.position.copy(start.add(end).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(...b).sub(new THREE.Vector3(...a)).normalize());return m;}
function roof(g,width,depth,eave,rise){
 const half=width/2, angle=Math.atan2(rise,half), length=Math.hypot(half,rise);
 for(const sign of [-1,1]){
  const slope=new THREE.Group();slope.position.set(sign*half/2,eave+rise/2,0);slope.rotation.z=-sign*angle;g.add(slope);
  box(slope,length,.10,depth,'timber',0,-.04,0);
  const rows=Math.ceil(length/.40),columns=Math.ceil(depth/.26);
  for(let i=0;i<rows;i++)for(let j=0;j<columns;j++){
   // Barrel tiles run down the actual roof plane; no sprite-space distortion.
   const geo=new THREE.CylinderGeometry(.13,.115,length/rows+.035,8,1,true,0,Math.PI);
   const tile=mesh(slope,geo,['tile','tileLight','tileDark'][(i*7+j*3)%11<7?0:(i+j)%2+1],-length/2+(i+.5)*length/rows,.055,-depth/2+(j+.5)*depth/columns);
   tile.rotation.z=Math.PI/2;
  }
  box(slope,length,.15,.11,'timberLight',0,-.045,depth/2);
  box(slope,length,.15,.11,'timberLight',0,-.045,-depth/2);
 }
 for(let z=-depth/2+.12;z<depth/2;z+=.25){const cap=cylinder(g,.145,.145,.27,'tileLight',0,eave+rise+.08,z,10);cap.rotation.x=Math.PI/2;}
}
function gable(g,width,depth,eave,rise){const s=new THREE.Shape();s.moveTo(-width/2,0);s.lineTo(width/2,0);s.lineTo(0,rise);s.closePath();const a=mesh(g,new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:false}),'plaster',0,eave,-depth/2);return a;}
function windowOn(g,x,y,z,rotation=0){const w=new THREE.Group();w.position.set(x,y,z);w.rotation.y=rotation;g.add(w);box(w,.86,.95,.07,'timber');box(w,.71,.80,.10,'glass',0,0,.03);for(const side of [-1,1]){box(w,.29,.80,.10,'teal',side*.25,0,.09);for(let i=0;i<5;i++)box(w,.28,.025,.025,'timberLight',side*.25,-.30+i*.15,.15);}box(w,1.02,.10,.20,'timberLight',0,-.50,.04);}
function house(){const g=new THREE.Group();box(g,3.6,2.6,3.6,'plaster',0,1.3,0);gable(g,3.6,3.6,2.6,.95);roof(g,4,4,2.6,1.05);
 box(g,.98,2.15,.10,'timber',-.65,1.075,1.82);box(g,.83,2.06,.12,'teal',-.65,1.03,1.89);
 for(let i=0;i<5;i++)box(g,.018,2.03,.015,'timber',-.98+i*.165,1.03,1.96);
 ball(g,.035,'tileLight',-.36,1.05,1.98);windowOn(g,.82,1.55,1.82);windowOn(g,1.82,1.5,0,Math.PI/2);windowOn(g,-1.82,1.5,.15,-Math.PI/2);windowOn(g,0,1.5,-1.82,Math.PI);
 for(let side of [-1,1])for(let i=0;i<4;i++)box(g,.36,.13,.018,'tile',side*1.55+(i%2)*.06,.15+i*.18,1.81);
 box(g,1.14,.08,.20,'stone',-.65,.04,1.90);return g;}
function shed(){const g=new THREE.Group();for(const x of [-1.75,1.75])for(const z of [-.75,.75]){box(g,.17,2.35,.17,'timber',x,1.175,z);beam(g,[x,1.75,z],[x-Math.sign(x)*.5,2.28,z],.10);}
 box(g,3.65,.18,.16,'timber',0,2.28,.75);box(g,3.65,.18,.16,'timber',0,2.28,-.75);roof(g,4,2,2.4,.60);
 for(let i=0;i<10;i++)box(g,.32,1.05,.07,i%3?'timber':'timberLight',-1.6+i*.355,.70,-.76);
 box(g,2.8,.12,.48,'timberLight',0,.48,-.42);for(const x of [-1.1,1.1])box(g,.12,.43,.32,'timber',x,.215,-.42);
 return g;}
function tree(){const g=new THREE.Group();cylinder(g,.16,.31,2.6,'timber',0,1.3,0,9);
 for(let i=0;i<6;i++){const a=i*Math.PI/3;beam(g,[0,1.5+i*.14,0],[Math.cos(a)*1.1,3.1+i*.12,Math.sin(a)*1.1],.15);beam(g,[0,.18,0],[Math.cos(a)*.65,.09,Math.sin(a)*.65],.12);}
 const clusters=[[0,3.95,0,1.15],[-1,3.25,.3,.96],[1,3.45,.4,1.02],[.3,3.25,-1,.98],[-.6,3.7,-.7,.94],[.3,3.4,1.1,.92]];
 clusters.forEach(([x,y,z,r],i)=>{ball(g,r,['leaf','leafLight','leafDark'][i%3],x,y,z,[1,.82,1]);for(let j=0;j<7;j++){const a=j*2.399+i;ball(g,r*.36,j%3?'leaf':'leafLight',x+Math.cos(a)*r*.76,y+.2+Math.sin(j*1.3)*.35,z+Math.sin(a)*r*.76,[1,.8,1],0);}});return g;}
function road(){const g=new THREE.Group();box(g,2,.035,2,'earth',0,.0175,0);for(let i=0;i<40;i++){const x=((i*37)%97)/97*1.92-.96,z=((i*53)%89)/89*1.92-.96;const m=ball(g,.026+(i%3)*.012,i%3?'earth':'stone',x,.042,z,[1,.25,.7],0);m.rotation.y=i;}return g;}
function resident(){const g=new THREE.Group();for(const x of [-.13,.13]){box(g,.17,.12,.31,'timber',x,.06,.045);cylinder(g,.085,.075,.66,'trousers',x,.43,0);}
 const torso=cylinder(g,.19,.25,.48,'shirt',0,1.0,0,10);torso.scale.z=.65;cylinder(g,.068,.08,.13,'skin',0,1.31,0);ball(g,.195,'skin',0,1.51,0,[.86,1.05,.87],2);ball(g,.197,'hair',0,1.59,-.035,[.87,.64,.83],1);
 for(const x of [-1,1]){beam(g,[x*.20,1.2,0],[x*.28,.94,.02],.15,'shirt');beam(g,[x*.28,.94,.02],[x*.30,.74,.08],.10,'skin');ball(g,.065,'skin',x*.30,.72,.08,[.7,1,1]);ball(g,.016,'hair',x*.061,1.54,.158,[1,1,.5]);}
 ball(g,.035,'skin',0,1.49,.17,[.7,.8,1]);cylinder(g,.33,.33,.035,'earth',0,1.67,0,20);cylinder(g,.15,.19,.17,'earth',0,1.755,0,16);cylinder(g,.192,.195,.04,'timber',0,1.70,0,16);return g;}
export const ASSETS=[
 {id:'house',name:'Limewashed house',type:'Home',footprint:[2,2],description:'Clay barrel tiles, limewashed walls and timber shutters. A 2.06 m door sets the human scale.',build:house},
 {id:'shed',name:'Open timber shed',type:'Shelter',footprint:[2,1],description:'Open sides, structural braces and a shaded bench. Shares the house’s roof and timber kit.',build:shed},
 {id:'tree',name:'Shade tree',type:'Vegetation',footprint:[2,2],description:'Branch-supported foliage clusters and visible root contact. A generic canopy study, not a botanical species.',build:tree},
 {id:'road',name:'Earth path',type:'Ground',footprint:[1,1],description:'A seamless 2 × 2 m packed-earth tile. Its edges meet the grid without a surrounding platform.',build:road},
 {id:'resident',name:'Resident scale study',type:'Human scale',footprint:[1,1],description:'An authored standing figure, 1.70 m to the head and 1.84 m with hat. A proportion study, not a character creator.',build:resident}
];
export function createAsset(id){const def=ASSETS.find(a=>a.id===id);if(!def)throw new Error(`Unknown asset ${id}`);const g=def.build();g.name=id;g.userData={id,footprint:def.footprint,revision:1};g.updateMatrixWorld(true);return g;}
export function disposeModel(model){model.traverse(o=>{o.geometry?.dispose();});}
