import * as THREE from 'three';
import {box, cylinder, beam, clayRoof} from '../workshop/models.js';
export function createEntrancePortal() {
  const g = new THREE.Group();
  g.name = 'entrance-portal';
  // Posts stand outside both traffic lanes; the overhead beam clears the SUVs.
  for (const side of [-1,1]) {
    box(g,.65,.65,.7,'stone',side*5.3,.325,0);
    box(g,.36,4.4,.36,'timber',side*5.3,2.6,0);
    box(g,.44,.12,.44,'timberLight',side*5.3,1,0);
    beam(g,[side*5.3,3.3,0],[side*4.3,4.35,0],.2,'timberLight');
  }
  box(g,11.4,.32,.4,'timber',0,4.5,0);
  const roof = new THREE.Group();
  roof.rotation.y = Math.PI/2;
  clayRoof(roof,{half:.7,depth:11.5,eave:4.65,rise:.4,ridgeHeight:5.13});
  g.add(roof);
  // A carved sun badge reads from both directions without a tiny text texture.
  box(g,2.1,.72,.16,'teal',0,3.65,0);
  for(const side of [-1,1]) {
    const sun=cylinder(g,.19,.19,.035,'shirt',0,3.65,side*.1,10);
    sun.rotation.x=Math.PI/2;
    for(let i=0;i<8;i++) {
      const a=i*Math.PI/4;
      const ray=box(g,.06,.12,.035,'plaster',Math.sin(a)*.3,3.65+Math.cos(a)*.3,side*.1);
      ray.rotation.z=-a;
    }
  }
  return g;
}
export function createUtilityPole() {
  const g = new THREE.Group();
  g.name = 'entrance-electric-pole';
  cylinder(g,.13,.23,6.6,'stone',0,3.3,0,8);
  box(g,1.9,.16,.18,'timber',0,6.15,0);
  beam(g,[-.75,6.1,0],[0,5.6,0],.07,'glass');
  beam(g,[.75,6.1,0],[0,5.6,0],.07,'glass');
  for(const x of [-.75,0,.75]) {
    cylinder(g,.045,.045,.42,'glass',x,6.36,0,6);
    for(const y of [6.28,6.39,6.5]) cylinder(g,.11,.11,.055,'plaster',x,y,0,8);
  }
  cylinder(g,.3,.3,.85,'teal',.36,5.12,0,10);
  cylinder(g,.34,.34,.08,'glass',.36,5.58,0,10);
  box(g,.4,.56,.23,'plaster',.25,1.6,.12);
  box(g,.2,.18,.025,'glass',.25,1.7,.25);
  beam(g,[.15,1.9,.12],[.15,4.7,.12],.045,'glass');
  return g;
}
