import * as THREE from 'three';

// A 6 × 10 m shell around the existing beds. Both one-metre entrances and
// the central aisle stay clear; detail is attached to the existing walls.
export function greenhouseShell(root,box) {
 const frame='#a58b62',trim='#bba57b',stone='#a99b7e',glass='#d9e2cc';
 const part=(w,h,d,color,x,y,z,opacity=1)=>box(root,w,h,d,color,x,y,z,opacity);
 const beam=(a,b,width=.10,color=frame)=>{
  const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),delta=to.clone().sub(from);
  const p=part(width,delta.length(),width,color,...from.add(to).multiplyScalar(.5).toArray());
  p.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return p;
 };
 const eave=2.6,ridge=3.7,slope=Math.atan2(ridge-eave,3),roofWidth=Math.hypot(3,ridge-eave);
 for(const side of [-1,1]) {
  // A shallow stone footing keeps the timber clear of damp soil.
  part(.15,.10,10,stone,side*3,.05,0);
  for(const y of [.22,eave])part(.065,.065,10.06,frame,side*3,y,0);
  for(let bay=0;bay<4;bay++){
   const z=-3.75+bay*2.5;
   part(.018,2.25,2.40,glass,side*3,1.38,z,.12);
   // Separate roof bays make the glazing and supporting structure readable.
   const pane=part(roofWidth-.10,.025,2.38,glass,side*1.5,(eave+ridge)/2,z,.16);
   pane.rotation.z=-side*slope;
  }
  // Slender longitudinal supports and a modest rain channel.
  part(.055,.055,10.1,trim,side*1.5,(eave+ridge)/2+.04,0);
  part(.075,.055,10.12,trim,side*3.08,eave-.04,0);
  part(.04,2.38,.04,trim,side*3.08,1.2,-4.92);
  // Bed edging leaves the cultivated soil and plants visible.
  for(const dx of [-.64,.64])part(.065,.14,8.1,'#947b53',side*1.2+dx,.10,0);
  for(const z of [-4.04,4.04])part(1.34,.14,.065,'#947b53',side*1.2,.10,z);
 }
 for(const z of [-5,-2.5,0,2.5,5]){
  for(const side of [-1,1]){
   beam([side*3,.1,z],[side*3,eave,z],.075);
   beam([side*3,eave,z],[0,ridge,z],.075);
   // Short knee braces express how the roof is actually supported.
   if(Math.abs(z)===5)beam([side*3,2.18,z],[side*2.65,2.73,z],.045,trim);
  }
 }
 part(.08,.075,10.12,frame,0,ridge,0);
 for(const z of [-5,5]) {
  // Open door portals: no decorative door leaf across the navigable entrance.
  for(const x of [-.55,.55])part(.065,2.35,.065,frame,x,1.175,z);
  part(1.2,.065,.065,frame,0,2.35,z);
  part(6.06,.065,.065,frame,0,eave,z);
  for(const side of [-1,1]){
   part(2.35,.10,.15,stone,side*1.775,.05,z);
   for(const y of [.22,2.35])part(2.35,.05,.05,frame,side*1.775,y,z);
   part(2.32,1.85,.025,glass,side*1.775,1.35,z,.12);
   beam([side*.55,2.65,z],[side*.55,ridge-.22,z],.045);
  }
  // Gable ventilation louvers under the ridge.
  for(let y=2.75;y<3.5;y+=.25){const width=2*(ridge-y)/Math.tan(slope)-.18;part(Math.min(width,1.12),.035,.055,trim,0,y,z);}
 }
 // Raised vent flaps give the roof a distinctive working-greenhouse profile.
 for(const z of [-2.5,2.5]){
  const vent=part(1.15,.035,1.35,glass,.56,3.69,z,.24);vent.rotation.z=.16;
  for(const dz of [-.7,.7])beam([0,3.6,z+dz],[1.14,3.79,z+dz],.04,trim);
  for(const [x,y]of [[0,3.6],[1.14,3.79]])part(.04,.04,1.46,trim,x,y,z);
  beam([1.14,3.29,z],[1.14,3.79,z],.035,frame);
 }
 for(let z=-4.6;z<5;z+=.8)part(.82,.035,.73,z%1.6<.8?'#b5a98d':'#a99c80',0,.025,z);
}
