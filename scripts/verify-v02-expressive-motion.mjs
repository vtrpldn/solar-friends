import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createResident,poseResident,animateResident,RESIDENT_IDS} from '../web/v02/residents/rig.js';
import {conversationMotion} from '../web/v02/weekend/resident-motion.js';
import {downtimeMotion} from '../web/v02/weekend/resident-downtime.js';

const actions=['wave','listen','laugh','neck-stretch','shoulder-roll','yawn','ground-relax'];
for(const id of RESIDENT_IDS){
 const {rig}=createResident(id);
 for(const action of actions){
  const poses=[];
  for(let t=0;t<6;t+=.2){
   poseResident(rig,action,t);
   rig.root.traverse(o=>assert(o.matrixWorld.elements.every(Number.isFinite),`${id}: ${action}`));
   const floor=Math.min(...rig.legs.map(l=>new THREE.Box3().setFromObject(l.hip).min.y));
   assert(floor>=-.001,`${id} ${action}: below ground`);
   assert(!rig.book.visible && !rig.cargo.visible && !rig.can.visible && !rig.bowl.visible,'no stale props');
   poses.push(rig.joints.flatMap(j=>[...j.position.toArray(),...j.quaternion.toArray()]));
  }
  assert(poses.some(p=>p.some((n,i)=>Math.abs(n-poses[0][i])>1e-3)),`${action} must visibly move over time`);
  animateResident(rig,action,1,1);
  const before=rig.joints.map(j=>({p:j.position.clone(),q:j.quaternion.clone()}));
  animateResident(rig,'walk',2,0);
  rig.joints.forEach((j,i)=>{assert(j.position.distanceTo(before[i].p)<1e-9);assert(j.quaternion.angleTo(before[i].q)<1e-6);});
  animateResident(rig,'walk',2,1);
  assert(rig.hips.position.y>.85,'stand back up after seated gestures');
 }
 poseResident(rig,'ground-read',0);const initial=rig.arms[1].shoulder.rotation.z;
 poseResident(rig,'ground-read',2.4);assert(Math.abs(rig.arms[1].shoulder.rotation.z-initial)>.4,'reading includes a page-turn gesture');
 assert(rig.book.visible);
}
const resident=(id,partner,elapsed,kind='support')=>({id,needTask:{kind:'social',partner,elapsed,conversation:{kind}}});
assert.equal(conversationMotion(resident('iara','luz',0)),'look','no remote conversation gestures');
assert.equal(conversationMotion(resident('iara','luz',1)),'wave');
for(let t=2;t<18;t+=.2){
 const pair=[conversationMotion(resident('iara','luz',t)),conversationMotion(resident('luz','iara',t))];
 assert.deepEqual(pair.sort(),['chat','listen'],'one speaks while the other listens');
}
assert.equal(conversationMotion(resident('luz','iara',12.5,'interest')),'laugh');
assert.notEqual(conversationMotion(resident('luz','iara',12.5,'support')),'laugh','do not laugh at a concern');
const downtime=(kind,elapsed,extra={})=>({action:'relax',walk:[],downtime:{kind,elapsed,animation:'fire-sit',arrived:true},...extra});
assert.equal(downtimeMotion(downtime('fire',12)),'ground-relax');
assert.equal(downtimeMotion(downtime('stretching',2)),'neck-stretch');
assert.equal(downtimeMotion(downtime('stretching',9)),'shoulder-roll');
assert.equal(downtimeMotion(downtime('stretching',16)),'stretch');
assert.equal(downtimeMotion(downtime('breather',1)),'yawn');
assert.equal(downtimeMotion(downtime('breather',5)),'breathe');
assert.equal(downtimeMotion(downtime('fire',12,{walk:[{x:1,z:1}]})),null,'walking overrides gestures');
console.log('PASS expressive motion: six identities, finite moving poses, grounded limbs, prop cleanup, interrupted transitions, page turns, greeting/speaking/listening/laughter, varied breaks and tired yawns');
