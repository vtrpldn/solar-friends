import {HOME_DESIGN_BY_ID} from './home-designs.js';
import * as THREE from 'three';
import { box, beam, gable, windowPane, cylinder, ball } from '../workshop/models.js';
import {hipRoof,leanRoof,gableRoof} from './roof-forms.js';
import { FUNCTIONAL_LAYOUTS, HOME_CHARACTER } from './functional-layouts.js';

// Roof courses retain their physical spacing as the building grows. This is
// deliberately not a stretched legacy roof (whose tile courses would elongate).
export function functionalRoof(g,w,d,eave=2.85,rise=1.45) {
  gableRoof(g,w,d,eave,rise);
}
function window(g,x,z,rotation=0,shutters='teal') {
  const f=new THREE.Group();f.position.set(x,1.65,z);f.rotation.y=rotation;g.add(f);
  box(f,1.1,1.05,.12,'timber');windowPane(box(f,.96,.91,.14,'glass',0,0,.035));
  for(const side of [-1,1]) {
    box(f,.34,.98,.07,shutters,side*.72,0,.08);
    for(let n=0;n<5;n++)box(f,.31,.035,.08,'timberLight',side*.72,-.36+n*.18,.1);
  }
  box(f,1.25,.08,.24,'timberLight',0,-.56,.06);
}
function roofFrame(g,w,d,type,rise=1.3){
  if(type==='side-gable'){
    const turn=new THREE.Group();turn.rotation.y=Math.PI/2;g.add(turn);roofFrame(turn,d,w,'front-gable',rise);return;
  }
  if(type==='twin-gable'){
    for(const [width,x,h] of [[4,-3,.95],[6,2,1.4]]){const wing=new THREE.Group();wing.position.x=x;g.add(wing);roofFrame(wing,width,d,'front-gable',h);}return;
  }
  for(const x of [-w/2,w/2])beam(g,[x,2.85,-d/2],[x,2.85,d/2],.14,'timber');
  if(type.startsWith('hip')){
    const rx=Math.max(0,(w-d)/2),rz=Math.max(0,(d-w)/2);
    for(const x of [-w/2,w/2])for(const z of [-d/2,d/2])beam(g,[x,2.85,z],[Math.sign(x)*rx,4.15,Math.sign(z)*rz],.12,'timberLight');
    if(rx||rz)beam(g,[-rx,4.15,-rz],[rx,4.15,rz],.14,'timber');
  }else for(const z of [-d/2,0,d/2]){
    beam(g,[-w/2,2.85,z],[w/2,2.85,z],.14,'timber');
    for(const side of [-1,1])beam(g,[side*w/2,2.85,z],[0,2.85+rise,z],.12,'timberLight');
  }
}
export function functionalHome(id,stage=2) {
  const l=FUNCTIONAL_LAYOUTS[id],character=HOME_CHARACTER[id],g=new THREE.Group(),[w,d]=l.shell;
  const doorX=character.doorX, design=HOME_DESIGN_BY_ID[id];
  const porchPosts=[-w/2+.2,-1.3,1.3,w/2-.2];
  if(design && w>9)porchPosts.push(-(w/2+1.1)/2,(w/2+1.1)/2);
  const terracePosts=design?Array.from({length:Math.ceil((d-.4)/3)+1},(_,i)=>-d/2+.2+i*(d-.4)/Math.ceil((d-.4)/3)):[-d/2+.2,d/2-.2];
  const body=new THREE.Group();g.add(body);
  // Front (+Z) verandas and side terraces occupy their own reserved cells.
  body.position.z=l.verandaDepth?-l.verandaDepth/2:0;
  if(l.terrace)body.position.x=-1;
  g.userData={shellArea:w*d,occupants:l.occupants,exteriorOnly:true};
  box(body,w,.16,d,'stone',0,.08,0);
  if(stage===0) {
    for(const x of [-w/2,w/2])for(const z of [-d/2,d/2])box(body,.08,.5,.08,'timber',x,.25,z);
    return g;
  }
  if(stage===1) {
    for(const x of [-w/2+.1,w/2-.1])for(const z of [-d/2+.1,0,d/2-.1])box(body,.14,2.7,.14,'timber',x,1.5,z);
    roofFrame(body,w,d,character.roof,character.rise||(character.roof==='side-gable'?1.1:1.45));
    if(l.verandaDepth)for(const x of porchPosts)box(g,.16,2.45,.16,'timber',x+body.position.x,1.285,d/2+l.verandaDepth/2-.15);
    if(l.terrace)for(const z of terracePosts)for(const x of [w/2-.8,w/2+.8])box(g,.14,2.5,.14,'timber',x,1.25,z);
    return g;
  }
  const wall=id.startsWith('adobe')||id==='home-shared'?'earth':'plaster';
  const wallMaterial=new THREE.MeshStandardMaterial({color:character.wall,roughness:1,flatShading:true});
  function masonry(width,height,depth,x,y,z){const m=box(body,width,height,depth,wall,x,y,z);m.material=wallMaterial;m.userData.ownedMaterial=true;return m;}
  for(const x of [-w/2+.1,w/2-.1])masonry(.2,2.7,d,x,1.51,0);
  masonry(w-.4,2.7,.2,0,1.51,-d/2+.1);
  const leftWidth=w/2+doorX-.5,rightWidth=w/2-doorX-.5;
  masonry(leftWidth,2.7,.2,-w/2+leftWidth/2,1.51,d/2-.1);
  masonry(rightWidth,2.7,.2,w/2-rightWidth/2,1.51,d/2-.1);
  masonry(1,.6,.2,doorX,2.56,d/2-.1);
  const door=box(body,.94,2.04,.065,character.shutters,doorX,1.18,d/2-.065);door.name='entrance-door';
  for(const x of [-.54,.54])box(body,.08,2.18,.24,'timberLight',doorX+x,1.25,d/2-.07);
  box(body,1.16,.08,.24,'timberLight',doorX,2.34,d/2-.07);
  box(body,.05,.05,.06,'tileLight',doorX+.34,1.12,d/2);
  box(body,1.4,.12,.5,'stone',doorX,.06,d/2+.15);
  const frontWindows=design ? Array.from({length:Math.max(2,Math.floor(w/2.7))},(_,i)=>-w/2+1.2+i*(w-2.4)/(Math.max(2,Math.floor(w/2.7))-1)).filter(x=>Math.abs(x-doorX)>1.6) : [-w*.3,w*.3];
  for(const x of frontWindows)window(body,x,d/2+.015,0,character.shutters);
  for(const side of [-1,1])for(const z of [-d*.25,d*.2])window(body,side*(w/2+.015),z,side*Math.PI/2,character.shutters);
  // Low masonry skirting grounds the wall without covering the reserved yard.
  for(const x of [-w/2,w/2])box(body,.06,.22,d,'earth',x,.25,0);
  box(body,w,.22,.06,'earth',0,.25,-d/2);
  const roofGroup=new THREE.Group();roofGroup.name='functional-roof';body.add(roofGroup);
  function pitched(parent,width,depth,rise=1.3){
    const end=gable(parent,width,depth,2.86,rise-.01);end.material=wallMaterial;
    functionalRoof(parent,width+.3,depth+.5,2.85,rise);
  }
  if(character.roof.startsWith('hip'))hipRoof(roofGroup,w+.6,d+.6,2.85,1.3);
  else if(character.roof==='side-gable'){
    const turned=new THREE.Group();turned.rotation.y=Math.PI/2;roofGroup.add(turned);pitched(turned,d,w,character.rise||1.1);
  }else if(character.roof==='twin-gable'){
    for(const [width,x,rise] of [[4,-3,.95],[6,2,1.4]]){
      const wing=new THREE.Group();wing.position.x=x;roofGroup.add(wing);pitched(wing,width,d,rise);
    }
    box(roofGroup,.16,.12,d+.5,'tileDark',-1,2.9,0);
  }else pitched(roofGroup,w,d,character.rise||1.45);
  if(character.roof==='hip-porch'){
    const porch=new THREE.Group();porch.position.set(doorX,0,d/2+.5);body.add(porch);
    leanRoof(porch,2.8,1.2,2.35,2.8);
    for(const x of [-1.2,1.2])box(porch,.13,2.35,.13,'timber',x,1.175,.5);
    for(const x of [-2.3,2.3]){
      box(body,1.3,.1,.45,'timberLight',x,.5,d/2+.35);
      for(const dx of [-.45,.45])box(body,.12,.45,.35,'timber',x+dx,.225,d/2+.35);
    }
  }
  if(id==='house'||id==='home-gable'||id==='home-cottage'||character.hood){
    const hood=new THREE.Group();hood.position.set(doorX,0,d/2+.35);body.add(hood);leanRoof(hood,character.hood||1.7,.9,2.35,2.65);
    for(const side of [-1,1])beam(body,[doorX+side*.7,2,d/2],[doorX+side*.7,2.4,d/2+.6],.07,'timber');
  }
  if(l.verandaDepth) {
    const porchRoot=new THREE.Group();porchRoot.position.x=body.position.x;g.add(porchRoot);
    const front=d/2+l.verandaDepth/2;
    box(porchRoot,w,.12,l.verandaDepth,'stone',0,.06,front-l.verandaDepth/2);
    for(const x of porchPosts)box(porchRoot,.16,2.45,.16,'timber',x,1.285,front-.15);
    if(design)box(porchRoot,w,.18,.18,'timber',0,2.43,front-.15);
    const canopy=new THREE.Group();canopy.position.z=front-l.verandaDepth/2;porchRoot.add(canopy);leanRoof(canopy,w+.4,l.verandaDepth+.4,2.5,2.95);
    box(porchRoot,1.5,.1,.45,'timberLight',-w/2+1.2,.53,front-.5);
    for(const x of [-w/2+.6,-w/2+1.8])box(porchRoot,.12,.48,.38,'timber',x,.24,front-.5);
    for(const side of [-1,1]){
      const railWidth=w/2-1.6;
      box(porchRoot,railWidth,.1,.1,character.shutters,side*(1.4+railWidth/2),.95,front-.15);
      for(let x=1.5;x<w/2-.2;x+=.4)box(porchRoot,.055,.7,.055,'timberLight',side*x,.55,front-.15);
    }
  }
  if(l.terrace){
    box(g,2,.1,d,'stone',w/2,.05,0);
    for(const z of terracePosts)for(const x of [w/2-.8,w/2+.8])box(g,.14,2.5,.14,'timber',x,1.25,z);
    for(const x of [w/2-.8,w/2+.8])box(g,.14,.16,d,'timber',x,2.45,0);
    for(let z=-d/2;z<=d/2;z+=.6)box(g,2.15,.1,.14,'timberLight',w/2,2.58,z);
    box(g,.5,.1,1.8,'timberLight',w/2+.4,.5,-1.5);
    for(const z of [-2.1,-.9])box(g,.4,.45,.12,'timber',w/2+.4,.225,z);
    for(let n=0;n<7;n++)ball(g,.3,'leaf',w/2+.65,2.65+(n%2)*.07,-3+n*.65,[1,.25,1.4],0);
  }
  if(character.roof==='front-gable'){
    box(body,.65,.5,.06,'timber',0,3.35,d/2);
    for(let y=3.18;y<3.6;y+=.1)box(body,.58,.035,.08,'timberLight',0,y,d/2+.04);
  }
  if(id==='home-longhouse'||character.gallery){
    const gallery=new THREE.Group();gallery.position.set(-3,0,d/2+.35);body.add(gallery);
    leanRoof(gallery,5.4,1.1,2.35,2.75);
    for(const x of [-2.5,2.5])box(gallery,.14,2.35,.14,'timber',x,1.175,.4);
    box(gallery,2,.1,.45,'timberLight',-1,.5,.1);
    for(const x of [-1.7,-.3])box(gallery,.12,.45,.35,'timber',x,.225,.1);
  }
  if(id.startsWith('adobe'))for(let x=-w/2+.35;x<w/2;x+=.7)box(body,.1,.12,.5,'timber',x,2.78,d/2-.05);
  if(character.cornerTrim)for(const x of [-w/2+.06,w/2-.06])for(const z of [-d/2+.06,d/2-.06])box(body,.16,2.7,.16,'plaster',x,1.51,z);
  if(character.weatherboard)for(let y=.45;y<1.1;y+=.16){
    for(const side of [-1,1])box(body,.05,.13,d,'timberLight',side*(w/2+.03),y,0);
    box(body,w,.13,.05,'timberLight',0,y,-d/2-.03);
  }
  if(character.flowerBox)for(const x of frontWindows){
    box(body,1.25,.24,.3,'timber',x,.92,d/2+.16);
    for(let n=0;n<5;n++)ball(body,.13,'leaf',x-.45+n*.22,1.1,d/2+.18,[1,.6,1],0);
  }
  if(character.screen && l.verandaDepth){
    const x=body.position.x-w/2+.2,front=d/2+l.verandaDepth/2;
    for(let z=front-l.verandaDepth+.2;z<front;z+=.22)box(g,.07,1.6,.07,'timberLight',x,1.1,z);
    for(const y of [.3,1.9])box(g,.12,.1,l.verandaDepth-.2,'timber',x,y,front-l.verandaDepth/2);
  }
  // An entrance herb pot and wall-mounted light make the threshold legible.
  const potX=doorX+1.1,potZ=d/2+.3;
  cylinder(body,.23,.17,.4,'tile',potX,.2,potZ,8);
  for(let n=0;n<5;n++)ball(body,.16,'leaf',potX+Math.sin(n*2.4)*.12,.5+(n%2)*.08,potZ+Math.cos(n*2.4)*.12,[1,.8,1],0);
  box(body,.13,.25,.14,'timber',doorX-.8,2.1,d/2+.1);
  box(body,.1,.16,.15,'plaster',doorX-.8,2.1,d/2+.14);
  return g;
}
