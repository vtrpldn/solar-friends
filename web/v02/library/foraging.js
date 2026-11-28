import * as THREE from 'three';
import {ball,beam,cylinder} from '../workshop/models.js';
// Human-scale, untextured geometry shares the village's existing material pool.
// No opaque terrain platform: each stem, branch and stone touches the ground.
export function forageModel(kind,depleted=false){
 const g=new THREE.Group();
 const crown=(x,y,z,r,m='leaf',scale=[1,1,1])=>ball(g,r,m,x,y,z,scale,0);
 if(kind==='fruit'){
  for(const [x,z,h] of [[-.9,-.55,1.25],[.65,-.3,1.55],[.1,.8,1]]){
   beam(g,[x,0,z],[x+.08,h*.65,z],.07,'timber');
   for(let i=0;i<5;i++){const a=i*2.4;const px=x+Math.cos(a)*.36,pz=z+Math.sin(a)*.32,py=h-.15+(i%2)*.22;
    beam(g,[x,h*.4,z],[px,py,pz],.035,'timber');crown(px,py,pz,.45,i%2?'leafLight':'leaf',[1,.8,1]);
    for(let j=0;j<(depleted?0:2);j++)crown(px+(j-.5)*.26,py-.08,pz+.38,.065,'tile');
   }
  }
 }else if(kind==='wood'){
  const branches=[[-.8,-.35,.3,1.3],[.5,.2,1.4,1.5],[-.25,.4,2.6,.95],[.9,-.4,.75,.8],[-1.15,.25,1.8,.65]];
  for(const [x,z,angle,length] of branches.slice(0,depleted?1:5)){
   const dx=Math.cos(angle)*length/2,dz=Math.sin(angle)*length/2;
   beam(g,[x-dx,.1,z-dz],[x+dx,.13,z+dz],.12,'timber');
   beam(g,[x,.12,z],[x+Math.cos(angle+.8)*.45,.1,z+Math.sin(angle+.8)*.45],.045,'timberLight');
  }
 }else if(kind==='bamboo'){
  for(let i=0;i<9;i++){const a=i*2.4,r=.3+(i%3)*.4,x=Math.cos(a)*r,z=Math.sin(a)*r,h=depleted?.25+(i%3)*.25:1.2+(i%4)*.55;
   cylinder(g,.045,.065,h,'leafDark',x,h/2,z,6);
   for(let y=.35;y<h;y+=.4)cylinder(g,.069,.069,.035,'leafLight',x,y,z,6);
   for(let j=0;j<Math.min(3,Math.floor(h/.34));j++){const y=h-.15-j*.34,dx=(j%2?-.45:.45);beam(g,[x,y,z],[x+dx,y+.1,z+.15],.02,'leafDark');crown(x+dx,y+.12,z+.15,.3,'leaf',[1.2,.12,.45]);}
  }
 }else if(kind==='grass'){
  for(let i=0;i<13;i++){const x=Math.sin(i*5.3)*1.35,z=Math.cos(i*2.4)*.55;
   for(let j=0;j<4;j++){const dx=(j-1.5)*.13,h=depleted?.12:.35+((i+j)%4)*.13;beam(g,[x,.02,z],[x+dx,h,z+.1],.025,j%2?'leaf':'leafLight');}
   if(!depleted){beam(g,[x,.05,z],[x+.06,.85,z],.018,'timberLight');crown(x+.06,.83,z,.1,'earth',[.5,1.7,.5]);}
  }
 }else if(kind==='saplings'){
  // Knee-high young trees; once dug, the holes and a couple of the smallest remain.
  for(let i=0;i<(depleted?2:6);i++){const a=i*2.4,r=.12+(i%3)*.11,x=Math.cos(a)*r,z=Math.sin(a)*r,h=depleted?.22:.4+(i%3)*.2;
   beam(g,[x,0,z],[x+.02,h,z],.018,'timber');crown(x+.02,h,z,h*.3,i%2?'leafLight':'leaf',[1,.8,1]);
   crown(x+.08,h*.7,z+.05,h*.2,'leaf',[1,.7,1]);}
  if(depleted)for(let i=0;i<3;i++)crown(Math.cos(i*2.1+1)*.28,.02,Math.sin(i*2.1+1)*.28,.1,'earth',[1,.3,1]);
 }else if(kind==='stone'){
  for(let i=0;i<(depleted?2:11);i++){const r=.13+(i%3)*.07;crown(Math.sin(i*2.4)*1.2,r*.55,Math.cos(i*4.1)*.6,r,'stone',[1.3,.75,1]);}
 }
 return g;
}
export const FORAGING_ASSETS=['fruit','wood','bamboo','grass','stone','saplings'].flatMap(kind=>[false,true].map(depleted=>({id:`forage-${kind}${depleted?'-gathered':''}`,name:`Wild gathering · ${kind}${depleted?' · gathered':''}`,category:'Gathering',type:'Vegetation',footprint:['fruit','bamboo'].includes(kind)?[2,2]:kind==='saplings'?[1,1]:[2,1],revision:1,legacy:[],build:()=>forageModel(kind,depleted),description:'Local gathering patch in the shared low-poly palette and human scale.'})));
