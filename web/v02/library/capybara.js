import * as THREE from 'three';
import {ball,box} from '../workshop/models.js';
// Blunt rectangular muzzle, tiny rounded ears and a heavy barrel body.
export function createCapybara(){
 const root=new THREE.Group(),body=new THREE.Group();root.add(body);
 const coat=new THREE.MeshStandardMaterial({color:'#92704b',roughness:1,flatShading:true});
 const dark=new THREE.MeshStandardMaterial({color:'#342e25',roughness:1});
 const shape=(x,y,z,sx,sy,sz)=>{const m=ball(body,1,'earth',x,y,z,[sx,sy,sz],1);m.material=coat;return m;};
 shape(0,.5,0,.38,.4,.65);
 const head=new THREE.Group();head.position.set(0,.69,.48);body.add(head);
 const skull=box(head,.46,.38,.48,'earth',0,0,.12);skull.material=coat;
 const snout=box(head,.44,.25,.27,'earth',0,-.045,.39);snout.material=coat;
 for(const side of [-1,1]){
  const ear=ball(head,.085,'earth',side*.19,.22,-.02,[.8,1,.65],1);ear.material=coat;
  const eye=ball(head,.025,'earth',side*.235,.07,.24,[.5,1,1],1);eye.material=dark;
  const nostril=ball(head,.018,'earth',side*.12,-.01,.53,[1,.7,.4],0);nostril.material=dark;
 }
 const legs=[];
 for(const x of [-.25,.25])for(const z of [-.4,.4]){
  const pivot=new THREE.Group();pivot.position.set(x,.37,z);root.add(pivot);
  const leg=box(pivot,.15,.3,.18,'earth',0,-.15,0);leg.material=coat;
  const foot=box(pivot,.17,.09,.23,'earth',0,-.325,.025);foot.material=coat;legs.push(pivot);
 }
 root.traverse(m=>{if(m.isMesh)m.castShadow=m.receiveShadow=true;});
 root.userData.capybara={body,head,legs};return root;
}
export function poseCapybara(root,time,walking){
 const {body,head,legs}=root.userData.capybara;
 body.position.y=walking?Math.abs(Math.sin(time*5))*.025:Math.sin(time*1.5)*.008;
 head.rotation.x=walking?0:.18+Math.sin(time*.7)*.12;
 legs.forEach((leg,i)=>leg.rotation.x=walking?Math.sin(time*5+(i===0||i===3?0:Math.PI))*.28:0);
}
