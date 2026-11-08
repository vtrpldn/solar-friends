import {createCapybara} from "./capybara.js";
import * as THREE from 'three';
import {ball,box,beam} from '../workshop/models.js';
const materials=new Map();
function tint(mesh,color){
  if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({color,roughness:1,flatShading:true}));
  mesh.material=materials.get(color);return mesh;
}
function shape(g,r,color,x,y,z,scale=[1,1,1],detail=0){return tint(ball(g,r,'plaster',x,y,z,scale,detail),color);}
function bar(g,a,b,width,color){return tint(beam(g,a,b,width,'timber'),color);}
const dark='#443b32',hoof='#554b3e';
function quadruped(kind,coat,young=false){
  const g=new THREE.Group();
  const cow=kind==='cow',sheep=kind==='sheep',pig=kind==='pig',donkey=kind==='donkey',rabbit=kind==='rabbit';
  const y=rabbit?.26:pig?.48:sheep?.65:1.02;
  const length=rabbit?.3:pig?.57:sheep?.56:1.0;
  const width=rabbit?.2:pig?.35:sheep?.33:.43;
  shape(g,1,coat,0,y,0,[length,sheep?.38:pig?.36:rabbit?.23:.5,width],1);
  const headX=length*.85,headY=y+(pig?0:rabbit?.13:sheep?.14:.42);
  if(cow||donkey)shape(g,.3,coat,length*.7,y+.27,0,[.9,1.7,1],1);
  shape(g,(pig?.28:rabbit?.18:.27)*(young?1.12:1),coat,headX,headY,0,[pig?1.2:.95,donkey?1.35:1,.85],1);
  const muzzleX=headX+(rabbit?.13:pig?.22:.23),muzzleY=headY-(cow||donkey?.13:.03);
  shape(g,pig?.17:rabbit?.075:.19,pig?'#c18d79':donkey?'#c7b897':'#ad957b',muzzleX,muzzleY,0,[.95,.7,1]);
  if(pig)for(const z of [-.06,.06])shape(g,.022,dark,muzzleX+.14,muzzleY,z);
  for(const side of [-1,1]){
    shape(g,rabbit?.014:.024,dark,headX+.12,headY+.07,side*(rabbit?.13:.2));
    const ear=shape(g,.12,coat,headX-.09,headY+.2,side*.2,[rabbit?.55:1,rabbit?2.1:donkey?2.5:.55,rabbit?.65:1.3]);
    ear.rotation.x=side*(rabbit?.2:donkey?.15:.45);
    if(cow&&!young)bar(g,[headX-.08,headY+.22,side*.16],[headX-.14,headY+.38,side*.31],.055,'#c6b992');
  }
  for(const x of [-length*.65,length*.57])for(const z of [-width*.62,width*.62]){
    const knee=y*.4;
    bar(g,[x,y-.12,z],[x+(x<0?-.04:.04),knee,z],rabbit?.075:pig?.12:.11,coat);
    bar(g,[x+(x<0?-.04:.04),knee,z],[x,.09,z],rabbit?.055:.075,coat);
    tint(box(g,rabbit?.16:.14,.1,rabbit?.12:.15,'timber',x,.05,z),rabbit?coat:hoof);
  }
  if(sheep){
    // Broad fleece masses, not tiny noisy curls.
    for(let i=0;i<7;i++)shape(g,.24,coat,Math.sin(i*2.4)*.34,y+.12,Math.cos(i*2.4)*.21,[1,1,.9]);
    shape(g,.13,coat,headX-.03,headY+.18,0);
  }
  if(cow){
    for(const side of [-1,1])shape(g,.32,coat==='#dfd3b7'?'#735442':'#dec9a4',-.25,y+.12,side*.35,[1.35,.85,.23]);
  }
  if(donkey){
    bar(g,[.55,y+.4,0],[.78,headY+.26,0],.13,dark);
    bar(g,[-.84,y+.35,0],[.5,y+.45,0],.08,dark);
  }
  if(rabbit)shape(g,.1,'#e4d7ba',-length,y+.06,0);
  else if(pig){
    bar(g,[-length,y+.1,0],[-length-.16,y+.17,0],.045,coat);
    bar(g,[-length-.16,y+.17,0],[-length-.12,y+.27,0],.04,coat);
  }else{
    bar(g,[-length*.9,y+.16,0],[-length*1.06,y-.28,0],.045,coat);
    shape(g,.075,dark,-length*1.06,y-.3,0,[.7,1.5,.7]);
  }
  if(young){
    g.scale.setScalar(kind==='cow'?.58:.6);
    // The larger relative head and horn-free calf distinguish juvenile proportions.
  }
  return g;
}
function piglet() {
  const g = new THREE.Group(), coat = '#d6ae96', pink = '#bd8875';
  shape(g,1,coat,-.07,.28,0,[.34,.22,.21],1);
  // A broad forehead flows into a short, flat snout instead of a pointed muzzle.
  shape(g,.21,coat,.23,.32,0,[1,.94,.9],1);
  tint(box(g,.095,.11,.17,'plaster',.425,.275,0),pink);
  for(const side of [-1,1]) {
    shape(g,.012,dark,.478,.285,side*.045);
    shape(g,.016,dark,.33,.375,side*.155);
    const ear=shape(g,.075,coat,.18,.49,side*.125,[.9,.55,1.15]);
    ear.rotation.x=side*.45;ear.rotation.z=-.3;
    shape(g,.039,pink,.195,.505,side*.145,[.9,.25,.85]);
  }
  for(const x of [-.27,.16])for(const z of [-.13,.13]) {
    bar(g,[x,.23,z],[x,.055,z],.07,coat);
    tint(box(g,.075,.045,.07,'earth',x,.0225,z),'#967561');
  }
  // A tiny curled tail, kept attached to the rump.
  const points=[[-.38,.31,0],[-.46,.34,0],[-.48,.4,0],[-.43,.425,0],[-.41,.39,0]];
  for(let i=1;i<points.length;i++)bar(g,points[i-1],points[i],.025,coat);
  return g;
}
function bird(goose=false,brown=false){
  const g=new THREE.Group(),coat=brown?'#977451':'#e3d8bd';
  shape(g,.32,coat,0,.32,0,[1.25,.85,.8],1);
  shape(g,.15,coat,.25,goose?.68:.47,0,[.7,goose?2.2:1.2,.75],1);
  shape(g,.14,coat,.31,goose?.97:.59,0,[1,.95,.9],1);
  tint(box(g,.21,.065,.12,'earth',.48,goose?.94:.56,0),'#c69443');
  for(const side of [-1,1]){
    shape(g,.017,dark,.37,goose?1:.62,side*.115);
    shape(g,.22,brown?'#745b43':'#c9bea1',-.02,.36,side*.23,[1.2,.65,.25]);
    bar(g,[.02,.22,side*.13],[.02,.05,side*.13],.035,'#c69443');
    tint(box(g,.15,.035,.12,'earth',.07,.018,side*.13),'#c69443');
  }
  shape(g,.15,coat,-.35,.4,0,[1.1,.5,.6]);return g;
}
export const LIVESTOCK=[
  ["capybara","Capybara",createCapybara],
  ['cow-cream','Cream dairy cow',()=>quadruped('cow','#dfd3b7')],
  ['cow-brown','Brown dairy cow',()=>quadruped('cow','#98704c')],
  ['calf','Calf',()=>quadruped('cow','#b08c61',true)],
  ['sheep','Sheep',()=>quadruped('sheep','#e3d5b4')],
  ['lamb','Lamb',()=>quadruped('sheep','#e3d5b4',true)],
  ['pig','Pig',()=>quadruped('pig','#cda28d')],
  ['piglet','Piglet',piglet],
  ['donkey','Donkey',()=>quadruped('donkey','#99917d')],
  ['duck-cream','Cream duck',()=>bird()],
  ['duck-brown','Brown duck',()=>bird(false,true)],
  ['goose','Goose',()=>bird(true)],
  ['rabbit-cream','Cream rabbit',()=>quadruped('rabbit','#dfd3b7')],
  ['rabbit-brown','Brown rabbit',()=>quadruped('rabbit','#99754f')],
].map(([id,name,build])=>({id,name,build}));
