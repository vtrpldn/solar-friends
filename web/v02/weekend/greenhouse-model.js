import * as THREE from 'three';

// A 6 × 10 m shell around the existing beds. Both one-metre entrances and
// the central aisle stay clear; detail is attached to the existing walls.
export function greenhouseShell(root,box) {
 const frame='#526f62',trim='#769185',stone='#998c73',glass='#c6dfcf';
 const part=(w,h,d,color,x,y,z,opacity=1)=>box(root,w,h,d,color,x,y,z,opacity);
 const beam=(a,b,width=.10,color=frame)=>{
  const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),delta=to.clone().sub(from);
  const p=part(width,delta.length(),width,color,...from.add(to).multiplyScalar(.5).toArray());
  p.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return p;
 };
 const eave=2.6,ridge=3.7,slope=Math.atan2(ridge-eave,3),roofWidth=Math.hypot(3,ridge-eave);
 for(const side of [-1,1]) {
  // Low masonry sill, with a cap and individual joints rather than a flat slab.
  part(.22,.28,10,stone,side*3,.14,0);
  part(.27,.07,10.12,'#b7ad92',side*3,.315,0);
  for(let z=-4.5;z<5;z+=1)part(.225,.24,.025,'#786f5c',side*3,.14,z);
  for(const y of [.38,1.35,eave])part(.11,.09,10.15,frame,side*3,y,0);
  for(let bay=0;bay<4;bay++){
   const z=-3.75+bay*2.5;
   for(const y of [.85,1.94])part(.025,y<1? .88:1.15,2.36,glass,side*3,y,z,.18);
   // Separate roof bays make the glazing and supporting structure readable.
   const pane=part(roofWidth-.10,.025,2.38,glass,side*1.5,(eave+ridge)/2,z,.16);
   pane.rotation.z=-side*slope;
  }
  // Roof purlin and rain channel follow the length of the structure.
  part(.09,.09,10.2,trim,side*1.5,(eave+ridge)/2+.04,0);
  part(.16,.13,10.25,frame,side*3.08,eave-.04,0);
  part(.06,2.38,.06,trim,side*3.08,1.2,-4.92);
  // Bed edging leaves the cultivated soil and plants visible.
  for(const dx of [-.64,.64])part(.065,.14,8.1,'#947b53',side*1.2+dx,.10,0);
  for(const z of [-4.04,4.04])part(1.34,.14,.065,'#947b53',side*1.2,.10,z);
 }
 for(const z of [-5,-2.5,0,2.5,5]){
  for(const side of [-1,1]){
   beam([side*3,.32,z],[side*3,eave,z],.12);
   beam([side*3,eave,z],[0,ridge,z],.12);
   // Short knee braces express how the roof is actually supported.
   beam([side*3,2.05,z],[side*2.45,2.8,z],.075,trim);
  }
 }
 part(.16,.13,10.3,frame,0,ridge,0);
 for(const z of [-5,5]) {
  // Open door portals: no decorative door leaf across the navigable entrance.
  for(const x of [-.55,.55])part(.10,2.35,.13,frame,x,1.175,z);
  part(1.2,.12,.14,frame,0,2.35,z);
  part(6.1,.10,.12,frame,0,eave,z);
  for(const side of [-1,1]){
   part(2.35,.28,.22,stone,side*1.775,.14,z);
   for(const y of [1.35,2.35])part(2.35,.08,.10,frame,side*1.775,y,z);
   part(2.32,1.85,.025,glass,side*1.775,1.35,z,.18);
   beam([side*.65,.4,z],[side*2.9,1.3,z],.055,trim);
   beam([side*.55,2.65,z],[side*.55,ridge-.22,z],.075);
  }
  // Gable ventilation louvers under the ridge.
  for(let y=2.75;y<3.5;y+=.14){const width=2*(ridge-y)/Math.tan(slope)-.18;part(width,.045,.12,trim,0,y,z);}
 }
 // Raised vent flaps give the roof a distinctive working-greenhouse profile.
 for(const z of [-2.5,2.5]){
  const vent=part(1.15,.035,1.35,glass,.56,3.69,z,.24);vent.rotation.z=.16;
  for(const dz of [-.7,.7])beam([0,3.6,z+dz],[1.14,3.79,z+dz],.065,trim);
  for(const [x,y]of [[0,3.6],[1.14,3.79]])part(.065,.065,1.46,trim,x,y,z);
  beam([1.14,3.29,z],[1.14,3.79,z],.035,frame);
 }
 for(let z=-4.6;z<5;z+=.8)part(.82,.035,.73,z%1.6<.8?'#b5a98d':'#a99c80',0,.025,z);
}
