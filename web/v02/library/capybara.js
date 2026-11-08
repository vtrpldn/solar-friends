import * as THREE from 'three';
import {ball,box} from '../workshop/models.js';
// Lean, high-rumped rodent silhouette with a long blunt face and narrow muzzle.
export function createCapybara(){
 const root=new THREE.Group(),body=new THREE.Group();root.add(body);
 const coat=new THREE.MeshStandardMaterial({color:'#a38653',roughness:1,flatShading:true});
 const dark=new THREE.MeshStandardMaterial({color:'#342e25',roughness:1});
 const shape=(x,y,z,sx,sy,sz)=>{const m=ball(body,1,'earth',x,y,z,[sx,sy,sz],1);m.material=coat;return m;};
 shape(0,.61,-.06,.30,.36,.66);
 shape(0,.72,-.34,.30,.30,.34);
 const head=new THREE.Group();head.position.set(0,.79,.43);body.add(head);
 const skull=ball(head,1,'earth',0,0,.16,[.19,.18,.36],1);skull.material=coat;
 const snout=ball(head,1,'earth',0,-.035,.45,[.17,.13,.19],1);snout.material=coat;
 for(const side of [-1,1]){
  const ear=ball(head,.07,'earth',side*.14,.14,0,[.65,1,.5],0);ear.material=coat;
  const eye=ball(head,.025,'earth',side*.16,.06,.19,[.5,1,1],1);eye.material=dark;
  const nostril=ball(head,.018,'earth',side*.09,.065,.61,[1,.7,.4],0);nostril.material=dark;
 }
 const legs=[];
 for(const x of [-.21,.21])for(const z of [-.4,.4]){
  const pivot=new THREE.Group();pivot.position.set(x,.43,z);root.add(pivot);
  const leg=box(pivot,.11,.36,.13,'earth',0,-.18,0);leg.material=coat;
  const foot=box(pivot,.13,.08,.20,'earth',0,-.39,.025);foot.material=coat;legs.push(pivot);
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
